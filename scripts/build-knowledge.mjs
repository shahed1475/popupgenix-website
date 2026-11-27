// Compiles knowledge/facts.yaml into agent/generated/knowledge.json:
// retrieval chunks, the validator allowlist and the deterministic reply templates.
// Runs with no network. `npm run build` calls it first, so a facts edit ships on deploy.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "knowledge/facts.yaml"), "utf8");
const f = YAML.parse(src);

const clean = (s) => String(s).replace(/\s+/g, " ").trim();
const need = (cond, msg) => {
  if (!cond) {
    console.error(`facts.yaml: ${msg}`);
    process.exit(1);
  }
};

need(f.pricing?.starter?.price === "$500", "pricing.starter.price must be $500 (allowlist and templates depend on it)");
need(f.contact?.email && f.contact?.phone, "contact.email and contact.phone are required");
for (const s of [...f.services, ...f.case_studies, ...f.faq, ...f.process, ...f.objections]) {
  need(s.id && s.text && Array.isArray(s.keywords), `entry ${s.id ?? JSON.stringify(s).slice(0, 40)} needs id, text and keywords`);
}

// Retrieval chunks. Each is a short, self-contained fact the model may rely on.
const chunks = [
  {
    id: "company",
    kind: "company",
    title: "About PopupGenix",
    keywords: ["popupgenix", "company", "who", "about", "studio", "founder", "albuquerque", "services", "offer", "do"],
    text: clean(f.company.summary),
  },
  {
    id: "pricing",
    kind: "pricing",
    title: "Pricing",
    keywords: ["price", "pricing", "cost", "costs", "how much", "rate", "fee", "fees", "quote", "budget", "plan", "plans", "monthly", "starter", "enterprise", "cheap", "expensive", "afford"],
    text: clean(
      `Starter is ${f.pricing.starter.price} ${f.pricing.starter.cadence}: ${f.pricing.starter.what} ` +
        `Project work is a ${f.pricing.project.price.toLowerCase()}: ${f.pricing.project.what} ` +
        `Enterprise is ${f.pricing.enterprise.price.toLowerCase()}: ${f.pricing.enterprise.what} ` +
        `No other price is published.`,
    ),
  },
  {
    id: "contact",
    kind: "contact",
    title: "Contact",
    keywords: ["contact", "email", "phone", "call", "reach", "talk", "speak", "human", "person", "whatsapp", "book", "meeting", "consultation"],
    text: clean(
      `Email ${f.contact.email}, phone ${f.contact.phone}, or the contact form at ${f.contact.form_path}. ` +
        `Replies come ${f.contact.reply_time.toLowerCase()}.`,
    ),
  },
  ...f.services.map((s) => ({ id: `service-${s.id}`, kind: "service", title: s.name, keywords: s.keywords, text: `${s.name}: ${clean(s.text)}` })),
  ...f.process.map((p) => ({ id: p.id, kind: "process", title: "Process", keywords: p.keywords, text: clean(p.text) })),
  ...f.case_studies.map((c) => ({
    id: c.id,
    kind: "case",
    title: c.name,
    keywords: c.keywords,
    text: `${clean(c.text)} Status: ${c.status}.${c.url ? ` Link: ${c.url}` : ""}`,
  })),
  ...f.faq.map((q) => ({ id: q.id, kind: "faq", title: "FAQ", keywords: q.keywords, text: clean(q.text) })),
  ...f.objections.map((o) => ({ id: o.id, kind: "objection", title: "Guidance", keywords: o.keywords, text: clean(o.text) })),
];
const ids = new Set();
for (const c of chunks) {
  need(!ids.has(c.id), `duplicate id ${c.id}`);
  ids.add(c.id);
}

// Allowlist for the output validator (lowercased where matching is case-insensitive).
const allow = {
  prices: f.allow.prices,
  years: f.allow.years,
  durations: f.allow.durations.map((d) => d.toLowerCase()),
  emails: f.allow.emails.map((e) => e.toLowerCase()),
  phoneDigits: f.allow.phones.map((p) => String(p).replace(/\D/g, "")),
  domains: f.allow.domains.map((d) => d.toLowerCase()),
  names: [...f.allow.names, ...f.allow.tech, ...f.services.map((s) => s.name), "Starter", "Enterprise"],
  clientNames: f.case_studies.map((c) => c.name),
};

const live = f.case_studies.filter((c) => c.status !== "In development");
const dev = f.case_studies.filter((c) => c.status === "In development");
const list = (a) => a.map((c) => c.name).join(", ");
const booking = f.contact.booking_url
  ? `You can book a call at ${f.contact.booking_url}, or use the contact form at ${f.contact.form_path}.`
  : `The fastest way to book a call is the contact form at ${f.contact.form_path}, or email ${f.contact.email}.`;

// Deterministic replies. The model never writes prices, contact details or client lists.
const templates = {
  price:
    `Our Starter plan is ${f.pricing.starter.price} ${f.pricing.starter.cadence}: ongoing development and automation hours for small teams. ` +
    `Anything bigger, such as an AI agent, a portal or a custom platform, is a custom quote after a short call and a written scope. ` +
    `Want me to point you to the contact form so a person can scope it?`,
  discount:
    `I can't offer discounts or change prices. The published price is ${f.pricing.starter.price} ${f.pricing.starter.cadence} for Starter, and project work is a custom quote. ` +
    `A person on the team can talk through your budget: ${f.contact.form_path} or ${f.contact.email}.`,
  contact: `You can reach the team at ${f.contact.email} or ${f.contact.phone}, or use the contact form at ${f.contact.form_path}. Replies come ${f.contact.reply_time.toLowerCase()}.`,
  booking,
  clients:
    `I can only speak about work PopupGenix has actually built. Live or built: ${list(live)}. In development and not yet public: ${list(dev)}. ` +
    `I can't say anything about other clients or projects.`,
  inDevelopment: `${list(dev)} are still in development and not public yet, so I can't describe them as finished products. The projects you can see today are ${list(live)}.`,
  greeting: `Hi, I'm PopupGenix's AI assistant. I can explain what we build and pass your enquiry to the founder, Abdullah. If you'd rather talk to a person, just say so.`,
  identity: `No, I'm an AI assistant, not a person. I can explain what PopupGenix builds; a person on the team replies to quotes, timelines and contracts: ${f.contact.email}.`,
  quote:
    `A quote needs a person, so I can't promise a price, date or scope. Share a few details about what you need through ${f.contact.form_path} ` +
    `(or email ${f.contact.email}) and the team will reply ${f.contact.reply_time.toLowerCase()}.`,
  injection: `I can only help with questions about PopupGenix, our services and how we work, and I can't change how I operate. What are you trying to build or fix?`,
  offtopic: `I can only help with PopupGenix, software, AI and automation questions. If you tell me what you are trying to build or fix, I'll point you in the right direction.`,
  blocked: `I want to be sure you get accurate information on that, so please check with the team directly: ${f.contact.form_path} or ${f.contact.email}.`,
  unavailable: `The assistant is unavailable right now. Please use the contact form at ${f.contact.form_path} or email ${f.contact.email}.`,
};
templates.services =
  `PopupGenix builds: ${f.services.map((s) => s.name).join(", ")}. Which of these is closest to what you need?`;

const hash = createHash("sha256").update(src).digest("hex").slice(0, 16);
const out = {
  hash,
  chunks,
  allow,
  templates,
  topics: f.topics,
  stats: f.stats,
  brand: { name: f.company.name, positioning: f.positioning, forbidden: f.forbidden_claims },
};

const dest = resolve(root, "agent/generated/knowledge.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`knowledge: ${chunks.length} chunks, hash ${hash} -> agent/generated/knowledge.json`);
