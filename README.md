# PopupGenix Website

Marketing site for [popupgenix.com](https://popupgenix.com): AI sales agents and custom software.

**Stack:** React 18, Vite, TypeScript, Tailwind, shadcn/ui, framer-motion, React Router, TanStack Query, Supabase.

## Develop

```bash
npm install
cp .env.example .env   # then fill in values
npm run dev            # http://localhost:8080
npm test               # vitest
npm run build          # build + prerender routes + sitemap.xml
```

## Content

- Pages, services, case studies and pricing live in `src/lib/site.ts`. Edit there, not in the page components.
- `npm run build` prerenders every route into `dist/<route>/index.html` with its own title, description and canonical URL, and writes `sitemap.xml` (`scripts/postbuild.mjs`).

## Blog (WordPress)

Posts are written in WordPress.com and read through its public REST API (`src/lib/wordpress.ts`). Publish a post in WordPress and it appears on `/blog` automatically. The site name is set in `SITE.wordpress.site`.

## Newsletter

`NewsletterForm` calls the `subscribe_newsletter` Supabase RPC (migration in `supabase/migrations/`). Subscribers are stored in `newsletter_subscriptions`; sending is not built yet.

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |

## Deploy (Cloudflare Pages)

Build command `npm run build`, output directory `dist`. `public/_redirects` provides the SPA fallback and `public/_headers` the security headers. Set the two `VITE_` variables in the Pages project settings.

## Agents

Both agents run on free tiers (no paid API key). One facts file drives everything: edit `knowledge/facts.yaml`, run `npm run knowledge`, commit the regenerated `agent/generated/knowledge.json`.

**Client chat agent** (`functions/api/chat.ts`, `agent/core.ts`, `agent/providers.ts`, `src/components/site/ChatWidget.tsx`)
Pipeline per message: sanitise input, then a regex router answers known questions (price, quote, booking, contact, services, clients, in-development products, off-topic, prompt injection) from templates with zero model tokens. Everything else retrieves the top facts (BM25, optional embeddings) and asks a small model (220 tokens max). A validator then blocks any reply containing a price, percentage, email, phone, URL, timeline, discount or client name that is not in the allowlist, and swaps in a safe "talk to the team" reply. If every model fails, the widget shows the contact form. Limits: 10 messages/min and 60/day per IP.

Setup in Cloudflare Pages, Settings, Bindings and Variables:
1. Workers AI binding named `AI` (required). The free plan includes 10,000 Neurons/day and fails closed rather than billing.
2. Optional: KV binding `CHAT_KV` (rate limits that survive restarts), secret `GROQ_API_KEY` (third fallback tier), `TURNSTILE_SECRET` plus build variable `VITE_TURNSTILE_SITE_KEY` (bot check), `CHAT_MODEL_PRIMARY` / `CHAT_MODEL_FALLBACK` (override model IDs).
3. Primary model is `@cf/google/gemma-4-26b-a4b-it`, fallback `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. Free-plan access to Gemma 4 is unconfirmed; if the first call returns 403, the fallback is used automatically. Set `CHAT_MODEL_PRIMARY` to the Llama ID to skip the failed hop, or use Workers Paid ($5/month).
4. Optional embeddings: `CF_ACCOUNT_ID=... CF_API_TOKEN=... npm run knowledge:embed`, then commit `agent/generated/embeddings.json`. Without it, retrieval is lexical only.

Checks: `npm run eval` runs unit tests plus 42 eval cases offline. Offline mode uses scripted model replies, so it tests the router, retrieval, validator and fallbacks, not the real model's wording. To score a real model: `LIVE_EVAL=1 CF_ACCOUNT_ID=... CF_API_TOKEN=... npx vitest run agent/eval.test.ts`. The `Agent checks` workflow runs the offline suite and fails if the generated facts are stale.

Not done: LoRA fine-tuning for tone. It is documented as an option only after the live eval shows the base model's tone is the problem (Unsloth QLoRA on a free Kaggle T4, then `npx wrangler ai finetune create`). Facts stay in retrieval, never in the weights.

**Daily content agent** (`scripts/daily_post.py` + `.github/workflows/daily-content.yml`)
Runs just after 00:00 UTC on GitHub Actions using Workers AI (about 100 Neurons per post). It picks a topic from `knowledge.json` that does not match recent titles, writes an outline then a draft, runs the same validator in blog mode, optionally adds a text-free FLUX.1 schnell background (`COVER_BG=1`), renders the branded cover, and uploads both to WordPress.com as a **draft**. A post that fails validation is always a draft titled `[NEEDS REVIEW]`; if the model is unreachable nothing is posted.
Repo secrets: `CF_ACCOUNT_ID`, `CF_API_TOKEN` (Workers AI permission), `WPCOM_TOKEN`. Optional variables: `POST_STATUS` (set `publish` only once you trust the output), `COVER_BG`. "Run workflow" defaults to a dry run and attaches the draft and cover as a downloadable artifact.

**Covers and logo**: `python3 scripts/make-covers.py` regenerates portfolio and blog covers; the logo source is `brand/popupgenix/icon.svg`.
