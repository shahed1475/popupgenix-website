// Cloudflare Pages Function: POST /api/chat
// Free-tier chat agent for popupgenix.com. Runs on Cloudflare Workers AI (10,000 free
// Neurons a day) with a deterministic layer around the model: intent templates for
// prices and contact details, retrieval from knowledge/facts.yaml, and an output
// validator that blocks any price, client, date or link that is not in the facts.
//
// Setup (Cloudflare Pages > Settings):
//   Bindings:   Workers AI -> variable name AI            (required)
//               KV namespace -> CHAT_KV                    (optional, durable rate limits)
//   Secrets:    GROQ_API_KEY       (optional third fallback tier)
//               TURNSTILE_SECRET   (optional; also set VITE_TURNSTILE_SITE_KEY at build)
// Without the AI binding the widget falls back to the contact form, so the site never breaks.

import { handleChat } from "../../agent/core";
import { ORIGIN_OK, buildTiers, makeEmbedder, rateLimited, turnstileOk, type Env } from "../../agent/providers";
import knowledge from "../../agent/generated/knowledge.json";
import embeddings from "../../agent/generated/embeddings.json";
import type { Knowledge } from "../../agent/core";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const origin = request.headers.get("origin") ?? "";
  if (origin && !ORIGIN_OK.test(origin)) return json({ error: "forbidden" }, 403);

  const tiers = buildTiers(env);
  if (!tiers.length) return json({ error: "not_configured" }, 503);

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = await rateLimited(ip, env.CHAT_KV);
  if (limit) return json({ error: "rate_limited", scope: limit }, 429);

  let payload: { messages?: unknown; turnstileToken?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "bad_request" }, 400);

  if (env.TURNSTILE_SECRET && !(await turnstileOk(env.TURNSTILE_SECRET, payload.turnstileToken, ip))) {
    return json({ error: "bot_check_failed" }, 403);
  }

  const k = knowledge as unknown as Knowledge;
  const result = await handleChat(payload, {
    knowledge: k,
    tiers,
    embed: makeEmbedder(env, k, embeddings as unknown as { hash?: string; model?: string | null; vectors?: Record<string, number[]> }),
    // Structured log line (no message text, no IP): which route and model tier answered.
    log: (e) => console.log(JSON.stringify({ chat: e })),
  });

  if (!result.ok) {
    if (result.error === "bad_request") return json({ error: "bad_request" }, 400);
    console.log(JSON.stringify({ chat: { route: "unavailable", attempts: result.attempts } }));
    return json({ error: "upstream" }, 502);
  }
  return json({ reply: result.reply, handoff: result.handoff, tier: result.tier ?? result.route });
};
