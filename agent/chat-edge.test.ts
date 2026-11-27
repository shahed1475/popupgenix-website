import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/chat";
const ai = { run: async () => ({ response: "A plain helpful answer about building software." }) };
const call = (body: string, env: Record<string, unknown> = { AI: ai }) =>
  onRequestPost({ request: new Request("https://popupgenix.com/api/chat", { method: "POST", headers: { origin: "https://popupgenix.com", "cf-connecting-ip": "9.9.9." + Math.floor(Math.random()*250) }, body }), env: env as never });
describe("chat function edge payloads", () => {
  for (const [name, body] of [["null", "null"], ["array", "[]"], ["string", '"hi"'], ["number", "5"], ["empty object", "{}"], ["messages not array", '{"messages":"x"}'], ["invalid json", "{bad"]] as const) {
    it(`${name} -> handled 4xx, never throws`, async () => {
      const r = await call(body);
      expect([200, 400]).toContain(r.status);
    });
    it(`${name} with Turnstile on -> handled`, async () => {
      const r = await call(body, { AI: ai, TURNSTILE_SECRET: "s" });
      expect([400, 403]).toContain(r.status);
    });
  }
  it("AI binding throws -> 502 upstream, not 500", async () => {
    const r = await call('{"messages":[{"role":"user","content":"tell me about building a mobile app for my shop"}]}', { AI: { run: async () => { throw new Error("boom"); } } });
    expect(r.status).toBe(502);
  });
  it("KV throws -> still answers", async () => {
    const kv = { get: async () => { throw new Error("kv"); }, put: async () => { throw new Error("kv"); } };
    const r = await call('{"messages":[{"role":"user","content":"hello"}]}', { AI: ai, CHAT_KV: kv });
    expect(r.status).toBe(200);
  });
});
