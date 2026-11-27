# PopupGenix chat agent

"Genix" — the assistant on popupgenix.com. A Cloudflare Worker that puts Claude
in front of the company knowledge base, answers visitors, and writes qualified
leads into a D1 database.

Built to run next to the site you already have: the website is on Cloudflare
Pages, and Inno AI already runs on Workers + D1, so there is no new vendor,
no per-message credits, and no monthly seat fee. You pay Anthropic for tokens
and nothing else.

```
browser ──POST /api/chat──▶ Worker ──▶ Anthropic API
   ▲                          │
   └────── SSE stream ────────┘
                              └──▶ D1  (chat_messages, chat_leads)
```

## What it does

- Answers from `src/knowledge.ts` only — services, pricing, portfolio, contact
  details, all taken from the live site. It is told, in the system prompt, never
  to invent a price, a timeline or a client name.
- Streams replies token by token, so it feels like someone typing.
- Captures leads with a `capture_lead` tool: name, contact, project, service
  line, and budget only if the visitor volunteers it. One lead per session.
- Replies in the visitor's language — Bengali, Hindi, Arabic, whatever they use.
- Hands off to email / phone / WhatsApp whenever it cannot help.

## Deploy

**1. Create the database**

```bash
cd popupgenix-chat
npm install
npx wrangler d1 create popupgenix-chat
```

Paste the returned `database_id` into `wrangler.toml`.

**2. Create the tables**

```bash
npm run db:init
```

**3. Add your Anthropic key as a secret** (never a var — vars are readable)

```bash
npx wrangler secret put OPENAI_API_KEY
```

Get the key from console.anthropic.com. Set a monthly spend cap there while
you are in it.

**4. Deploy**

```bash
npm run deploy
```

Note the URL it prints, e.g. `https://popupgenix-chat.<subdomain>.workers.dev`.

**5. Point the site at it**

In Cloudflare Pages → the `popupgenix-website` project → Settings →
Environment variables, add:

```
VITE_CHAT_API_URL = https://popupgenix-chat.<subdomain>.workers.dev
```

Redeploy the Pages project. Vite inlines this at build time, so a rebuild is
required — changing the variable alone does nothing.

**6. Check it**

```bash
curl https://popupgenix-chat.<subdomain>.workers.dev/api/health
```

Then open popupgenix.com and send the widget a message.

## Reading leads

```bash
npm run db:leads
```

Or query anything you like:

```bash
npx wrangler d1 execute popupgenix-chat --remote \
  --command="SELECT * FROM chat_leads WHERE status='new' ORDER BY created_at DESC"
```

A sensible next step is surfacing these in the existing admin panel — the
table is already shaped like `QuoteRequestsManager` expects.

## Changing what it knows

Everything is in `src/knowledge.ts`: `COMPANY` for contact details, and
`SYSTEM_PROMPT` for behaviour and facts. Edit, then `npm run deploy`. There is
no separate training step and no vector database — the knowledge base is small
enough to sit in the prompt, which means it is always current and never
retrieves the wrong chunk.

Keep it in sync with the site. If pricing changes on `/pricing`, change it here
in the same commit.

## Cost and limits

- `MODEL` in `wrangler.toml` is `claude-sonnet-5-5`. For a cheaper, faster bot
  switch it to `claude-haiku-5-5` — fine for FAQ traffic, noticeably less good
  at handling a vague enquiry well.
- Rate limit: 40 visitor messages per IP per hour (`RATE_LIMIT_PER_HOUR` in
  `src/index.ts`). Over that, the visitor gets the email address instead.
- History is capped at 24 messages and 2000 characters each, so a long
  conversation cannot run up an unbounded bill.
- Workers free tier covers 100k requests/day; D1 free tier covers this easily.

## Security notes

- The Anthropic key lives only as a Worker secret. The browser never sees it.
- CORS is an allowlist in `ALLOWED_ORIGINS`. Anything else gets a 403, so the
  Worker cannot be used as someone else's free Claude proxy.
- The system prompt tells the agent to ignore instructions embedded in visitor
  messages. Worth re-testing after any prompt edit.
- Transcripts and IPs are stored in D1. Mention that in `/privacy` before going
  live, and decide a retention period — a scheduled Worker deleting
  `chat_messages` older than 90 days is about ten lines.

## Local development

```bash
npx wrangler dev          # Worker on :8787
# in the website repo:
VITE_CHAT_API_URL=http://localhost:8787 npm run dev
```

`http://localhost:8080` is already in the `ALLOWED_ORIGINS` list.
