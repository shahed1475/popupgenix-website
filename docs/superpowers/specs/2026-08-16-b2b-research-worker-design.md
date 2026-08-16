# B2B Growth Engine — Research Worker Design

**Goal:** Build the "research" pipeline step of the B2B Growth Engine: a worker script that
claims pending `agent_tasks` rows of type `research`, gathers company-level intelligence
via AI inference, and persists the result — so a `lead` moves from `new` to `researching`
with a populated `research` record.

**Pipeline stages covered (all AI-inferred from existing company data, no paid enrichment
APIs in this phase):** Technology → Revenue Estimate → Employees → Growth → Hiring →
Funding → Pain Points → Buying Signals → AI Summary.

**Relationship to existing work:** Extends the B2B Growth Engine schema from
`docs/superpowers/plans/2026-08-13-b2b-growth-engine-phase1.md` (tables: `companies`,
`leads`, `research`, `agent_tasks`, `agent_runs`) and the AI provider abstraction from
`docs/superpowers/specs/2026-08-13-ai-provider-abstraction-design.md` (`worker/src/ai/`).
No schema migration changes — all tables already exist from Phase 1.

**Non-goals (explicitly out of scope for this spec):**
- Real third-party enrichment APIs (BuiltWith, Crunchbase, Apollo, LinkedIn, etc.) — AI-inferred
  only, for now.
- Qualification, scoring, or outreach — this step only produces `research` records and
  advances `leads.status` to `'researching'`. Later pipeline stages are separate future specs.
- A long-running polling daemon or new deployment container — this ships as a one-shot
  script triggered by cron.
- Any change to the `agent_tasks`/`agent_runs`/`research`/`leads` table schemas — the
  existing Phase 1 schema already supports everything this pipeline needs.

---

## Architecture & data flow

A new script, `worker/src/tasks/runResearchTask.ts`, runnable via `npm run task:research`
in the `worker/` package, invoked on a cron schedule (e.g. every 5 minutes) as a one-shot
process that exits after processing its batch.

1. **Connect to Postgres directly** via `pg`, using a `WORKER_DATABASE_URL` env var. This
   must be a Supabase Postgres connection string for a role with the `BYPASSRLS` attribute
   (e.g. Supabase's `service_role`/direct `postgres` connection, not an `anon`/authenticated
   role) — RLS on these tables is scoped to `auth.uid()`, which has no meaning for an
   automated worker connecting outside Supabase Auth.
2. **Atomically claim a batch** of pending research tasks:
   ```sql
   UPDATE agent_tasks
   SET status = 'claimed', claimed_by = $1, claimed_at = now()
   WHERE id IN (
     SELECT id FROM agent_tasks
     WHERE task_type = 'research' AND status = 'pending' AND scheduled_for <= now()
     ORDER BY priority DESC, scheduled_for ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED
   )
   RETURNING *;
   ```
   `$2` (batch size) defaults to 5, configurable via `WORKER_RESEARCH_BATCH_SIZE`. `FOR UPDATE SKIP LOCKED`
   guarantees two concurrent invocations never claim the same row.
3. **For each claimed task:**
   - Load `lead` (`payload.lead_id`) joined to its `company`.
   - Update `leads.status = 'researching'` (a transition already covered by the existing
     `isValidLeadStatusTransition` guard in `src/b2b/domain/guards.ts`).
   - Mark the task `status = 'in_progress'`, `attempts = attempts + 1`.
   - Call the AI provider (`createAIProvider()` — `mock` in tests/dev, `claude` in
     production) with the reshaped `analyzeCompany` schema, passing company
     name/domain/industry/description as input.
   - On success: insert a `research` row, insert an `agent_runs` row
     (`status='succeeded'`), set `agent_tasks.status='succeeded'`.
   - On failure: insert an `agent_runs` row (`status='failed'`, `error` message). If
     `attempts < max_attempts`, reset `agent_tasks.status='pending'` so it's retried on a
     future run; otherwise `status='failed'`.
   - Each task's success/failure is isolated — one bad task does not stop the batch.
4. Script logs a summary (claimed/succeeded/failed counts) and exits.

## AI schema changes

`worker/src/ai/schemas/analyzeCompany.ts` — output schema reshaped to match the pipeline
stages exactly (nothing in production consumes the current field names yet, so this is a
safe rename, not an addition alongside the old shape):

```ts
export const analyzeCompanyOutputSchema = z.object({
  technology: z.array(z.string()),
  revenueEstimate: z.string().nullable().optional(),
  employees: z.string().nullable().optional(),
  growth: z.string().nullable().optional(),
  hiring: z.array(z.string()),
  funding: z.string().nullable().optional(),
  painPoints: z.array(z.string()),
  buyingSignals: z.array(z.string()),
  aiSummary: nonEmptyString,
  confidence: confidenceSchema,
});
export type AnalyzeCompanyOutput = z.infer<typeof analyzeCompanyOutputSchema>;
```

Field mapping from the old shape: `techStack`→`technology`, `companySizeEstimate`→`employees`,
`fundingStage`→`funding`, `icpFitSignals`→`buyingSignals`, `summary`→`aiSummary`.
`revenueEstimate`, `growth`, `hiring` are new fields with no prior equivalent. The
redundant `industry` output field (input already carries it) is dropped.

Input schema (`analyzeCompanyInputSchema`) is unchanged: `companyName`, `domain`,
`industry`, `description`, `rawContext`.

`MockAIProvider`'s canned `analyzeCompany` response updates to match the new shape (used
by both `analyzeCompany.test.ts` and the research-task integration tests).

## Persistence mapping

Given a successful AI call for `company`:

| Table | Row |
|---|---|
| `research` | `subject_type='company'`, `subject_id=company.id`, `summary=aiSummary`, `findings={technology, revenueEstimate, employees, growth, hiring, funding, painPoints, buyingSignals}`, `confidence`, `source` (`'claude'`/`'mock'`), `created_by='agent'` |
| `agent_runs` | `task_id`, `status`, `provider`, `started_at`/`finished_at`/`duration_ms`, `output` (raw AI JSON), `error` (null on success) |
| `agent_tasks` | `status='succeeded'` |
| `leads` | `status='researching'` (set when the task is claimed, before the AI call) |

On AI/DB failure mid-task: `agent_runs` still gets a `status='failed'` row with the error
message; `agent_tasks.attempts` increments and the task returns to `'pending'` (if attempts
remain) or `'failed'` (if exhausted) — reusing the existing retry columns, no new schema.

## Testing

- **Unit:** `analyzeCompany.test.ts` updated for the new output shape.
- **Integration (real local Postgres, no mocks — same convention as `server/`):**
  - New `worker/src/test/setupTestDb.ts` applies the B2B schema (the table definitions
    from the Phase 1 Supabase migrations — `lead_sources`, `companies`, `contacts`,
    `leads`, `research`, `agent_tasks`, `agent_runs` — minus the `auth.uid()`-based RLS
    policies, which are meaningless on a plain local Postgres test instance) to a scratch
    test database via `TEST_DATABASE_URL`.
  - `runResearchTask` integration test: seed a `pending` research task + `lead` + `company`,
    run the task processor with `MockAIProvider`, assert the `research` row, `agent_runs`
    row, `agent_tasks.status`, and `leads.status` transition all land correctly.
  - Failure-path test: force the mock provider to throw, assert the retry/failure
    bookkeeping (`attempts`, status transitions) is correct.
  - Concurrency test: two simultaneous claim queries against the same seeded pending tasks
    never return overlapping rows (proves `FOR UPDATE SKIP LOCKED` works as intended).

## Environment

New env vars for `worker/`: `WORKER_DATABASE_URL` (Supabase direct/service Postgres
connection string, `BYPASSRLS` role) and `WORKER_RESEARCH_BATCH_SIZE` (integer, default
5). Existing `worker/src/config/env.ts` gets both added to its schema, following the same
`loadEnv`-with-zod pattern as `server/src/config/env.ts`.
