# Lead Intelligence & Qualification Engine — Sub-project 1: Ingestion Foundation

**Status:** Design approved, not yet implemented. This is sub-project 1 of 5 in the larger "Lead
Intelligence & Qualification Engine" initiative (100+ Lead Sources → Data Collection →
Normalization → Cleaning → Deduplication → Verification → Enrichment → Company Intelligence →
Intent Signals → AI Lead Scoring → Qualified Leads → Campaigns/CRM/Outreach). Each sub-project
gets its own spec → plan → implementation cycle; this document covers only sub-project 1.

## 0. Decisions confirmed by the user (2026-08-20)

1. **Sequencing:** build this now; RBAC/tenant-isolation (Phase 3 of the Supabase-removal
   roadmap, `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md`) is not a
   blocker. This sub-project ships no new HTTP API, so the RBAC gap doesn't apply to it directly.
2. **First sub-project to design/build:** the foundation — generalized worker task queue +
   `LeadSourceAdapter` framework + Normalizer/Cleaner/Dedup, proven with one real adapter.
3. **Reference adapter #1:** CSV / manual bulk import. No external API dependency, no ToS/rate-limit
   concerns, proves the full pipeline immediately, and is independently useful (most B2B teams
   start with an owned list).
4. **Staging layer:** yes — a `raw_leads` table holds every `RawLead` an adapter ever emits,
   independent of and prior to the canonical `companies`/`contacts`/`leads` rows it produces.
5. **Dedup scope:** exact-match only, via normalized fields + the database's existing unique
   constraints (`companies_org_domain_unique`, `contacts_org_email_unique`). No fuzzy/probabilistic
   matching in this sub-project.

## 1. Why this shape — existing system findings

Before any of the above was decided, the existing repo was inspected in full (not summarized from
memory). Key findings that shaped this design:

- **Stack is Node/Express/TypeScript** (`server/`, `worker/`, plain `pg`) — not Python/FastAPI.
  Confirmed as an explicit, already-recorded decision in
  `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md`.
- **No `backend/scrapers/` or `_dispatch_source()` exists anywhere** in this repo — confirmed by a
  full-repo grep. Nothing here is being duplicated by this design.
- **A B2B Growth Engine schema already exists** (`server/db/migrations/0003`–`0009`, 17 tables:
  `lead_sources, companies, contacts, strategies, strategy_versions, leads, research, lead_scores,
  campaigns, campaign_leads, outreach_messages, outreach_message_events, replies, meetings,
  agent_tasks, agent_runs, analytics_events`), all `organization_id`-scoped with DB-trigger-enforced
  tenant consistency (derive-from-parent-FK, reject-on-mismatch — see `0003`/`0005`/`0008`).
- **`lead_sources.source_type` is deliberately free-text, not CHECK-constrained** — its own design
  doc comment says this is intentional "so new provider types don't need a migration." This design
  was anticipated, just never built.
- **`agent_tasks.task_type` already reserves `'lead_finder'` and `'qualification'`** in its CHECK
  constraint, alongside the one type that's actually implemented, `'research'`. Neither has any
  worker code today.
- **The `research` pipeline is a complete, working reference pattern**: `claimResearchTasks` (`FOR
  UPDATE SKIP LOCKED`) → `processResearchTask` (AI call via `analyzeCompany`, writes `research` +
  `agent_runs`, transactional) → `runResearchTask` (one-shot batch entrypoint, `npm run
  task:research`). This sub-project's `lead_finder` task follows the identical shape.
- **`qualifyLead` (AI schema) and `lead_scores` (table) already exist** but are never invoked in
  production — confirmed by grep, only test files insert into `agent_tasks`/call this schema. Real
  wiring is sub-project 4, out of scope here, but the existing shape (score/band/reasoning) is why
  sub-project 1 explicitly creates a `research` task for every new lead: it's the next real step in
  an already-designed chain.
- **Zero HTTP API exists for any B2B table** — `server/src/resources/` only covers the Phase-1
  site/CRM resources (projects, services, invoices, etc.). Nothing here changes that; see §7.
- **The worker task queue is hardcoded to `task_type='research'`.** An unmerged plan,
  `docs/superpowers/plans/2026-08-18-omnichannel-outreach-domain.md` (Task 9), already fully
  designs and TDDs the generalization into `claimTasks(pool, workerId, taskType, batchSize)` plus
  `reapStaleClaims`/`failTask`-with-backoff. This sub-project ports that work (retargeted from
  `supabase/migrations/` to `server/db/migrations/`, since schema ownership moved — see
  `2026-08-19-postgresql-first-architecture-design.md` §4) rather than re-designing it.

**Net effect:** this sub-project fills the front half of the pipeline (adapters → raw → normalize →
clean → dedup → canonical rows) that has zero existing code, while reusing the back half
(`research`/`lead_scores`/`agent_tasks` schema, the worker batch-job pattern) that already exists.

## 2. Architecture & data flow

```
lead_sources (existing, org-scoped: code, source_type, config jsonb)
      │
      ▼
LeadSourceAdapter.discover(query, context) → AsyncGenerator<RawLead, DiscoverResult>   [NEW]
      │
      ▼
raw_leads (NEW staging table) — one immutable row per RawLead ever emitted,
      │   idempotent on (source_id, external_id)
      ▼  pipeline_status: 'pending'
Normalizer  — pure function: trim/coerce/shape RawLead → NormalizedLead
      ▼  pipeline_status: 'normalized'
Cleaner     — pure function: canonicalize domain/email/phone → CleanedLead
      ▼  pipeline_status: 'cleaned'
Dedup/Merge — DB transaction: resolve-or-create company (by org+domain),
      │        resolve-or-create contact (by org+email), resolve-or-create lead
      │        (attach to an existing active lead, or create new + enqueue research)
      ▼  pipeline_status: 'merged' | 'rejected' | 'errored'
'research' agent_task enqueued for every genuinely new lead   [existing task type,
      first real production trigger for it]
```

All of this runs inside **one `lead_finder` agent_task per discovery call**, claimed via the
generalized `claimTasks(pool, workerId, 'lead_finder', batchSize)`. A task's payload names an
`organizationId` (always derived server-side from `lead_sources.organization_id` — never trusted
from payload directly) + `sourceId` + an adapter-specific `query` + an optional `cursor` for
continuation.

### Failure-mode and scale properties (load-bearing, not incidental)

- **Idempotency:** every `RawLead` carries an adapter-supplied `externalId`, stable across re-runs
  (CSV: hash of normalized row content). `raw_leads` has `UNIQUE (source_id, external_id)`;
  re-ingestion is `ON CONFLICT DO NOTHING` before any normalize/clean/dedup work runs.
- **Transaction boundary is per-record, not per-batch.** One malformed row in a 10,000-row import
  must not roll back the other 9,999. A `lead_finder` task's result is a summary — `{ discovered,
  merged, rejected, errored }` — mirroring `RunResearchTaskSummary`'s shape, not a single pass/fail.
- **Concurrency safety is structural, not locked.** Multiple workers claiming different
  `lead_finder` tasks resolve dedup collisions safely because merge uses `ON CONFLICT ... DO
  UPDATE` against existing unique constraints, which Postgres serializes atomically. No
  application-level locking is introduced.
- **Batch cap + continuation:** a task processes up to `leadFinderBatchSize` `RawLead`s. If the
  adapter's generator isn't exhausted (`DiscoverResult.cursor !== null`), the task enqueues a
  continuation `lead_finder` task carrying that cursor, with an `idempotency_key` so a retried
  continuation-enqueue can't double-create work. This is how unbounded sources stay bounded per
  task without holding a connection or transaction open indefinitely.
- **Rejection is a defined outcome, not a crash.** A `RawLead` without a usable `company.name` is
  marked `rejected` with a reason, visible for audit, never silently dropped, never retried.
- **Trust boundary:** `organization_id` for a task is derived only from `lead_sources.organization_id`
  via `source_id` — mirrors the "never trust client-supplied org id" rule already established for
  the (not-yet-built) API layer, applied here to the task-payload boundary instead.
- **Explicitly deferred, not silently skipped:** rate limiting/backpressure for network-based
  adapters. Irrelevant to the CSV adapter; the `SourceContext.signal` (`AbortSignal`) exists so a
  future adapter *can* respect cancellation, but no rate limiter is built now — nothing to
  rate-limit yet (YAGNI).

## 3. Data model

### 3.1 `raw_leads` (new migration `server/db/migrations/0016_b2b_raw_leads.sql`)

```sql
CREATE TABLE raw_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  raw_payload jsonb NOT NULL,
  pipeline_status text NOT NULL DEFAULT 'pending' CHECK (pipeline_status IN (
    'pending','normalized','cleaned','merged','rejected','errored'
  )),
  rejection_reason text,
  error_message text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX raw_leads_source_external_unique ON raw_leads(source_id, external_id);
CREATE INDEX raw_leads_organization_id_idx ON raw_leads(organization_id);
CREATE INDEX raw_leads_pipeline_status_idx ON raw_leads(pipeline_status);

CREATE OR REPLACE FUNCTION raw_leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM lead_sources WHERE id = NEW.source_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'raw_leads.source_id % does not reference an existing lead_source', NEW.source_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'raw_leads.organization_id (%) does not match parent source organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raw_leads_set_organization_id_trigger
  BEFORE INSERT ON raw_leads
  FOR EACH ROW EXECUTE FUNCTION raw_leads_set_organization_id();
```

Follows the exact convention already used by `contacts`/`leads`/`research`/`lead_scores`/`agent_runs`
in `0003`/`0005`/`0008` — `organization_id` is always derived from a parent FK by trigger, never
trusted from the insert.

### 3.2 `agent_tasks.idempotency_key` (new migration `server/db/migrations/0017_agent_tasks_idempotency.sql`)

Ported from the unmerged `omnichannel-outreach-domain.md` Task 9, retargeted from
`supabase/migrations/` to `server/db/migrations/`:

```sql
ALTER TABLE agent_tasks ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_agent_tasks_idempotency_key
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

## 4. Core interfaces (`worker/src/sources/types.ts`)

```typescript
export interface RawLead {
  externalId: string;   // stable per-source id — CSV: hash of normalized row content;
                         // a future API adapter: that API's native record id
  company: {
    name?: string | null;
    domain?: string | null;
    industry?: string | null;
    sizeRange?: string | null;
    country?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    description?: string | null;
  };
  contact?: {
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
  } | null;
  raw: Record<string, unknown>;   // untouched original payload, stored in raw_leads.raw_payload
}

export interface SourceContext {
  organizationId: string;
  sourceId: string;
  config: Record<string, unknown>;   // lead_sources.config
  cursor: string | null;             // resume point from a prior discover() call; null = start fresh
  limit: number;                     // max RawLeads this call should yield (the batch cap)
  signal: AbortSignal;               // cancellation hook — unused today, real once a network adapter needs it
}

export interface DiscoverResult {
  cursor: string | null;   // null = source exhausted; non-null = more available, framework enqueues a continuation
}

export interface LeadSourceAdapter {
  sourceType: string;   // matches lead_sources.source_type — registry lookup key
  discover(query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void>;
}
```

Pagination is owned by the adapter, not the framework: the framework passes `cursor`/`limit` in,
the adapter decides how to honor them, and returns where it left off.

**The CSV/manual adapter is a deliberately non-paginating, bounded implementation.** It takes its
full row list as `query`, processes all of it in one call, and always returns `{ cursor: null }`.
A CSV upload is a one-shot local dataset (an admin's list is thousands of rows, not the
hundreds-of-millions figure — that scale target is about the *system* across many sources over
time, not one import). It enforces `config.maxRows` (default 5,000), rejecting larger uploads with
a clear "split this file" error before yielding anything, rather than silently degrading. The
cursor/continuation contract is real and load-bearing for future adapters, but is proven in tests
via a test-only fake paginating adapter (§6) — the CSV adapter structurally can't exercise it.

**Adapter registry** (`worker/src/sources/registry.ts`): a plain `Record<string, LeadSourceAdapter>`
keyed by `sourceType`, populated at worker startup. Same "static data, no DB table" philosophy as
the (not-yet-built) RBAC permission map. An unregistered `source_type` fails the task with a clear
error, never a silent no-op.

## 5. Normalizer → Cleaner → Dedup/Merge

Three independently-testable units (`worker/src/sources/normalize.ts`, `clean.ts`, `mergeLead.ts`).

**Normalizer** — pure, `normalize(raw: RawLead): NormalizedLead`. Structural shaping only: trims
whitespace, coerces empty strings to `null`. No domain-specific canonicalization. Zero I/O.

**Cleaner** — pure, `clean(normalized: NormalizedLead): CleanedLead`:
- `domain`: strip protocol/`www.`/trailing slash, lowercase; derived from `website` if `domain`
  itself is absent.
- `email`: lowercase, trimmed.
- `phone`: best-effort toward E.164; if a country code can't be confidently inferred, store cleaned
  digits as-is rather than fabricate one. **Not validation** — "is this number real/reachable" is
  Verification (sub-project 2)'s job.

**Dedup/Merge** (`mergeLead.ts`) — the one stage requiring the DB, one transaction per `RawLead`:

1. **Company resolution.** If `domain` present:
   ```sql
   INSERT INTO companies (organization_id, name, domain, industry, size_range, country, website, linkedin_url, description)
   VALUES (...)
   ON CONFLICT (organization_id, domain) WHERE domain IS NOT NULL
   DO UPDATE SET
     industry = COALESCE(companies.industry, EXCLUDED.industry),
     size_range = COALESCE(companies.size_range, EXCLUDED.size_range),
     country = COALESCE(companies.country, EXCLUDED.country),
     website = COALESCE(companies.website, EXCLUDED.website),
     linkedin_url = COALESCE(companies.linkedin_url, EXCLUDED.linkedin_url),
     description = COALESCE(companies.description, EXCLUDED.description)
   RETURNING id
   ```
   **Merge policy: fill gaps, never clobber.** A leaner second source can't overwrite richer
   existing data. `name` is never overwritten once set.
   If `domain` is absent: no dedup key exists — always insert a fresh company row. **This is an
   accepted, documented limitation**, not a silent gap: two domain-less companies with the same
   name will duplicate. Fixing it is fuzzy-matching territory, explicitly out of scope (§7).

2. **Contact resolution** (only if `RawLead.contact` present): identical pattern keyed on
   `contacts_org_email_unique` when `email` is present; always-insert when absent (same accepted
   limitation). `company_id` is set from step 1 before insert; the existing
   `contacts_set_organization_id` trigger derives `organization_id` from it.

3. **Lead resolution.** Check for an **active** lead on this `company_id`
   (`status NOT IN ('won','lost','disqualified')` — the same three terminal statuses
   `src/b2b/domain/guards.ts` encodes on the frontend; the worker reimplements the same three
   values in SQL since frontend/worker share no domain-code boundary today — flagged as a
   consistency requirement to maintain, not a new cross-package dependency to build).
   - **Active lead exists** → attach (`raw_leads.lead_id = <id>`), mark `merged`, no new `leads`
     row, **no `research` task enqueued** (avoids redundant AI calls every time a source re-surfaces
     an already-in-flight company).
   - **No active lead** → insert new `leads` row (`status='new'`), set `raw_leads.lead_id`, mark
     `merged`, **enqueue `agent_tasks (task_type='research', payload={lead_id})`** — the first
     production code path that ever creates one.

4. **Rejection:** no usable `company.name` → `pipeline_status='rejected'`, `rejection_reason` set,
   no company/contact/lead touched. The transaction still commits — rejection is a normal outcome.

## 6. Worker/task wiring

**Queue generalization — ported, not redesigned.** `claimTasks(pool, workerId, taskType,
batchSize)`, `reapStaleClaims(pool, staleAfterMinutes)`, and a shared `failTask(pool, task,
message)` with exponential backoff (`min(2^attempts * 30s, 3600s)`) come from
`docs/superpowers/plans/2026-08-18-omnichannel-outreach-domain.md` Task 9 essentially verbatim —
SQL unchanged, only the idempotency migration's file location changes (§3.2). `claimResearchTasks`
becomes a thin wrapper over `claimTasks` (existing tests untouched); `lead_finder` calls `claimTasks`
directly — the wrapper pattern isn't repeated for new task types.

**`processLeadFinderTask(pool, registry, task)`** (`worker/src/tasks/processLeadFinderTask.ts`):
1. Load `lead_sources` by `task.payload.sourceId` → `organization_id`, `source_type`, `config`.
   Missing/inactive source → `failTask`.
2. Look up `registry[source.source_type]`; unregistered → `failTask`.
3. Mark `agent_tasks.status='in_progress'`.
4. Call `adapter.discover(task.payload.query, { organizationId, sourceId, config, cursor:
   task.payload.cursor ?? null, limit: leadFinderBatchSize, signal })`.
5. Per yielded `RawLead`, **one transaction covering the entire record**: `INSERT INTO raw_leads
   (...) ON CONFLICT (source_id, external_id) DO NOTHING RETURNING id` — a `NULL` return
   (already-seen from a prior successful run) commits nothing further and moves to the next
   `RawLead`. A real insert proceeds, in the *same* transaction, through normalize → clean → merge
   (§5) → updating that same row's `pipeline_status`/`lead_id`/`rejection_reason`, then commits as
   one unit. This is what makes retries safe: if the process dies mid-record, the whole transaction
   (including the tentative `raw_leads` insert) rolls back, so on retry the row genuinely doesn't
   exist yet and gets reinserted and reprocessed — never stuck half-done and silently skipped.
   Normalize/clean/merge run inside a try/catch *within* that same transaction: a thrown error is
   caught there and turned into `pipeline_status='errored'`/`error_message` written to the same
   (still-uncommitted) `raw_leads` row before it commits — so an errored record still leaves its
   audit trail and won't be silently reprocessed as "new" on a later run. Only a hard failure that
   prevents any commit at all (process killed, connection lost — nothing left to catch with) falls
   back to true rollback-and-retry-from-scratch. Either way the loop continues to the next
   `RawLead`.
6. Tally `{ discovered, merged, rejected, errored }`.
7. `cursor !== null` on the generator's return → enqueue a continuation task with
   `idempotency_key='leadfinder:' || sourceId || ':' || cursor` (safe against duplicate enqueue via
   §3.2's unique index).
8. Write `agent_runs` (`provider=NULL`, `output=`the summary). Mark `succeeded`, or route
   total failures (e.g. adapter not found before any record processed) through `failTask`.

**`runLeadFinderTask.ts`** — identical shape to `runResearchTask.ts`: one-shot `main()` (`npm run
task:lead_finder` / `task:lead_finder:dev`), `leadFinderBatchSize` added to `taskEnv` alongside the
existing `researchBatchSize`. No new scheduling infrastructure — invoked manually/via external
cron, same as `research` today (Docker Compose scheduling is still Phase 9 of the Supabase-removal
roadmap, untouched here).

**Getting the first task into the queue:** a CLI script (`worker/scripts/enqueue-csv-import.ts`,
matching `server/scripts/create-admin.ts`'s convention) reads a CSV file path, builds the payload
(`{ sourceId, query: { csvText }, cursor: null }`), inserts the `agent_tasks` row directly. The
`lead_sources` row itself is created via a one-off SQL statement for now — no CRUD API exists yet
(§7).

**CSV adapter's `discover()`:** parses `query.csvText` into rows (capped at `config.maxRows ??
5000`, rejecting larger before yielding anything), computes each row's `external_id` as a SHA-256
hash of its normalized cell values, yields one `RawLead` per row, always returns `{ cursor: null }`.

## 7. Explicitly out of scope for this sub-project

| Deferred to | Item |
|---|---|
| Sub-project 2 | Verification (email/phone deliverability) |
| Sub-project 3 | Enrichment from third-party data providers, Intent signals |
| Sub-project 4 | Wiring `qualifyLead`/`lead_scores` into a real `qualification` task |
| Sub-project 5 | Any Express API route or admin UI, including `lead_sources` CRUD |
| Not planned yet | Fuzzy/probabilistic dedup (accepted limitation, §5) |
| Not needed yet | Rate limiting/backpressure (no network adapter exists) |
| Roadmap Phase 3 | RBAC/org-scoped API auth (moot here — no new API) |
| Future increments | Any adapter beyond CSV/manual import (Apollo, Hunter.io, LinkedIn, etc.) |
| Roadmap Phase 9 | Scheduling/cron automation of `lead_finder` runs; periodic `reapStaleClaims` invocation |

## 8. Testing strategy

- **Pure unit tests** (no DB): `normalize.test.ts`, `clean.test.ts` — table-driven, covering
  protocol/`www.`-stripping, missing-domain-derived-from-website, email casing, unparseable phone,
  blank-to-null coercion.
- **Integration tests** (real test Postgres, existing `createTestPool`/`truncateAll` convention):
  `mergeLead.test.ts` — new company+contact+lead from nothing; existing company found by domain
  with fields filled-not-clobbered; existing contact found by email; no-domain company always
  inserts fresh (passing test documenting the accepted limitation); active lead found → attach, no
  new lead, no `research` enqueued; all leads terminal → new lead + `research` enqueued; rejection
  leaves canonical tables untouched; `organization_id` mismatch rejected at the trigger.
- **`processLeadFinderTask.test.ts`**: happy path with CSV adapter; idempotent re-ingestion (no
  duplicate `raw_leads`); per-record error isolation; **continuation/cursor contract proven via a
  test-only fake paginating adapter** (the CSV adapter can't exercise this — §4); unregistered
  `source_type` → clean `failTask` path.
- **CSV adapter unit tests**: row parsing, `external_id` hash stability, `maxRows` rejection.
- **End-to-end smoke test**, matching `app.test.ts`'s existing "signup → promote → login → manage a
  service → public read" convention: seed a `lead_sources` row + enqueue a `lead_finder` task with a
  small CSV → run `runLeadFinderTask` → assert `raw_leads`/`companies`/`contacts`/`leads`/the
  follow-on `research` `agent_tasks` row all landed correctly.
- **`claimTasks`/`reapStaleClaims`/`failTask`**: already fully written and tested in the ported
  plan (§6) — reused as-is.
