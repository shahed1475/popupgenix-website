// Optional: precompute embeddings so the chat function can do semantic retrieval
// (helps non-English questions). Without this file the agent uses lexical retrieval.
//   CF_ACCOUNT_ID=... CF_API_TOKEN=... npm run knowledge:embed
// Cost: one batch of ~32 short texts, a fraction of one day's free Neurons.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error("Set CF_ACCOUNT_ID and CF_API_TOKEN (token needs Workers AI permission).");
  process.exit(1);
}
const MODEL = "@cf/baai/bge-m3";
const k = JSON.parse(readFileSync(resolve(root, "agent/generated/knowledge.json"), "utf8"));
const texts = k.chunks.map((c) => `${c.title}. ${c.text}`.slice(0, 1500));

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`, {
  method: "POST",
  headers: { authorization: `Bearer ${CF_API_TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify({ text: texts }),
});
const body = await res.json().catch(() => ({}));
const data = body?.result?.data;
if (!res.ok || !Array.isArray(data) || data.length !== texts.length) {
  console.error("Embedding failed:", res.status, JSON.stringify(body?.errors ?? body).slice(0, 300));
  process.exit(1);
}
const vectors = Object.fromEntries(k.chunks.map((c, i) => [c.id, data[i].map((x) => Math.round(x * 1e4) / 1e4)]));
writeFileSync(resolve(root, "agent/generated/embeddings.json"), JSON.stringify({ hash: k.hash, model: MODEL, vectors }) + "\n");
console.log(`embedded ${texts.length} chunks for facts hash ${k.hash}`);
