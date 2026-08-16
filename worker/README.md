# B2B Growth Engine — Worker

Standalone Node/TypeScript package holding the B2B Growth Engine's AI provider
abstraction (`AIProvider`, `MockAIProvider`, `ClaudeAIProvider`). Fully isolated from the
main Vite app under `src/` — nothing in this package is ever bundled into the browser,
and `src/` never imports from here.

## Run tests (no API key needed)

```
npm install
npm test
```

`MockAIProvider` is the default and requires no configuration or network access — the
whole test suite runs offline.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AI_PROVIDER` | no | `mock` | `mock` or `claude` |
| `ANTHROPIC_API_KEY` | only if `AI_PROVIDER=claude` | — | never hard-coded anywhere in code |
| `ANTHROPIC_MODEL` | only if `AI_PROVIDER=claude` | — | no default is assumed; startup fails with a clear `AIProviderConfigError` if missing |
| `ANTHROPIC_EFFORT` | no | `medium` | one of `low`, `medium`, `high`, `xhigh`, `max` |

Copy `.env.example` to `.env` and fill in values to enable Claude.

## Switching to Claude later

1. Set `AI_PROVIDER=claude`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL` (e.g.
   `claude-opus-5`) in the environment.
2. `createAIProvider()` will construct a `ClaudeAIProvider` instead of a
   `MockAIProvider` automatically — no other code changes are needed, because all
   business logic only ever depends on the `AIProvider` interface, never on either
   implementation directly.

## Running the research task

`npm run task:research` claims up to `WORKER_RESEARCH_BATCH_SIZE` pending `agent_tasks`
rows of type `research`, gathers company intelligence via the configured `AIProvider`, and
writes the result to the `research` table (plus an `agent_runs` log row and the lead's
status transition to `researching`). It's a one-shot script — run it on a cron schedule
(e.g. every 5 minutes), not as a long-running daemon.

Requires `WORKER_DATABASE_URL` (see `.env.example`) in addition to the `AI_PROVIDER`
variables above. `npm run task:research:dev` runs it directly from TypeScript via `tsx`
for local testing; `npm run build && npm run task:research` is the production path.
