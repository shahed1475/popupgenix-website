// Runs the same output validator the chat function uses over a blog draft.
// stdin: {"text": "...", "mode": "blog"}   stdout: {"ok": bool, "reasons": [...]}
// Needs `npm run agent:bundle` first (bundles agent/core.ts with esbuild).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { validate } = await import(resolve(root, "agent/generated/core.mjs"));
const k = JSON.parse(readFileSync(resolve(root, "agent/generated/knowledge.json"), "utf8"));
const input = JSON.parse(readFileSync(0, "utf8"));
const factText = k.chunks.map((c) => `${c.title} ${c.text}`).join(" ");
const v = validate(String(input.text ?? ""), k.allow, factText, { mode: input.mode === "chat" ? "chat" : "blog" });
process.stdout.write(JSON.stringify({ ok: v.ok, reasons: v.reasons }));
