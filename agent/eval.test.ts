// Evaluation set for the chat agent (48 cases). Scored with regex and exact matches, never
// with another model. It runs in CI on every change to the facts or the agent code.
//
// Offline mode (default): llm-route cases use the `stub` as a scripted model reply, so the
// suite checks the deterministic layers (router, retrieval, validator, handoff). Cases with a
// bad stub prove the validator catches a misbehaving model.
//
// Live mode: LIVE_EVAL=1 CF_ACCOUNT_ID=... CF_API_TOKEN=... npx vitest run agent/eval.test.ts
// replaces the stubs with the real Workers AI model and applies the same expectations.

import { describe, expect, it } from "vitest";
import cases from "./eval/cases.json";
import knowledge from "./generated/knowledge.json";
import { handleChat, validate, type Knowledge, type ModelTier } from "./core";
import { MODELS } from "./providers";

const k = knowledge as unknown as Knowledge;

interface Case {
  id: string;
  category: string;
  input: string;
  stub?: string;
  expect: {
    route: "template" | "llm" | "blocked";
    intent?: string;
    handoff?: boolean;
    retrieved?: string[];
    replyMatches?: string[];
    replyNotMatches?: string[];
  };
}
const ALL = cases as Case[];
const ALL_FACTS = k.chunks.map((c) => `${c.title} ${c.text}`).join(" ");
const LIVE = process.env.LIVE_EVAL === "1" && process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN;

function liveTier(): ModelTier {
  return {
    name: "live",
    async run(messages) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${process.env.CHAT_MODEL_PRIMARY || MODELS.primary}`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CF_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messages, max_tokens: 220, temperature: 0.2 }),
      });
      if (!res.ok) throw new Error(`cf ${res.status}`);
      const data = (await res.json()) as { result?: { response?: string; choices?: { message?: { content?: string } }[] } };
      return data.result?.response ?? data.result?.choices?.[0]?.message?.content ?? "";
    },
  };
}

describe("eval set size and coverage", () => {
  it("has at least 40 cases across all required categories", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(40);
    const by = (c: string) => ALL.filter((x) => x.category === c).length;
    expect(by("price")).toBeGreaterThanOrEqual(8);
    expect(by("client")).toBeGreaterThanOrEqual(6);
    expect(by("service")).toBeGreaterThanOrEqual(8);
    expect(by("injection")).toBeGreaterThanOrEqual(6);
    expect(by("offtopic")).toBeGreaterThanOrEqual(4);
    expect(by("handoff")).toBeGreaterThanOrEqual(4);
    expect(by("multilingual")).toBeGreaterThanOrEqual(4);
  });
});

describe(LIVE ? "chat agent eval (LIVE model)" : "chat agent eval (offline, scripted model)", () => {
  for (const c of ALL) {
    // Live mode skips the cases whose point is a scripted bad model reply.
    const scriptedBad = c.expect.route === "blocked" && !!c.stub;
    const run = LIVE && scriptedBad ? it.skip : it;
    run(`${c.category}/${c.id}: ${c.input.slice(0, 50)}`, async () => {
      const tier: ModelTier = LIVE ? liveTier() : { name: "stub", run: async () => c.stub ?? "" };
      const r = await handleChat({ messages: [{ role: "user", content: c.input }] }, { knowledge: k, tiers: [tier] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // Invariant for every case: whatever the visitor sees passes the validator.
      expect(validate(r.reply, k.allow, ALL_FACTS).ok, `reply failed validation: ${r.reply}`).toBe(true);

      expect(r.route).toBe(c.expect.route);
      if (c.expect.intent) expect(r.intent).toBe(c.expect.intent);
      if (c.expect.handoff !== undefined) expect(r.handoff).toBe(c.expect.handoff);
      for (const id of c.expect.retrieved ?? []) expect(r.retrieved).toContain(id);
      for (const re of c.expect.replyMatches ?? []) expect(r.reply).toMatch(new RegExp(re, "i"));
      for (const re of c.expect.replyNotMatches ?? []) expect(r.reply).not.toMatch(new RegExp(re, "i"));
    });
  }
});
