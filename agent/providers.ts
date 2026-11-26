// Model providers, rate limiting and bot protection for the chat function.
// Model IDs are pinned here in one place: Cloudflare retires models often (several
// were removed on 2026-11-20), so a retirement should degrade to the next tier, not break chat.

import { LIMITS, cosine, type Knowledge, type ModelTier } from "./core";

export const MODELS = {
  primary: "@cf/google/gemma-4-26b-a4b-it",
  fallback: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
  embed: "@cf/baai/bge-m3",
  groq: "openai/gpt-oss-20b",
} as const;

export interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
export interface Env {
  AI?: AiBinding;
  CHAT_KV?: KvLike;
  GROQ_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  CHAT_MODEL_PRIMARY?: string;
  CHAT_MODEL_FALLBACK?: string;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

/** Workers AI models return `{response}` or an OpenAI-style `{choices:[{message:{content}}]}`. */
export function extractText(r: unknown): string {
  const o = r as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const candidate = o?.response ?? o?.choices?.[0]?.message?.content ?? o?.result?.response ?? o?.output_text ?? "";
  return typeof candidate === "string" ? candidate : "";
}

export function workersAiTier(ai: AiBinding, model: string, name: string): ModelTier {
  return {
    name,
    async run(messages: Msg[]) {
      const out = extractText(await ai.run(model, { messages, max_tokens: LIMITS.maxTokens, temperature: LIMITS.temperature }));
      if (!out.trim()) throw new Error("empty");
      return out;
    },
  };
}

export function groqTier(key: string): ModelTier {
  return {
    name: "groq",
    async run(messages: Msg[]) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODELS.groq, messages, max_tokens: LIMITS.maxTokens, temperature: LIMITS.temperature }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`groq ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = data.choices?.[0]?.message?.content ?? "";
      if (!out.trim()) throw new Error("empty");
      return out;
    },
  };
}

export function buildTiers(env: Env): ModelTier[] {
  const tiers: ModelTier[] = [];
  if (env.AI) {
    tiers.push(workersAiTier(env.AI, env.CHAT_MODEL_PRIMARY || MODELS.primary, "workers-ai-primary"));
    tiers.push(workersAiTier(env.AI, env.CHAT_MODEL_FALLBACK || MODELS.fallback, "workers-ai-fallback"));
  }
  if (env.GROQ_API_KEY) tiers.push(groqTier(env.GROQ_API_KEY));
  return tiers;
}

/** Semantic retrieval is optional: it only activates when build-time embeddings match the facts hash. */
export function makeEmbedder(env: Env, knowledge: Knowledge, emb: { hash?: string; model?: string | null; vectors?: Record<string, number[]> } | undefined) {
  if (!env.AI || !emb?.vectors || emb.hash !== knowledge.hash || !Object.keys(emb.vectors).length) return undefined;
  const ai = env.AI;
  const byId = emb.vectors;
  return async (q: string) => {
    const r = (await ai.run(emb.model || MODELS.embed, { text: [q.slice(0, 500)] })) as { data?: number[][] };
    const query = r?.data?.[0];
    return query ? { query, byId } : null;
  };
}
export { cosine };

// ---------- rate limiting: 10 per minute and 60 per day per IP ----------

const mem = new Map<string, { n: number; exp: number }>();

async function bump(kv: KvLike | undefined, key: string, ttl: number): Promise<number> {
  const now = Date.now();
  if (kv) {
    try {
      const n = Number((await kv.get(key)) ?? 0) + 1;
      await kv.put(key, String(n), { expirationTtl: ttl });
      return n;
    } catch {
      /* KV unavailable: use the in-memory counter */
    }
  }
  if (mem.size > 5000) for (const [k, v] of mem) if (v.exp < now) mem.delete(k);
  const rec = mem.get(key);
  if (!rec || rec.exp < now) {
    mem.set(key, { n: 1, exp: now + ttl * 1000 });
    return 1;
  }
  rec.n += 1;
  return rec.n;
}

export async function rateLimited(ip: string, kv?: KvLike, now = Date.now()): Promise<"minute" | "day" | null> {
  const minute = Math.floor(now / 60000);
  const day = new Date(now).toISOString().slice(0, 10);
  if ((await bump(kv, `rl:m:${ip}:${minute}`, 120)) > 10) return "minute";
  if ((await bump(kv, `rl:d:${ip}:${day}`, 90000)) > 60) return "day";
  return null;
}

// ---------- Cloudflare Turnstile (optional: enforced only when TURNSTILE_SECRET is set) ----------

export async function turnstileOk(secret: string, token: unknown, ip: string): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export const ORIGIN_OK = /^https:\/\/(www\.)?popupgenix\.com$|^https:\/\/[a-z0-9-]+\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
