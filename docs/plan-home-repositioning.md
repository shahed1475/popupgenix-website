# Plan: reposition PopupGenix as an AI and custom software studio

Source: `reports/AI ML software studio positioning.md` (research) and the owner's request of 2026-11-27: the home page reads as "leads and marketing only", but PopupGenix builds many kinds of AI/ML products plus custom software.
Format note: no `.planr/` folder exists in this repo, so this follows the Planr story/task shape (stories with AC IDs, tasks mapped to ACs) as a plain doc.

## Decisions (made on the research, flagged where the owner can overrule)

- Headline: "We build AI products and the software around them." CTAs: "Talk about your project" / "See what we've built".
- Lead generation becomes one product (AutoLead Manager / HOM) and one service line (AI sales agents). It stops being the brand.
- Claim boundary: no "machine learning company", computer vision, model training, MLOps or voice-agent claims. Predictive analytics is mentioned only next to Klevere AI.
- Statuses come from `knowledge/facts.yaml` unchanged. Inno AI and the AI Sales Employee stay "In development". No invented stats, clients, prices (only Starter $500/month), dates or awards.
- Static hero visual (a product board built from `CASE_STUDIES`), replacing the fake sales-chat mock and anything heavy.
- Not done here, needs the owner: real screenshots/founder photo, booking link, brand email, what Starter includes, product roles and public status.

## US-1 Home page tells the AI + software story

- AC-1: Above the fold states the studio builds AI products and custom software; no "never lose a lead" line anywhere on the page.
- AC-2: Sections in order: hero, fact strip, what we build (AI first), products (built, then in development), how we work, engagement/pricing, AI questions (FAQ), newsletter, CTA.
- AC-3: Every number on the page is derived from `SITE`/`CASE_STUDIES`/`PRICING` data; in-development products are labelled and never counted as built.
- AC-4: Page renders at 375 px and 1280 px with no horizontal overflow and no console errors.
- T-1 (UI) Rebuild `src/pages/Index.tsx`. Refs AC-1..AC-4.

## US-2 Site-wide copy matches the new positioning

- AC-1: `SITE.tagline`/`description`, home `STATIC_ROUTES` title/description, `index.html` meta and OG tags use the AI + software wording (title about 55 characters).
- AC-2: `SERVICES` lead with AI and automation and custom software; AI sales agents stay as one service among the others.
- AC-3: About, Services and footer copy carry no lead-gen-only framing.
- T-2 (Tech) Edit `src/lib/site.ts`, `index.html`, `About.tsx`, `Services.tsx`, `CtaBand`/footer copy. Refs AC-1..AC-3.

## US-3 Chat agent and daily agent speak the same positioning

- AC-1: `knowledge/facts.yaml` company summary, positioning, service order and topics reflect the studio positioning; `npm run knowledge` regenerated and committed.
- AC-2: Chat greeting and identity answers say "AI assistant", describe the studio broadly and hand off to a human for quotes, timelines and contracts.
- AC-3: `scripts/daily_post.py` BRAND prompt and the topic list follow the six clusters in the report; lead-gen topics are at most about one in seven.
- AC-4: Offline eval cases added for the new positioning ("what do you build", "do you do machine learning", "are you a lead generation company", "are you a bot"); all existing tests stay green.
- T-3 (Tech) Update `knowledge/facts.yaml`, regenerate `agent/generated/knowledge.json`, `ChatWidget` greeting, `daily_post.py` BRAND. Refs AC-1..AC-3.
- T-4 (Tech) Add eval cases and tests. Depends on T-3. Refs AC-4.

## US-4 Verified end to end

- AC-1: `vitest run`, `tsc` (app and agent), `eslint` (0 errors) and `npm run build` (prerender of all routes) pass.
- AC-2: Home page viewed in a real browser at desktop and mobile widths; the chat widget opens, answers "what do you build" and offers the human handoff.
- AC-3: Live Workers AI, WordPress and deployed paths cannot be reached from the sandbox and are reported as unverified.
- T-5 (Tech) Run checks and browser review. Depends on T-1..T-4. Refs AC-1..AC-3.

Next: implement in order T-2 (data first, because T-1 reads it), T-1, T-3, T-4, T-5.
