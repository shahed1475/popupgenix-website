# Lead Intelligence Engine — Sub-project 1: Ingestion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the source-adapter ingestion pipeline (adapter → raw staging → normalize → clean →
dedup/merge → canonical `companies`/`contacts`/`leads` rows), generalize the worker's task queue to
support it, and prove the whole thing end-to-end with one real adapter (CSV/manual bulk import).

**Architecture:** New `raw_leads` staging table + a generic `LeadSourceAdapter` interface in
`worker/src/sources/`; a `lead_finder` `agent_tasks` type processed by a generalized `claimTasks`
queue engine (ported from an existing unmerged plan); per-`RawLead` transactional
normalize→clean→merge produces `companies`/`contacts`/`leads` rows and auto-enqueues the existing
`research` task type.

**Tech Stack:** Node/TypeScript, `pg`, Vitest, existing `server/db/migrations` hand-rolled runner
(production schema) + `worker/src/test/schema.sql` (worker's own hand-maintained test schema).

**Spec:** `docs/superpowers/specs/2026-08-20-lead-intelligence-ingestion-foundation-design.md` — read
this first; it has the full rationale for every decision below. This plan implements it task-by-task.

## Global Constraints

- No Python/FastAPI — this repo is Node/Express/TypeScript end to end (`server/`, `worker/`), confirmed project-wide decision.
- Dedup is exact-match only (via `companies_org_domain_unique`/`contacts_org_email_unique`), no fuzzy matching in this plan.
- The CSV adapter never paginates (`config.maxRows` default 5000, rejects larger files); the cursor/continuation contract is proven only via a test-only fake paginating adapter, never the CSV adapter.
- No new Express API routes, no admin UI — this sub-project is worker/DB only.
- `organization_id` on every new/touched row is always derived server-side (trigger, from a parent FK) — never trusted from a task payload or caller input.
- Every migration file added to `server/db/migrations/` must be sequentially numbered, must not touch `0001`–`0015` (pre-existing, already applied), must not use `CREATE TABLE IF NOT EXISTS`, and must use lowercase SQL types — matching every existing migration's convention.
- **`worker/`'s `TEST_DATABASE_URL` must point at a database distinct from `server/`'s test database.** `worker/src/test/schema.sql` is a separate, hand-maintained schema (not the real migrated one) — running worker's tests against the same physical database as server's tests will corrupt both suites (colliding table shapes, cross-suite `TRUNCATE`s). Use a distinct database name (e.g. `drickly_worker_test`) on the same or a different local Postgres instance.
- Every task that adds a table to either schema also adds it to that package's `truncateAll()` — established repo-wide convention.

---

### Task 1: `raw_leads` production migration

**Files:**
- Create: `server/db/migrations/0016_b2b_raw_leads.sql`
- Test: `server/src/db/schema/rawLeads.test.ts`
- Modify: `server/src/db/schema/fullSchema.test.ts`
- Modify: `server/src/test/setupTestDb.ts`

**Interfaces:**
- Produces: `raw_leads(id, organization_id, source_id, external_id, raw_payload, pipeline_status, rejection_reason, error_message, lead_id, discovered_at, processed_at, created_at)`.
- Consumes: `lead_sources(id)` (from `0003`), `leads(id)` (from `0005`).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/rawLeads.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertOrgAndSource(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const orgId = org.rows[0].id as string;
  const source = await pool.query(
    `INSERT INTO lead_sources (organization_id, name, code) VALUES ($1, 'CSV Import', $2) RETURNING id`,
    [orgId, `csv-${slug}`]
  );
  return { orgId, sourceId: source.rows[0].id as string };
}

describe('raw_leads schema', () => {
  it('auto-populates organization_id from the parent lead_source via trigger', async () => {
    const { orgId, sourceId } = await insertOrgAndSource(pool, 'org-a');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING organization_id, pipeline_status`,
      [sourceId]
    );
    expect(row.rows[0].organization_id).toBe(orgId);
    expect(row.rows[0].pipeline_status).toBe('pending');
  });

  it('rejects a raw_leads insert with an organization_id that mismatches its parent source', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-b');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Other', 'org-c') RETURNING id`);
    await expect(
      pool.query(`INSERT INTO raw_leads (organization_id, source_id, external_id, raw_payload) VALUES ($1, $2, 'ext-1', '{}')`, [
        otherOrg.rows[0].id,
        sourceId,
      ])
    ).rejects.toThrow();
  });

  it('enforces a unique (source_id, external_id) pair, scoped per source not globally', async () => {
    const { sourceId: sourceA } = await insertOrgAndSource(pool, 'org-d');
    const { sourceId: sourceB } = await insertOrgAndSource(pool, 'org-e');

    await pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}')`, [sourceA]);

    const otherSourceSameExternalId = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}') RETURNING id`,
      [sourceB]
    );
    expect(otherSourceSameExternalId.rows[0].id).toBeDefined();

    await expect(
      pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}')`, [sourceA])
    ).rejects.toThrow();
  });

  it('cascades: deleting a lead_source removes its raw_leads', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-f');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING id`,
      [sourceId]
    );
    await pool.query(`DELETE FROM lead_sources WHERE id = $1`, [sourceId]);
    const remaining = await pool.query(`SELECT id FROM raw_leads WHERE id = $1`, [row.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });

  it('setting lead_id to null on lead deletion, not cascading the raw_leads row away', async () => {
    const { orgId, sourceId } = await insertOrgAndSource(pool, 'org-g');
    const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme') RETURNING id`, [orgId]);
    const lead = await pool.query(`INSERT INTO leads (company_id, source_id) VALUES ($1, $2) RETURNING id`, [
      company.rows[0].id,
      sourceId,
    ]);
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload, lead_id, pipeline_status) VALUES ($1, 'ext-1', '{}', $2, 'merged') RETURNING id`,
      [sourceId, lead.rows[0].id]
    );
    await pool.query(`DELETE FROM leads WHERE id = $1`, [lead.rows[0].id]);
    const remaining = await pool.query(`SELECT lead_id FROM raw_leads WHERE id = $1`, [row.rows[0].id]);
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0].lead_id).toBeNull();
  });

  it('rejects an invalid pipeline_status', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-h');
    await expect(
      pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload, pipeline_status) VALUES ($1, 'ext-1', '{}', 'bogus')`, [
        sourceId,
      ])
    ).rejects.toThrow();
  });

  it('re-derives organization_id when source_id is updated to a source in a different organization', async () => {
    const { sourceId: sourceInOrgI } = await insertOrgAndSource(pool, 'org-i');
    const { orgId: orgJ, sourceId: sourceInOrgJ } = await insertOrgAndSource(pool, 'org-j');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING id`,
      [sourceInOrgI]
    );

    const updated = await pool.query(
      `UPDATE raw_leads SET source_id = $1 WHERE id = $2 RETURNING organization_id`,
      [sourceInOrgJ, row.rows[0].id]
    );
    expect(updated.rows[0].organization_id).toBe(orgJ);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- rawLeads`
Expected: FAIL — `relation "raw_leads" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0016_b2b_raw_leads.sql
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
  BEFORE INSERT OR UPDATE OF source_id ON raw_leads
  FOR EACH ROW EXECUTE FUNCTION raw_leads_set_organization_id();
```

(The `OR UPDATE OF source_id` clause matches `0012_organization_id_triggers_guard_updates.sql`'s
pattern, which extended every other org-derivation trigger the same way — a `raw_leads` row's
`source_id` should never be reassignable to a different organization's source without
`organization_id` being recomputed and re-validated. The trigger function itself already handles
both INSERT and UPDATE correctly; only the trigger's event list needs to list both.)

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- rawLeads`
Expected: PASS (7 tests).

- [ ] **Step 5: Add `raw_leads` to `truncateAll()` and `fullSchema.test.ts`**

In `server/src/test/setupTestDb.ts`, add `raw_leads` to the `TRUNCATE TABLE` list (anywhere before `lead_sources`, since it references it — Postgres `CASCADE` handles ordering regardless, but keep it near the other B2B tables for readability):

```typescript
// server/src/test/setupTestDb.ts — TRUNCATE TABLE list, add raw_leads
      agent_runs, agent_tasks, analytics_events, replies, meetings, outreach_message_events, outreach_messages, campaign_leads, campaigns, lead_scores, leads, research, raw_leads, strategy_versions, strategies, invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
```

In `server/src/db/schema/fullSchema.test.ts`, add `'raw_leads'` to `expectedTables`:

```typescript
      'leads', 'research', 'lead_scores', 'raw_leads',
```

- [ ] **Step 6: Run the full server test suite to confirm nothing broke**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test`
Expected: PASS, all files (117 existing + 7 new = 124 tests across 34 files).

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/0016_b2b_raw_leads.sql server/src/db/schema/rawLeads.test.ts server/src/db/schema/fullSchema.test.ts server/src/test/setupTestDb.ts
git commit -m "feat: add raw_leads staging table"
```

---

### Task 2: `agent_tasks.idempotency_key` production migration

**Files:**
- Create: `server/db/migrations/0017_agent_tasks_idempotency.sql`
- Test: `server/src/db/schema/agentTasksIdempotency.test.ts`

**Interfaces:**
- Produces: `agent_tasks.idempotency_key text` (nullable), `UNIQUE (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- Consumes: `agent_tasks` (from `0008`).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/agentTasksIdempotency.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

describe('agent_tasks.idempotency_key', () => {
  it('allows multiple tasks with a null idempotency_key', async () => {
    const orgId = await insertOrg(pool, 'org-a');
    await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'lead_finder')`, [orgId]);
    const second = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'lead_finder') RETURNING id`,
      [orgId]
    );
    expect(second.rows[0].id).toBeDefined();
  });

  it('enforces uniqueness of idempotency_key per organization', async () => {
    const orgId = await insertOrg(pool, 'org-b');
    await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'key-1')`,
      [orgId]
    );
    await expect(
      pool.query(`INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'key-1')`, [orgId])
    ).rejects.toThrow();
  });

  it('allows the same idempotency_key across different organizations', async () => {
    const orgA = await insertOrg(pool, 'org-c');
    const orgB = await insertOrg(pool, 'org-d');
    await pool.query(`INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'shared-key')`, [
      orgA,
    ]);
    const second = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'shared-key') RETURNING id`,
      [orgB]
    );
    expect(second.rows[0].id).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- agentTasksIdempotency`
Expected: FAIL — `column "idempotency_key" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0017_agent_tasks_idempotency.sql
ALTER TABLE agent_tasks ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_agent_tasks_idempotency_key
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

- [ ] **Step 4: Run test to verify it passes, then the full suite**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- agentTasksIdempotency` → PASS (3 tests).
Then: `npm test` (no filter) → PASS, all files (127 tests across 35 files).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0017_agent_tasks_idempotency.sql server/src/db/schema/agentTasksIdempotency.test.ts
git commit -m "feat: add idempotency_key to agent_tasks"
```

---

### Task 3: Reconcile worker's test schema

**Files:**
- Modify: `worker/src/test/schema.sql`
- Modify: `worker/src/test/setupTestDb.ts`

**Interfaces:**
- Produces: worker's test schema gains `organization_id` (defaulted, so every pre-existing test keeps working unmodified), `contacts`, `lead_sources`, `raw_leads` tables, `agent_tasks.idempotency_key`, and unique indexes matching production (`companies` org+domain, `contacts` org+email, `raw_leads` source+external_id).
- Consumes: nothing new — this is worker's own hand-maintained mirror, independent of `server/db/migrations`.

**Why this task exists:** `worker/src/test/schema.sql` was flagged as stale in
`docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md` §8.1 ("no longer
matches the production schema... flagged here for the Phase 8 worker generalization plan to
reconcile") — this is that reconciliation, scoped to exactly what this sub-project's new code
needs (not full production fidelity — no `organizations` table/FK is introduced here, since
nothing in worker's code enforces cross-org access; a bare defaulted `organization_id` column is
enough to exercise the org-scoped SQL this plan's tasks write).

**Also fixes a latent bug:** `createTestPool()` re-runs `schema.sql` on every call via `CREATE
TABLE IF NOT EXISTS`, which silently no-ops against a database that already has these tables from
a previous shape (e.g., before this task's column additions) — any developer/CI environment with
an already-initialized worker test database would keep running against the *old* shape and every
new test in this plan would fail with a confusing "column does not exist". Fixing this now, while
touching the file anyway, rather than leaving it as a footgun for Task 4 onward.

- [ ] **Step 1: Rewrite `worker/src/test/schema.sql` in full**

```sql
-- worker/src/test/schema.sql
-- Hand-maintained subset of the production schema (server/db/migrations) for worker-side
-- integration tests. Re-run on every createTestPool() call, so it drops and rebuilds every table
-- it owns each time — this is what makes it safe to change shape between runs without requiring
-- callers to manually reset their local test database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS agent_runs, agent_tasks, raw_leads, research, contacts, leads, lead_sources, companies CASCADE;

-- A bare default, not a real organizations table/FK: nothing in worker/ enforces cross-org access
-- (that's Phase 3 of the Supabase-removal roadmap, app-layer only, not this package's concern).
-- The default keeps every pre-existing test — none of which pass organization_id — working
-- unmodified; new tests may pass an explicit value to exercise org-scoping.

CREATE TABLE companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size_range TEXT,
  country TEXT,
  website TEXT,
  linkedin_url TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_companies_org_domain ON companies(organization_id, domain) WHERE domain IS NOT NULL;

CREATE TABLE lead_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  source_type TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source_id UUID,
  opted_out BOOLEAN NOT NULL DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_contacts_org_email ON contacts(organization_id, email) WHERE email IS NOT NULL;

CREATE TABLE leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID,
  source_id UUID,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','researching','qualified','disqualified','approved_for_outreach',
    'contacted','replied','meeting_booked','proposal','won','lost'
  )),
  current_score NUMERIC,
  current_strategy_version_id UUID,
  disqualified_reason TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  subject_type TEXT NOT NULL CHECK (subject_type IN ('company', 'contact')),
  subject_id UUID NOT NULL,
  summary TEXT,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  created_by TEXT NOT NULL DEFAULT 'manual' CHECK (created_by IN ('agent', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE raw_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  source_id UUID NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  pipeline_status TEXT NOT NULL DEFAULT 'pending' CHECK (pipeline_status IN (
    'pending','normalized','cleaned','merged','rejected','errored'
  )),
  rejection_reason TEXT,
  error_message TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_raw_leads_source_external ON raw_leads(source_id, external_id);

CREATE TABLE agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_type TEXT NOT NULL CHECK (task_type IN (
    'strategy','lead_finder','research','qualification','outreach',
    'reply','booking','notification','analytics'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','claimed','in_progress','succeeded','failed','cancelled'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  subject_type TEXT,
  subject_id UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_agent_tasks_idempotency_key ON agent_tasks (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('mock', 'claude')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  output JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Update `truncateAll()` in `worker/src/test/setupTestDb.ts`**

```typescript
// worker/src/test/setupTestDb.ts — truncateAll body
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE agent_runs, agent_tasks, raw_leads, research, contacts, leads, lead_sources, companies RESTART IDENTITY CASCADE"
  );
}
```

- [ ] **Step 3: Run the existing worker suite to confirm it's still green, unmodified**

Run (from `worker/`, pointed at a database distinct from server's, per Global Constraints):
`TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test`
Expected: PASS — every existing test in `claimResearchTasks.test.ts`, `processResearchTask.test.ts`,
`runResearchTask.test.ts` (and any AI schema tests) still passes with zero changes to those files,
proving the `organization_id` default didn't break anything relying on its absence.

- [ ] **Step 4: Commit**

```bash
git add worker/src/test/schema.sql worker/src/test/setupTestDb.ts
git commit -m "test(worker): reconcile hand-maintained test schema with production (org_id, contacts, lead_sources, raw_leads, idempotency_key)"
```

---

### Task 4: Generic `claimTasks`

**Files:**
- Create: `worker/src/tasks/claimTasks.ts`
- Test: `worker/src/tasks/claimTasks.test.ts`

**Interfaces:**
- Produces: `claimTasks(pool, workerId, taskType, batchSize): Promise<ClaimedTask[]>` where
  `ClaimedTask = { id: string; task_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }`.
- Consumes: `agent_tasks` (reconciled in Task 3).

Ported from `docs/superpowers/plans/2026-08-18-omnichannel-outreach-domain.md` Task 9, Steps 4–7 —
SQL and test content unchanged from that already-designed, already-reviewed source.

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/tasks/claimTasks.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimTasks } from "./claimTasks.js";

let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("claimTasks", () => {
  it("claims pending tasks of the requested task_type only", async () => {
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload) VALUES ('outreach', 'pending', '{}')");
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', '{}')");

    const claimed = await claimTasks(pool, "worker-1", "outreach", 5);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].task_type).toBe("outreach");
  });

  it("marks claimed rows with the given workerId", async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO agent_tasks (task_type, status, payload) VALUES ('outreach', 'pending', '{}') RETURNING id"
    );

    await claimTasks(pool, "worker-9", "outreach", 5);

    const task = await pool.query("SELECT status, claimed_by FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("claimed");
    expect(task.rows[0].claimed_by).toBe("worker-9");
  });

  it("respects batchSize and priority ordering", async () => {
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload, priority) VALUES ('outreach', 'pending', '{}', 0)");
    const high = await pool.query(
      "INSERT INTO agent_tasks (task_type, status, payload, priority) VALUES ('outreach', 'pending', '{}', 10) RETURNING id"
    );
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload, priority) VALUES ('outreach', 'pending', '{}', 5)");

    const claimed = await claimTasks(pool, "worker-1", "outreach", 1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(high.rows[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- claimTasks`
Expected: FAIL — `claimTasks.ts` doesn't exist yet.

- [ ] **Step 3: Implement `claimTasks`**

```typescript
// worker/src/tasks/claimTasks.ts
import type { Pool } from "pg";

export interface ClaimedTask {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimTasks(
  pool: Pool,
  workerId: string,
  taskType: string,
  batchSize: number
): Promise<ClaimedTask[]> {
  const { rows } = await pool.query<ClaimedTask>(
    `UPDATE agent_tasks
     SET status = 'claimed', claimed_by = $1, claimed_at = now()
     WHERE id IN (
       SELECT id FROM agent_tasks
       WHERE task_type = $2 AND status = 'pending' AND scheduled_for <= now()
       ORDER BY priority DESC, scheduled_for ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, task_type, payload, attempts, max_attempts`,
    [workerId, taskType, batchSize]
  );
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- claimTasks`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/tasks/claimTasks.ts worker/src/tasks/claimTasks.test.ts
git commit -m "feat(worker): add generic claimTasks queue engine"
```

---

### Task 5: `claimResearchTasks` becomes a thin wrapper

**Files:**
- Modify: `worker/src/tasks/claimResearchTasks.ts`

**Interfaces:**
- Consumes: `claimTasks` (Task 4).
- Produces: unchanged exported shape (`ClaimedResearchTask`, `claimResearchTasks(pool, workerId, batchSize)`) — no other file needs to change.

- [ ] **Step 1: Replace the file in full**

```typescript
// worker/src/tasks/claimResearchTasks.ts
import type { Pool } from "pg";
import { claimTasks } from "./claimTasks.js";

export interface ClaimedResearchTask {
  id: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimResearchTasks(
  pool: Pool,
  workerId: string,
  batchSize: number
): Promise<ClaimedResearchTask[]> {
  const rows = await claimTasks(pool, workerId, "research", batchSize);
  return rows.map(({ id, payload, attempts, max_attempts }) => ({ id, payload, attempts, max_attempts }));
}
```

- [ ] **Step 2: Run the existing research-queue tests to confirm the refactor is behavior-preserving**

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- claimResearchTasks processResearchTask runResearchTask`
Expected: PASS — unchanged, now exercising `claimTasks` transitively.

- [ ] **Step 3: Commit**

```bash
git add worker/src/tasks/claimResearchTasks.ts
git commit -m "refactor(worker): claimResearchTasks becomes a thin wrapper over claimTasks"
```

---

### Task 6: `reapStaleClaims`

**Files:**
- Create: `worker/src/tasks/reapStaleClaims.ts`
- Test: `worker/src/tasks/reapStaleClaims.test.ts`

**Interfaces:**
- Produces: `reapStaleClaims(pool, staleAfterMinutes): Promise<number>` — count of tasks returned to `pending`.
- Consumes: `agent_tasks` (Task 3).

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/tasks/reapStaleClaims.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { reapStaleClaims } from "./reapStaleClaims.js";

let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("reapStaleClaims", () => {
  it("returns a stuck claimed task to pending after the staleness window", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (task_type, status, payload, claimed_by, claimed_at)
       VALUES ('research', 'claimed', '{}', 'worker-dead', now() - interval '20 minutes')
       RETURNING id`
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(1);
    const task = await pool.query("SELECT status, claimed_by, claimed_at FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("pending");
    expect(task.rows[0].claimed_by).toBeNull();
    expect(task.rows[0].claimed_at).toBeNull();
  });

  it("leaves a recently claimed task untouched", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (task_type, status, payload, claimed_by, claimed_at)
       VALUES ('research', 'claimed', '{}', 'worker-live', now())
       RETURNING id`
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(0);
    const task = await pool.query("SELECT status FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("claimed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- reapStaleClaims`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```typescript
// worker/src/tasks/reapStaleClaims.ts
import type { Pool } from "pg";

export async function reapStaleClaims(pool: Pool, staleAfterMinutes: number): Promise<number> {
  const result = await pool.query(
    `UPDATE agent_tasks
     SET status = 'pending', claimed_by = NULL, claimed_at = NULL
     WHERE status = 'claimed' AND claimed_at < now() - ($1 || ' minutes')::interval`,
    [staleAfterMinutes]
  );
  return result.rowCount ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- reapStaleClaims`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/tasks/reapStaleClaims.ts worker/src/tasks/reapStaleClaims.test.ts
git commit -m "feat(worker): add reapStaleClaims for stuck claimed tasks"
```

---

### Task 7: Shared `failTask` with exponential backoff

**Files:**
- Create: `worker/src/tasks/failTask.ts`
- Test: `worker/src/tasks/failTask.test.ts`
- Modify: `worker/src/tasks/processResearchTask.ts`

**Interfaces:**
- Produces: `failTask(pool, task, message): Promise<FailTaskResult>` where `FailableTask = { id: string; attempts: number; max_attempts: number }`, `FailTaskResult = { taskId: string; status: "failed"; error: string }`.
- Consumes: `agent_tasks` (Task 3). `ClaimedResearchTask` (Task 5) structurally satisfies `FailableTask`.

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/tasks/failTask.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { failTask } from "./failTask.js";

let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedTask(attempts: number, maxAttempts: number) {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO agent_tasks (task_type, status, payload, attempts, max_attempts) VALUES ('research', 'pending', '{}', $1, $2) RETURNING id",
    [attempts, maxAttempts]
  );
  return { id: rows[0].id, attempts, max_attempts: maxAttempts };
}

describe("failTask", () => {
  it("reschedules a retryable task into the future using exponential backoff", async () => {
    const task = await seedTask(0, 3);
    const before = new Date();

    await failTask(pool, task, "boom");

    const { rows } = await pool.query("SELECT status, attempts, scheduled_for FROM agent_tasks WHERE id = $1", [task.id]);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(new Date(rows[0].scheduled_for).getTime()).toBeGreaterThan(before.getTime() + 50_000);
  });

  it("marks the task permanently failed once max_attempts is reached, without touching scheduled_for", async () => {
    const task = await seedTask(2, 3);
    const originalScheduledFor = (
      await pool.query("SELECT scheduled_for FROM agent_tasks WHERE id = $1", [task.id])
    ).rows[0].scheduled_for;

    await failTask(pool, task, "boom");

    const { rows } = await pool.query("SELECT status, scheduled_for FROM agent_tasks WHERE id = $1", [task.id]);
    expect(rows[0].status).toBe("failed");
    expect(new Date(rows[0].scheduled_for).getTime()).toBe(new Date(originalScheduledFor).getTime());
  });

  it("returns a failed result carrying the error message", async () => {
    const task = await seedTask(0, 3);

    const result = await failTask(pool, task, "upstream boom");

    expect(result).toEqual({ taskId: task.id, status: "failed", error: "upstream boom" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- failTask`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```typescript
// worker/src/tasks/failTask.ts
import type { Pool } from "pg";

export interface FailableTask {
  id: string;
  attempts: number;
  max_attempts: number;
}

export interface FailTaskResult {
  taskId: string;
  status: "failed";
  error: string;
}

export async function failTask(
  pool: Pool,
  task: FailableTask,
  message: string
): Promise<FailTaskResult> {
  const attempts = task.attempts + 1;
  const nextStatus = attempts < task.max_attempts ? "pending" : "failed";
  const backoffSeconds = Math.min(2 ** attempts * 30, 3600);
  await pool.query(
    `UPDATE agent_tasks
     SET status = $1,
         attempts = $2,
         scheduled_for = CASE WHEN $1 = 'pending' THEN now() + ($4 || ' seconds')::interval ELSE scheduled_for END
     WHERE id = $3`,
    [nextStatus, attempts, task.id, backoffSeconds]
  );
  return { taskId: task.id, status: "failed", error: message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- failTask`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `processResearchTask.ts` to the shared `failTask`**

In `worker/src/tasks/processResearchTask.ts`, add the import:

```typescript
import { failTask } from "./failTask.js";
```

alongside the existing imports, then delete the file's own private `async function failTask(...)`
definition at the bottom of the file — the three call sites (`return failTask(pool, task,
"...")`) are unchanged since `ClaimedResearchTask` already structurally satisfies `FailableTask`
(`id`, `attempts`, `max_attempts`).

- [ ] **Step 6: Run the research task tests to confirm behavior-preserving refactor, then the full worker suite**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- processResearchTask` → PASS, unchanged.
Then: `npm test` (no filter) → PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add worker/src/tasks/failTask.ts worker/src/tasks/failTask.test.ts worker/src/tasks/processResearchTask.ts
git commit -m "feat(worker): add shared failTask with exponential backoff, wire into processResearchTask"
```

---

### Task 8: Core adapter types + Normalizer

**Files:**
- Create: `worker/src/sources/types.ts`
- Create: `worker/src/sources/normalize.ts`
- Test: `worker/src/sources/normalize.test.ts`

**Interfaces:**
- Produces: `RawLead`, `SourceContext`, `DiscoverResult`, `LeadSourceAdapter` (types); `NormalizedLead`; `normalize(raw: RawLead): NormalizedLead`.
- Consumes: nothing — pure, no I/O.

- [ ] **Step 1: Write `types.ts`**

```typescript
// worker/src/sources/types.ts
export interface RawLead {
  externalId: string;
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
  raw: Record<string, unknown>;
}

export interface SourceContext {
  organizationId: string;
  sourceId: string;
  config: Record<string, unknown>;
  cursor: string | null;
  limit: number;
  signal: AbortSignal;
}

export interface DiscoverResult {
  cursor: string | null;
}

export interface LeadSourceAdapter {
  sourceType: string;
  discover(query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void>;
}
```

- [ ] **Step 2: Write the failing test for `normalize`**

```typescript
// worker/src/sources/normalize.test.ts
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.js";
import type { RawLead } from "./types.js";

function rawLead(overrides: Partial<RawLead> = {}): RawLead {
  return {
    externalId: "ext-1",
    company: {},
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("normalize", () => {
  it("trims whitespace from company and contact string fields", () => {
    const result = normalize(
      rawLead({
        company: { name: "  Acme Inc  ", domain: " acme.com " },
        contact: { fullName: "  Jane Doe  ", email: " jane@acme.com " },
      })
    );
    expect(result.company.name).toBe("Acme Inc");
    expect(result.company.domain).toBe("acme.com");
    expect(result.contact?.fullName).toBe("Jane Doe");
    expect(result.contact?.email).toBe("jane@acme.com");
  });

  it("coerces empty strings to null", () => {
    const result = normalize(rawLead({ company: { name: "Acme", domain: "" } }));
    expect(result.company.domain).toBeNull();
  });

  it("coerces whitespace-only strings to null", () => {
    const result = normalize(rawLead({ company: { name: "Acme", website: "   " } }));
    expect(result.company.website).toBeNull();
  });

  it("preserves a null contact as null, not an empty object", () => {
    const result = normalize(rawLead({ contact: null }));
    expect(result.contact).toBeNull();
  });

  it("preserves externalId and raw untouched", () => {
    const result = normalize(rawLead({ externalId: "ext-42", raw: { anything: 1 } }));
    expect(result.externalId).toBe("ext-42");
    expect(result.raw).toEqual({ anything: 1 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- normalize`
Expected: FAIL — `normalize.ts` doesn't exist.

- [ ] **Step 4: Implement `normalize`**

```typescript
// worker/src/sources/normalize.ts
import type { RawLead } from "./types.js";

export interface NormalizedLead {
  externalId: string;
  company: RawLead["company"];
  contact: RawLead["contact"];
  raw: Record<string, unknown>;
}

function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalize(raw: RawLead): NormalizedLead {
  const company: NormalizedLead["company"] = {
    name: trimToNull(raw.company.name),
    domain: trimToNull(raw.company.domain),
    industry: trimToNull(raw.company.industry),
    sizeRange: trimToNull(raw.company.sizeRange),
    country: trimToNull(raw.company.country),
    website: trimToNull(raw.company.website),
    linkedinUrl: trimToNull(raw.company.linkedinUrl),
    description: trimToNull(raw.company.description),
  };

  const contact: NormalizedLead["contact"] = raw.contact
    ? {
        fullName: trimToNull(raw.contact.fullName),
        title: trimToNull(raw.contact.title),
        email: trimToNull(raw.contact.email),
        phone: trimToNull(raw.contact.phone),
        linkedinUrl: trimToNull(raw.contact.linkedinUrl),
      }
    : null;

  return { externalId: raw.externalId, company, contact, raw: raw.raw };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- normalize`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add worker/src/sources/types.ts worker/src/sources/normalize.ts worker/src/sources/normalize.test.ts
git commit -m "feat(worker): add source adapter types and Normalizer"
```

---

### Task 9: Cleaner

**Files:**
- Create: `worker/src/sources/clean.ts`
- Test: `worker/src/sources/clean.test.ts`

**Interfaces:**
- Produces: `CleanedLead`; `clean(normalized: NormalizedLead): CleanedLead`.
- Consumes: `NormalizedLead` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/sources/clean.test.ts
import { describe, expect, it } from "vitest";
import { clean } from "./clean.js";
import type { NormalizedLead } from "./normalize.js";

function normalized(overrides: Partial<NormalizedLead> = {}): NormalizedLead {
  return {
    externalId: "ext-1",
    company: {},
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("clean", () => {
  it("strips protocol and www. from an explicit domain, lowercasing it", () => {
    const result = clean(normalized({ company: { domain: "https://www.ACME.com/" } }));
    expect(result.company.domain).toBe("acme.com");
  });

  it("derives domain from website when domain itself is absent", () => {
    const result = clean(normalized({ company: { website: "http://Example.org/path" } }));
    expect(result.company.domain).toBe("example.org");
  });

  it("prefers an explicit domain over deriving one from website", () => {
    const result = clean(normalized({ company: { domain: "acme.com", website: "http://other.com" } }));
    expect(result.company.domain).toBe("acme.com");
  });

  it("lowercases and trims email", () => {
    const result = clean(normalized({ contact: { email: "  Jane@ACME.com  " } }));
    expect(result.contact?.email).toBe("jane@acme.com");
  });

  it("strips non-digit characters from phone, without fabricating a country code", () => {
    const result = clean(normalized({ contact: { phone: "(555) 123-4567" } }));
    expect(result.contact?.phone).toBe("5551234567");
  });

  it("passes through a null phone as null", () => {
    const result = clean(normalized({ contact: { phone: null } }));
    expect(result.contact?.phone).toBeNull();
  });

  it("leaves company with no domain or website as null domain", () => {
    const result = clean(normalized({ company: { name: "Acme" } }));
    expect(result.company.domain).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- clean`
Expected: FAIL — `clean.ts` doesn't exist.

- [ ] **Step 3: Implement `clean`**

```typescript
// worker/src/sources/clean.ts
import type { NormalizedLead } from "./normalize.js";

export type CleanedLead = NormalizedLead;

function extractDomain(value: string): string {
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.split("/")[0];
  return domain;
}

export function clean(normalized: NormalizedLead): CleanedLead {
  const explicitDomain = normalized.company.domain;
  const derivedFromWebsite = normalized.company.website ? extractDomain(normalized.company.website) : null;
  const domain = explicitDomain ? extractDomain(explicitDomain) : derivedFromWebsite;

  const contact = normalized.contact
    ? {
        ...normalized.contact,
        email: normalized.contact.email ? normalized.contact.email.trim().toLowerCase() : null,
        phone: normalized.contact.phone ? normalized.contact.phone.replace(/\D/g, "") : null,
      }
    : null;

  return {
    ...normalized,
    company: { ...normalized.company, domain },
    contact,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- clean`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/sources/clean.ts worker/src/sources/clean.test.ts
git commit -m "feat(worker): add Cleaner (domain/email/phone canonicalization)"
```

---

### Task 10: Adapter registry

**Files:**
- Create: `worker/src/sources/registry.ts`
- Test: `worker/src/sources/registry.test.ts`

**Interfaces:**
- Produces: `createSourceRegistry(adapters: LeadSourceAdapter[]): SourceRegistry` where `SourceRegistry = { get(sourceType: string): LeadSourceAdapter | undefined }`.
- Consumes: `LeadSourceAdapter` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/sources/registry.test.ts
import { describe, expect, it } from "vitest";
import { createSourceRegistry } from "./registry.js";
import type { LeadSourceAdapter } from "./types.js";

function fakeAdapter(sourceType: string): LeadSourceAdapter {
  return {
    sourceType,
    async *discover() {
      return { cursor: null };
    },
  };
}

describe("createSourceRegistry", () => {
  it("looks up a registered adapter by sourceType", () => {
    const csv = fakeAdapter("csv");
    const registry = createSourceRegistry([csv]);
    expect(registry.get("csv")).toBe(csv);
  });

  it("returns undefined for an unregistered sourceType", () => {
    const registry = createSourceRegistry([fakeAdapter("csv")]);
    expect(registry.get("linkedin")).toBeUndefined();
  });

  it("throws when two adapters register the same sourceType", () => {
    expect(() => createSourceRegistry([fakeAdapter("csv"), fakeAdapter("csv")])).toThrow(/csv/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- registry`
Expected: FAIL — `registry.ts` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
// worker/src/sources/registry.ts
import type { LeadSourceAdapter } from "./types.js";

export interface SourceRegistry {
  get(sourceType: string): LeadSourceAdapter | undefined;
}

export function createSourceRegistry(adapters: LeadSourceAdapter[]): SourceRegistry {
  const map = new Map<string, LeadSourceAdapter>();
  for (const adapter of adapters) {
    if (map.has(adapter.sourceType)) {
      throw new Error(`Duplicate LeadSourceAdapter registered for sourceType "${adapter.sourceType}"`);
    }
    map.set(adapter.sourceType, adapter);
  }
  return {
    get(sourceType: string) {
      return map.get(sourceType);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- registry`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/sources/registry.ts worker/src/sources/registry.test.ts
git commit -m "feat(worker): add LeadSourceAdapter registry"
```

---

### Task 11: CSV/manual bulk-import adapter

**Files:**
- Create: `worker/src/sources/csvAdapter.ts`
- Test: `worker/src/sources/csvAdapter.test.ts`

**Interfaces:**
- Produces: `csvAdapter: LeadSourceAdapter` (`sourceType: "csv"`); `CsvImportQuery = { csvText: string }`.
- Consumes: `LeadSourceAdapter`/`SourceContext`/`RawLead`/`DiscoverResult` (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/sources/csvAdapter.test.ts
import { describe, expect, it } from "vitest";
import { csvAdapter } from "./csvAdapter.js";
import type { SourceContext } from "./types.js";

function context(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    organizationId: "org-1",
    sourceId: "source-1",
    config: {},
    cursor: null,
    limit: 100,
    signal: new AbortController().signal,
    ...overrides,
  };
}

const HEADER = "company_name,domain,contact_full_name,contact_email\n";

describe("csvAdapter", () => {
  it("yields one RawLead per data row", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,Jane Doe,jane@acme.com\nBeta LLC,beta.com,,\n";
    const results = [];
    const gen = csvAdapter.discover({ csvText }, context());
    let next = await gen.next();
    while (!next.done) {
      results.push(next.value);
      next = await gen.next();
    }

    expect(results).toHaveLength(2);
    expect(results[0].company.name).toBe("Acme Inc");
    expect(results[0].company.domain).toBe("acme.com");
    expect(results[0].contact?.fullName).toBe("Jane Doe");
    expect(results[0].contact?.email).toBe("jane@acme.com");
    expect(results[1].contact).toBeNull();
    expect(next.value).toEqual({ cursor: null });
  });

  it("computes a stable externalId from row content, same content -> same id across calls", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,,\n";
    const first = await csvAdapter.discover({ csvText }, context()).next();
    const second = await csvAdapter.discover({ csvText }, context()).next();
    expect(first.value.externalId).toBe(second.value.externalId);
  });

  it("computes a different externalId when row content differs", async () => {
    const a = await csvAdapter.discover({ csvText: HEADER + "Acme Inc,acme.com,,\n" }, context()).next();
    const b = await csvAdapter.discover({ csvText: HEADER + "Beta LLC,beta.com,,\n" }, context()).next();
    expect(a.value.externalId).not.toBe(b.value.externalId);
  });

  it("rejects a file larger than config.maxRows before yielding anything", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `Company ${i},company${i}.com,,`).join("\n");
    const csvText = HEADER + rows + "\n";
    const gen = csvAdapter.discover({ csvText }, context({ config: { maxRows: 3 } }));
    await expect(gen.next()).rejects.toThrow(/maxRows|5 rows exceeds/i);
  });

  it("defaults maxRows to 5000 when config doesn't specify one", async () => {
    const csvText = HEADER + "Acme Inc,acme.com,,\n";
    const gen = csvAdapter.discover({ csvText }, context());
    await expect(gen.next()).resolves.toMatchObject({ done: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- csvAdapter`
Expected: FAIL — `csvAdapter.ts` doesn't exist.

- [ ] **Step 3: Implement**

```typescript
// worker/src/sources/csvAdapter.ts
import { createHash } from "node:crypto";
import type { DiscoverResult, LeadSourceAdapter, RawLead, SourceContext } from "./types.js";

export interface CsvImportQuery {
  csvText: string;
}

interface CsvRow {
  company_name?: string;
  domain?: string;
  contact_full_name?: string;
  contact_email?: string;
}

function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row as CsvRow;
  });
}

function externalIdFor(row: CsvRow): string {
  const canonical = JSON.stringify(row, Object.keys(row).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function toRawLead(row: CsvRow): RawLead {
  return {
    externalId: externalIdFor(row),
    company: {
      name: row.company_name || null,
      domain: row.domain || null,
    },
    contact:
      row.contact_full_name || row.contact_email
        ? {
            fullName: row.contact_full_name || null,
            email: row.contact_email || null,
          }
        : null,
    raw: { ...row },
  };
}

export const csvAdapter: LeadSourceAdapter = {
  sourceType: "csv",
  async *discover(query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void> {
    const { csvText } = query as CsvImportQuery;
    const maxRows = typeof context.config.maxRows === "number" ? context.config.maxRows : 5000;
    const rows = parseCsv(csvText);
    if (rows.length > maxRows) {
      throw new Error(
        `CSV import has ${rows.length} rows, which exceeds maxRows (${maxRows}) — split the file and import it in multiple batches.`
      );
    }
    for (const row of rows) {
      yield toRawLead(row);
    }
    return { cursor: null };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- csvAdapter`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/sources/csvAdapter.ts worker/src/sources/csvAdapter.test.ts
git commit -m "feat(worker): add CSV/manual bulk-import LeadSourceAdapter"
```

---

### Task 12: Test-only fake paginating adapter

**Files:**
- Create: `worker/src/test/fakePaginatingAdapter.ts`

**Interfaces:**
- Produces: `createFakePaginatingAdapter(pages: RawLead[][]): LeadSourceAdapter` (`sourceType: "fake-paginating"`) — a test fixture proving the cursor/continuation contract, since the CSV adapter structurally can't (per the spec, §4/§6). Used by Task 14's `processLeadFinderTask` tests.
- Consumes: `LeadSourceAdapter`/`RawLead`/`DiscoverResult`/`SourceContext` (Task 8).

No dedicated test file for this task — it's a test fixture, exercised by the tests that consume it in Task 14. This mirrors the repo's existing convention of untested fixture/helper modules (e.g. `MockAIProvider` has no `MockAIProvider.test.ts` of its own; it's exercised through the tests that use it).

- [ ] **Step 1: Implement the fixture**

```typescript
// worker/src/test/fakePaginatingAdapter.ts
import type { DiscoverResult, LeadSourceAdapter, RawLead, SourceContext } from "../sources/types.js";

/**
 * A LeadSourceAdapter that only ever yields one page per discover() call, honoring
 * context.cursor as a page index — proves the framework's continuation-task contract
 * without needing a real paginated network API.
 */
export function createFakePaginatingAdapter(pages: RawLead[][]): LeadSourceAdapter {
  return {
    sourceType: "fake-paginating",
    async *discover(_query: unknown, context: SourceContext): AsyncGenerator<RawLead, DiscoverResult, void> {
      const pageIndex = context.cursor ? Number(context.cursor) : 0;
      const page = pages[pageIndex] ?? [];
      for (const lead of page) {
        yield lead;
      }
      const nextIndex = pageIndex + 1;
      const hasMore = nextIndex < pages.length;
      return { cursor: hasMore ? String(nextIndex) : null };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/test/fakePaginatingAdapter.ts
git commit -m "test(worker): add fake paginating adapter fixture for continuation-cursor tests"
```

---

### Task 13: Dedup/Merge

**Files:**
- Create: `worker/src/sources/mergeLead.ts`
- Test: `worker/src/sources/mergeLead.test.ts`

**Interfaces:**
- Produces: `mergeLead(pool, organizationId, cleaned: CleanedLead): Promise<MergeResult>` (standalone,
  manages its own transaction) and `mergeLeadWithClient(client: PoolClient, organizationId, cleaned): Promise<MergeResult>`
  (same logic, runs on a caller-supplied, already-open transaction — this is what Task 14 uses).
  `MergeResult = { outcome: "merged" | "rejected"; companyId?: string; contactId?: string; leadId?: string; isNewLead?: boolean; rejectionReason?: string }`.
- Consumes: `CleanedLead` (Task 9), `companies`/`contacts`/`leads` (existing schema, reconciled test shape from Task 3).

This is the one stage requiring the DB. `mergeLeadWithClient` does the actual work and takes zero
responsibility for transaction boundaries — the caller decides where BEGIN/COMMIT/ROLLBACK go.
This matters concretely in Task 14: `processLeadFinderTask` needs the `raw_leads` insert, the
merge, and the `raw_leads` status update to all commit or roll back as one atomic unit (per the
crash-safety design in the spec's §"Trust boundary"/§6 Step 5) — that's only possible if the merge
runs on the *same* database connection/transaction as the rest of that unit, not a second one it
opens for itself. `mergeLead` is a thin convenience wrapper around `mergeLeadWithClient` for
standalone callers (including this file's own tests below) that don't need to compose into a
larger transaction.

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/sources/mergeLead.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { mergeLead } from "./mergeLead.js";
import type { CleanedLead } from "./clean.js";

let pool: Pool;
const ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

function cleaned(overrides: Partial<CleanedLead> = {}): CleanedLead {
  return {
    externalId: "ext-1",
    company: { name: "Acme Inc", domain: "acme.com" },
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("mergeLead", () => {
  it("creates a new company, contact, and lead when nothing exists yet", async () => {
    const result = await mergeLead(
      pool,
      ORG_ID,
      cleaned({ contact: { fullName: "Jane Doe", email: "jane@acme.com" } })
    );

    expect(result.outcome).toBe("merged");
    expect(result.isNewLead).toBe(true);

    const company = await pool.query("SELECT name, domain FROM companies WHERE id = $1", [result.companyId]);
    expect(company.rows[0]).toEqual({ name: "Acme Inc", domain: "acme.com" });

    const contact = await pool.query("SELECT full_name, email, company_id FROM contacts WHERE id = $1", [result.contactId]);
    expect(contact.rows[0]).toMatchObject({ full_name: "Jane Doe", email: "jane@acme.com", company_id: result.companyId });

    const lead = await pool.query("SELECT status, company_id FROM leads WHERE id = $1", [result.leadId]);
    expect(lead.rows[0]).toMatchObject({ status: "new", company_id: result.companyId });
  });

  it("finds an existing company by organization+domain and fills gaps without clobbering existing data", async () => {
    const existing = await pool.query(
      "INSERT INTO companies (organization_id, name, domain, industry) VALUES ($1, 'Acme Inc', 'acme.com', 'Fintech') RETURNING id",
      [ORG_ID]
    );

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme", domain: "acme.com", country: "US" } }));

    expect(result.companyId).toBe(existing.rows[0].id);
    const company = await pool.query("SELECT name, industry, country FROM companies WHERE id = $1", [result.companyId]);
    expect(company.rows[0]).toEqual({ name: "Acme Inc", industry: "Fintech", country: "US" });
  });

  it("finds an existing contact by organization+email", async () => {
    const company = await pool.query("INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme Inc') RETURNING id", [ORG_ID]);
    const existingContact = await pool.query(
      "INSERT INTO contacts (organization_id, company_id, full_name, email) VALUES ($1, $2, 'Jane Doe', 'jane@acme.com') RETURNING id",
      [ORG_ID, company.rows[0].id]
    );

    const result = await mergeLead(
      pool,
      ORG_ID,
      cleaned({
        company: { name: "Acme Inc", domain: null },
        contact: { fullName: "Jane D.", email: "jane@acme.com" },
      })
    );

    expect(result.contactId).toBe(existingContact.rows[0].id);
  });

  it("always inserts a fresh company when domain is absent (accepted duplication limitation)", async () => {
    await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: null } }));
    const second = await mergeLead(pool, ORG_ID, cleaned({ externalId: "ext-2", company: { name: "Acme Inc", domain: null } }));

    expect(second.outcome).toBe("merged");
    const companies = await pool.query("SELECT id FROM companies WHERE organization_id = $1", [ORG_ID]);
    expect(companies.rows).toHaveLength(2);
  });

  it("attaches to an existing active lead instead of creating a new one", async () => {
    const company = await pool.query(
      "INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Inc', 'acme.com') RETURNING id",
      [ORG_ID]
    );
    const existingLead = await pool.query(
      "INSERT INTO leads (organization_id, company_id, status) VALUES ($1, $2, 'qualified') RETURNING id",
      [ORG_ID, company.rows[0].id]
    );

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));

    expect(result.leadId).toBe(existingLead.rows[0].id);
    expect(result.isNewLead).toBe(false);
    const leads = await pool.query("SELECT id FROM leads WHERE company_id = $1", [company.rows[0].id]);
    expect(leads.rows).toHaveLength(1);
  });

  it("creates a new lead when all prior leads for the company are terminal", async () => {
    const company = await pool.query(
      "INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Inc', 'acme.com') RETURNING id",
      [ORG_ID]
    );
    await pool.query("INSERT INTO leads (organization_id, company_id, status) VALUES ($1, $2, 'lost')", [
      ORG_ID,
      company.rows[0].id,
    ]);

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));

    expect(result.isNewLead).toBe(true);
    const leads = await pool.query("SELECT status FROM leads WHERE company_id = $1 ORDER BY created_at", [company.rows[0].id]);
    expect(leads.rows).toHaveLength(2);
    expect(leads.rows[1].status).toBe("new");
  });

  it("rejects a RawLead with no usable company name, touching no tables", async () => {
    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: null, domain: "acme.com" } }));

    expect(result.outcome).toBe("rejected");
    expect(result.rejectionReason).toBeTruthy();
    const companies = await pool.query("SELECT id FROM companies");
    expect(companies.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- mergeLead`
Expected: FAIL — `mergeLead.ts` doesn't exist.

- [ ] **Step 3: Implement `mergeLead`**

```typescript
// worker/src/sources/mergeLead.ts
import type { Pool, PoolClient } from "pg";
import type { CleanedLead } from "./clean.js";

export interface MergeResult {
  outcome: "merged" | "rejected";
  companyId?: string;
  contactId?: string;
  leadId?: string;
  isNewLead?: boolean;
  rejectionReason?: string;
}

const TERMINAL_LEAD_STATUSES = ["won", "lost", "disqualified"] as const;

async function resolveCompany(client: PoolClient, organizationId: string, cleaned: CleanedLead): Promise<string> {
  const { name, domain, industry, sizeRange, country, website, linkedinUrl, description } = cleaned.company;
  if (domain) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO companies (organization_id, name, domain, industry, size_range, country, website, linkedin_url, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, domain) WHERE domain IS NOT NULL
       DO UPDATE SET
         industry = COALESCE(companies.industry, EXCLUDED.industry),
         size_range = COALESCE(companies.size_range, EXCLUDED.size_range),
         country = COALESCE(companies.country, EXCLUDED.country),
         website = COALESCE(companies.website, EXCLUDED.website),
         linkedin_url = COALESCE(companies.linkedin_url, EXCLUDED.linkedin_url),
         description = COALESCE(companies.description, EXCLUDED.description)
       RETURNING id`,
      [organizationId, name, domain, industry, sizeRange, country, website, linkedinUrl, description]
    );
    return rows[0].id;
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO companies (organization_id, name, industry, size_range, country, website, linkedin_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [organizationId, name, industry, sizeRange, country, website, linkedinUrl, description]
  );
  return rows[0].id;
}

async function resolveContact(
  client: PoolClient,
  organizationId: string,
  companyId: string,
  cleaned: CleanedLead
): Promise<string | undefined> {
  if (!cleaned.contact) return undefined;
  const { fullName, title, email, phone, linkedinUrl } = cleaned.contact;
  if (!fullName) return undefined;

  if (email) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO contacts (organization_id, company_id, full_name, title, email, phone, linkedin_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, email) WHERE email IS NOT NULL
       DO UPDATE SET
         title = COALESCE(contacts.title, EXCLUDED.title),
         phone = COALESCE(contacts.phone, EXCLUDED.phone),
         linkedin_url = COALESCE(contacts.linkedin_url, EXCLUDED.linkedin_url)
       RETURNING id`,
      [organizationId, companyId, fullName, title, email, phone, linkedinUrl]
    );
    return rows[0].id;
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO contacts (organization_id, company_id, full_name, title, phone, linkedin_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [organizationId, companyId, fullName, title, phone, linkedinUrl]
  );
  return rows[0].id;
}

async function resolveLead(
  client: PoolClient,
  organizationId: string,
  companyId: string,
  contactId: string | undefined
): Promise<{ leadId: string; isNewLead: boolean }> {
  const active = await client.query<{ id: string }>(
    `SELECT id FROM leads WHERE company_id = $1 AND status NOT IN ($2, $3, $4) ORDER BY created_at DESC LIMIT 1`,
    [companyId, ...TERMINAL_LEAD_STATUSES]
  );
  if (active.rows[0]) {
    return { leadId: active.rows[0].id, isNewLead: false };
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO leads (organization_id, company_id, contact_id, status) VALUES ($1, $2, $3, 'new') RETURNING id`,
    [organizationId, companyId, contactId ?? null]
  );
  return { leadId: rows[0].id, isNewLead: true };
}

/**
 * Runs the merge against an already-open transaction — it does NOT manage BEGIN/COMMIT/ROLLBACK
 * itself. This is what lets a caller (processLeadFinderTask, Task 14) compose it into a larger
 * caller-owned transaction that also covers the raw_leads insert and status update, so the whole
 * per-record unit commits or rolls back together. Standalone callers (including this file's own
 * tests) should use mergeLead() below instead.
 */
export async function mergeLeadWithClient(
  client: PoolClient,
  organizationId: string,
  cleaned: CleanedLead
): Promise<MergeResult> {
  if (!cleaned.company.name) {
    return { outcome: "rejected", rejectionReason: "No usable company name" };
  }

  const companyId = await resolveCompany(client, organizationId, cleaned);
  const contactId = await resolveContact(client, organizationId, companyId, cleaned);
  const { leadId, isNewLead } = await resolveLead(client, organizationId, companyId, contactId);

  if (isNewLead) {
    await client.query(`INSERT INTO agent_tasks (organization_id, task_type, payload) VALUES ($1, 'research', $2)`, [
      organizationId,
      JSON.stringify({ lead_id: leadId }),
    ]);
  }

  return { outcome: "merged", companyId, contactId, leadId, isNewLead };
}

/** Standalone convenience wrapper: opens and manages its own transaction. */
export async function mergeLead(pool: Pool, organizationId: string, cleaned: CleanedLead): Promise<MergeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await mergeLeadWithClient(client, organizationId, cleaned);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- mergeLead`
Expected: PASS (7 tests).

- [ ] **Step 5: Add a test confirming the `research` task auto-enqueue behavior explicitly**

```typescript
// worker/src/sources/mergeLead.test.ts — add this test to the existing describe block
  it("enqueues a research agent_task only when a new lead is created, not when attaching to an existing one", async () => {
    await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));
    const afterFirstMerge = await pool.query("SELECT task_type, payload FROM agent_tasks");
    expect(afterFirstMerge.rows).toHaveLength(1);
    expect(afterFirstMerge.rows[0].task_type).toBe("research");

    await mergeLead(pool, ORG_ID, cleaned({ externalId: "ext-2", company: { name: "Acme Inc", domain: "acme.com" } }));
    const afterSecondMerge = await pool.query("SELECT id FROM agent_tasks");
    expect(afterSecondMerge.rows).toHaveLength(1);
  });
```

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- mergeLead`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add worker/src/sources/mergeLead.ts worker/src/sources/mergeLead.test.ts
git commit -m "feat(worker): add Dedup/Merge — resolve-or-create company/contact/lead, enqueue research"
```

---

### Task 14: `processLeadFinderTask`

**Files:**
- Create: `worker/src/tasks/processLeadFinderTask.ts`
- Test: `worker/src/tasks/processLeadFinderTask.test.ts`

**Interfaces:**
- Produces: `processLeadFinderTask(pool, registry, task): Promise<ProcessLeadFinderTaskResult>` where
  `ProcessLeadFinderTaskResult = { taskId: string; status: "succeeded" | "failed"; discovered: number; merged: number; rejected: number; errored: number; error?: string }`.
- Consumes: `claimTasks`'s `ClaimedTask` shape (Task 4), `failTask` (Task 7), `SourceRegistry` (Task 10), `normalize`/`clean`/`mergeLead` (Tasks 8/9/13).

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/tasks/processLeadFinderTask.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { createFakePaginatingAdapter } from "../test/fakePaginatingAdapter.js";
import { createSourceRegistry } from "../sources/registry.js";
import { csvAdapter } from "../sources/csvAdapter.js";
import { claimTasks } from "./claimTasks.js";
import { processLeadFinderTask } from "./processLeadFinderTask.js";
import type { RawLead } from "../sources/types.js";

let pool: Pool;
const ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedSource(sourceType: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO lead_sources (organization_id, name, code, source_type) VALUES ($1, 'Test Source', $2, $3) RETURNING id`,
    [ORG_ID, `test-${sourceType}`, sourceType]
  );
  return rows[0].id;
}

async function seedAndClaimLeadFinderTask(sourceId: string, query: unknown, cursor: string | null = null) {
  await pool.query(`INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'lead_finder', 'pending', $2)`, [
    ORG_ID,
    JSON.stringify({ sourceId, query, cursor }),
  ]);
  const [task] = await claimTasks(pool, "worker-1", "lead_finder", 1);
  return task;
}

const CSV_HEADER = "company_name,domain,contact_full_name,contact_email\n";

describe("processLeadFinderTask — CSV adapter", () => {
  it("ingests a CSV import end to end: raw_leads staged, companies/contacts/leads created", async () => {
    const sourceId = await seedSource("csv");
    const csvText = CSV_HEADER + "Acme Inc,acme.com,Jane Doe,jane@acme.com\n";
    const task = await seedAndClaimLeadFinderTask(sourceId, { csvText });
    const registry = createSourceRegistry([csvAdapter]);

    const result = await processLeadFinderTask(pool, registry, task);

    expect(result).toMatchObject({ status: "succeeded", discovered: 1, merged: 1, rejected: 0, errored: 0 });

    const rawLeads = await pool.query("SELECT pipeline_status, lead_id FROM raw_leads WHERE source_id = $1", [sourceId]);
    expect(rawLeads.rows).toHaveLength(1);
    expect(rawLeads.rows[0].pipeline_status).toBe("merged");
    expect(rawLeads.rows[0].lead_id).toBeTruthy();

    const companies = await pool.query("SELECT name, domain FROM companies WHERE organization_id = $1", [ORG_ID]);
    expect(companies.rows).toEqual([{ name: "Acme Inc", domain: "acme.com" }]);

    const researchTasks = await pool.query("SELECT id FROM agent_tasks WHERE task_type = 'research'");
    expect(researchTasks.rows).toHaveLength(1);
  });

  it("is idempotent: re-running the same CSV does not create duplicate raw_leads rows", async () => {
    const sourceId = await seedSource("csv");
    const csvText = CSV_HEADER + "Acme Inc,acme.com,,\n";

    const firstTask = await seedAndClaimLeadFinderTask(sourceId, { csvText });
    const registry = createSourceRegistry([csvAdapter]);
    await processLeadFinderTask(pool, registry, firstTask);

    const secondTask = await seedAndClaimLeadFinderTask(sourceId, { csvText });
    const result = await processLeadFinderTask(pool, registry, secondTask);

    expect(result.discovered).toBe(1);
    expect(result.merged).toBe(0);
    const rawLeads = await pool.query("SELECT id FROM raw_leads WHERE source_id = $1", [sourceId]);
    expect(rawLeads.rows).toHaveLength(1);
  });

  it("isolates a per-record error without failing the whole batch", async () => {
    const sourceId = await seedSource("csv");
    const csvText = CSV_HEADER + "Acme Inc,acme.com,,\n,bad-domain.com,,\n";
    const task = await seedAndClaimLeadFinderTask(sourceId, { csvText });
    const registry = createSourceRegistry([csvAdapter]);

    const result = await processLeadFinderTask(pool, registry, task);

    expect(result.discovered).toBe(2);
    expect(result.merged).toBe(1);
    expect(result.rejected).toBe(1);

    const rawLeads = await pool.query("SELECT pipeline_status FROM raw_leads WHERE source_id = $1 ORDER BY discovered_at", [sourceId]);
    expect(rawLeads.rows.map((r) => r.pipeline_status)).toEqual(["merged", "rejected"]);
  });

  it("fails the task via failTask when the source's source_type has no registered adapter", async () => {
    const sourceId = await seedSource("unregistered-type");
    const task = await seedAndClaimLeadFinderTask(sourceId, {});
    const registry = createSourceRegistry([csvAdapter]);

    const result = await processLeadFinderTask(pool, registry, task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/unregistered-type/);
    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });

  it("writes an agent_runs row with a null provider and the run summary as output", async () => {
    const sourceId = await seedSource("csv");
    const csvText = CSV_HEADER + "Acme Inc,acme.com,,\n";
    const task = await seedAndClaimLeadFinderTask(sourceId, { csvText });
    const registry = createSourceRegistry([csvAdapter]);

    await processLeadFinderTask(pool, registry, task);

    const runs = await pool.query("SELECT status, provider, output FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe("succeeded");
    expect(runs.rows[0].provider).toBeNull();
    expect(runs.rows[0].output).toMatchObject({ discovered: 1, merged: 1, rejected: 0, errored: 0 });
  });
});

describe("processLeadFinderTask — continuation cursor", () => {
  it("enqueues a continuation lead_finder task with the adapter's returned cursor", async () => {
    const sourceId = await seedSource("fake-paginating");
    const pageOne: RawLead[] = [
      { externalId: "p1-1", company: { name: "Company One" }, contact: null, raw: {} },
    ];
    const pageTwo: RawLead[] = [
      { externalId: "p2-1", company: { name: "Company Two" }, contact: null, raw: {} },
    ];
    const adapter = createFakePaginatingAdapter([pageOne, pageTwo]);
    const registry = createSourceRegistry([adapter]);
    const task = await seedAndClaimLeadFinderTask(sourceId, {});

    const result = await processLeadFinderTask(pool, registry, task);

    expect(result.discovered).toBe(1);
    const continuation = await pool.query(
      "SELECT payload, idempotency_key FROM agent_tasks WHERE task_type = 'lead_finder' AND status = 'pending'"
    );
    expect(continuation.rows).toHaveLength(1);
    expect(continuation.rows[0].payload.cursor).toBe("1");
    expect(continuation.rows[0].idempotency_key).toBe(`leadfinder:${sourceId}:1`);
  });

  it("does not enqueue a continuation once the adapter is exhausted", async () => {
    const sourceId = await seedSource("fake-paginating");
    const onlyPage: RawLead[] = [{ externalId: "p1-1", company: { name: "Company One" }, contact: null, raw: {} }];
    const adapter = createFakePaginatingAdapter([onlyPage]);
    const registry = createSourceRegistry([adapter]);
    const task = await seedAndClaimLeadFinderTask(sourceId, {});

    await processLeadFinderTask(pool, registry, task);

    const pending = await pool.query("SELECT id FROM agent_tasks WHERE task_type = 'lead_finder' AND status = 'pending'");
    expect(pending.rows).toHaveLength(0);
  });

  it("re-enqueuing the same cursor twice is a safe no-op via the idempotency_key unique index", async () => {
    const sourceId = await seedSource("fake-paginating");
    const pages: RawLead[][] = [[{ externalId: "p1-1", company: { name: "Company One" }, contact: null, raw: {} }], []];
    const adapter = createFakePaginatingAdapter(pages);
    const registry = createSourceRegistry([adapter]);
    const taskA = await seedAndClaimLeadFinderTask(sourceId, {});
    const taskB = await seedAndClaimLeadFinderTask(sourceId, {});

    await processLeadFinderTask(pool, registry, taskA);
    await processLeadFinderTask(pool, registry, taskB);

    const continuations = await pool.query(
      "SELECT id FROM agent_tasks WHERE task_type = 'lead_finder' AND idempotency_key = $1",
      [`leadfinder:${sourceId}:1`]
    );
    expect(continuations.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- processLeadFinderTask`
Expected: FAIL — `processLeadFinderTask.ts` doesn't exist.

- [ ] **Step 3: Implement `processLeadFinderTask`**

```typescript
// worker/src/tasks/processLeadFinderTask.ts
import type { Pool } from "pg";
import type { ClaimedTask } from "./claimTasks.js";
import { failTask } from "./failTask.js";
import type { SourceRegistry } from "../sources/registry.js";
import { normalize } from "../sources/normalize.js";
import { clean } from "../sources/clean.js";
import { mergeLeadWithClient } from "../sources/mergeLead.js";
import type { RawLead } from "../sources/types.js";

export interface ProcessLeadFinderTaskResult {
  taskId: string;
  status: "succeeded" | "failed";
  discovered: number;
  merged: number;
  rejected: number;
  errored: number;
  error?: string;
}

interface LeadSourceRow {
  id: string;
  organization_id: string;
  source_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
}

interface LeadFinderPayload {
  sourceId: string;
  query: unknown;
  cursor?: string | null;
}

async function stageAndMergeOneRawLead(
  pool: Pool,
  organizationId: string,
  sourceId: string,
  rawLead: RawLead
): Promise<"inserted-merged" | "inserted-rejected" | "inserted-errored" | "already-seen"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_id, external_id) DO NOTHING
       RETURNING id`,
      [sourceId, rawLead.externalId, JSON.stringify(rawLead.raw)]
    );
    if (!inserted.rows[0]) {
      await client.query("COMMIT");
      return "already-seen";
    }
    const rawLeadId = inserted.rows[0].id;

    try {
      const cleaned = clean(normalize(rawLead));
      const merged = await mergeLeadWithClient(client, organizationId, cleaned);
      if (merged.outcome === "rejected") {
        await client.query(
          `UPDATE raw_leads SET pipeline_status = 'rejected', rejection_reason = $1, processed_at = now() WHERE id = $2`,
          [merged.rejectionReason, rawLeadId]
        );
        await client.query("COMMIT");
        return "inserted-rejected";
      }
      await client.query(
        `UPDATE raw_leads SET pipeline_status = 'merged', lead_id = $1, processed_at = now() WHERE id = $2`,
        [merged.leadId, rawLeadId]
      );
      await client.query("COMMIT");
      return "inserted-merged";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE raw_leads SET pipeline_status = 'errored', error_message = $1, processed_at = now() WHERE id = $2`,
        [message, rawLeadId]
      );
      await client.query("COMMIT");
      return "inserted-errored";
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function processLeadFinderTask(
  pool: Pool,
  registry: SourceRegistry,
  task: ClaimedTask,
  leadFinderBatchSize = 100
): Promise<ProcessLeadFinderTaskResult> {
  const payload = task.payload as unknown as LeadFinderPayload;
  const sourceResult = await pool.query<LeadSourceRow>(
    `SELECT id, organization_id, source_type, config, is_active FROM lead_sources WHERE id = $1`,
    [payload.sourceId]
  );
  const source = sourceResult.rows[0];
  if (!source || !source.is_active) {
    const failed = await failTask(pool, task, `lead_sources ${payload.sourceId} not found or inactive`);
    return { taskId: failed.taskId, status: "failed", discovered: 0, merged: 0, rejected: 0, errored: 0, error: failed.error };
  }

  const adapter = registry.get(source.source_type);
  if (!adapter) {
    const failed = await failTask(pool, task, `No LeadSourceAdapter registered for source_type "${source.source_type}"`);
    return { taskId: failed.taskId, status: "failed", discovered: 0, merged: 0, rejected: 0, errored: 0, error: failed.error };
  }

  await pool.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);

  const controller = new AbortController();
  let discovered = 0;
  let merged = 0;
  let rejected = 0;
  let errored = 0;

  const generator = adapter.discover(payload.query, {
    organizationId: source.organization_id,
    sourceId: source.id,
    config: source.config,
    cursor: payload.cursor ?? null,
    limit: leadFinderBatchSize,
    signal: controller.signal,
  });

  let next = await generator.next();
  while (!next.done) {
    discovered++;
    const outcome = await stageAndMergeOneRawLead(pool, source.organization_id, source.id, next.value);
    if (outcome === "inserted-merged") merged++;
    else if (outcome === "inserted-rejected") rejected++;
    else if (outcome === "inserted-errored") errored++;
    next = await generator.next();
  }

  const discoverResult = next.value;
  if (discoverResult.cursor !== null) {
    const idempotencyKey = `leadfinder:${source.id}:${discoverResult.cursor}`;
    await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, payload, idempotency_key)
       VALUES ($1, 'lead_finder', $2, $3)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [source.organization_id, JSON.stringify({ sourceId: source.id, query: payload.query, cursor: discoverResult.cursor }), idempotencyKey]
    );
  }

  await pool.query(
    `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, output)
     VALUES ($1, 'succeeded', NULL, now(), now(), $2)`,
    [task.id, JSON.stringify({ discovered, merged, rejected, errored })]
  );
  await pool.query("UPDATE agent_tasks SET status = 'succeeded' WHERE id = $1", [task.id]);

  return { taskId: task.id, status: "succeeded", discovered, merged, rejected, errored };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- processLeadFinderTask`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/tasks/processLeadFinderTask.ts worker/src/tasks/processLeadFinderTask.test.ts
git commit -m "feat(worker): add processLeadFinderTask — adapter discovery through staging to merge"
```

---

### Task 15: `runLeadFinderTask` entrypoint + `taskEnv`

**Files:**
- Create: `worker/src/tasks/runLeadFinderTask.ts`
- Test: `worker/src/tasks/runLeadFinderTask.test.ts`
- Modify: `worker/src/config/taskEnv.ts`
- Modify: `worker/src/config/taskEnv.test.ts` (pre-existing file — its strict `toEqual` assertion needs updating for the new field, see Step 2)
- Modify: `worker/package.json`

**Interfaces:**
- Produces: `runLeadFinderTask(pool, registry, batchSize): Promise<RunLeadFinderTaskSummary>` where `RunLeadFinderTaskSummary = { claimed: number; succeeded: number; failed: number }`; `TaskEnv.leadFinderBatchSize`.
- Consumes: `claimTasks` (Task 4), `processLeadFinderTask` (Task 14).

- [ ] **Step 1: Add `leadFinderBatchSize` to `taskEnv.ts`**

```typescript
// worker/src/config/taskEnv.ts — full replacement
export interface TaskEnv {
  databaseUrl: string;
  researchBatchSize: number;
  leadFinderBatchSize: number;
}

const DEFAULT_RESEARCH_BATCH_SIZE = 5;
const DEFAULT_LEAD_FINDER_BATCH_SIZE = 100;

function parsePositiveInt(raw: string | undefined, envVarName: string, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${envVarName} "${raw}" — must be a positive integer.`);
  }
  return parsed;
}

export function loadTaskEnv(
  source: Record<string, string | undefined> = process.env
): TaskEnv {
  const databaseUrl = source.WORKER_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required to run task processing.");
  }

  return {
    databaseUrl,
    researchBatchSize: parsePositiveInt(source.WORKER_RESEARCH_BATCH_SIZE?.trim(), "WORKER_RESEARCH_BATCH_SIZE", DEFAULT_RESEARCH_BATCH_SIZE),
    leadFinderBatchSize: parsePositiveInt(
      source.WORKER_LEAD_FINDER_BATCH_SIZE?.trim(),
      "WORKER_LEAD_FINDER_BATCH_SIZE",
      DEFAULT_LEAD_FINDER_BATCH_SIZE
    ),
  };
}
```

- [ ] **Step 2: Update the existing `taskEnv.test.ts` for the new field**

`worker/src/config/taskEnv.test.ts` already exists (pre-dates this plan) and its first test uses a
strict `toEqual` on the *entire* returned object — adding `leadFinderBatchSize` to `TaskEnv` will
break it unless the expectation is updated too. Change:

```typescript
// worker/src/config/taskEnv.test.ts — line 9, inside "returns the database URL with a default batch size of 5"
    expect(env).toEqual({ databaseUrl: DB_URL, researchBatchSize: 5 });
```

to:

```typescript
    expect(env).toEqual({ databaseUrl: DB_URL, researchBatchSize: 5, leadFinderBatchSize: 100 });
```

Every other existing test in that file (missing `WORKER_DATABASE_URL`, custom
`WORKER_RESEARCH_BATCH_SIZE`, invalid/zero `WORKER_RESEARCH_BATCH_SIZE`) asserts only on
`researchBatchSize` or the thrown error, not the whole object, so none of those need changes.

Then add two new tests to the same file's `describe` block, covering the new field the same way
the existing ones cover `researchBatchSize`:

```typescript
  it("accepts a custom positive integer lead finder batch size", () => {
    const env = loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_LEAD_FINDER_BATCH_SIZE: "250" });
    expect(env.leadFinderBatchSize).toBe(250);
  });

  it("throws for a non-integer lead finder batch size", () => {
    expect(() =>
      loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_LEAD_FINDER_BATCH_SIZE: "abc" })
    ).toThrow(/WORKER_LEAD_FINDER_BATCH_SIZE/);
  });
```

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- taskEnv`
Expected: PASS (7 tests: the original 5, with test 1's expectation updated, plus 2 new).

- [ ] **Step 3: Write the failing test for `runLeadFinderTask`**

```typescript
// worker/src/tasks/runLeadFinderTask.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { createSourceRegistry } from "../sources/registry.js";
import { csvAdapter } from "../sources/csvAdapter.js";
import { runLeadFinderTask } from "./runLeadFinderTask.js";

let pool: Pool;
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const CSV_HEADER = "company_name,domain,contact_full_name,contact_email\n";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedCsvSourceAndTask(csvText: string) {
  const source = await pool.query<{ id: string }>(
    `INSERT INTO lead_sources (organization_id, name, code, source_type) VALUES ($1, 'CSV', 'csv-1', 'csv') RETURNING id`,
    [ORG_ID]
  );
  await pool.query(`INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'lead_finder', 'pending', $2)`, [
    ORG_ID,
    JSON.stringify({ sourceId: source.rows[0].id, query: { csvText } }),
  ]);
}

describe("runLeadFinderTask", () => {
  it("claims and processes a batch of pending lead_finder tasks end to end", async () => {
    await seedCsvSourceAndTask(CSV_HEADER + "Acme Inc,acme.com,,\n");
    await seedCsvSourceAndTask(CSV_HEADER + "Beta LLC,beta.com,,\n");

    const registry = createSourceRegistry([csvAdapter]);
    const summary = await runLeadFinderTask(pool, registry, 5);

    expect(summary).toEqual({ claimed: 2, succeeded: 2, failed: 0 });
    const companies = await pool.query("SELECT id FROM companies");
    expect(companies.rows).toHaveLength(2);
  });

  it("returns zeros when there is nothing pending", async () => {
    const registry = createSourceRegistry([csvAdapter]);
    const summary = await runLeadFinderTask(pool, registry, 5);
    expect(summary).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- runLeadFinderTask`
Expected: FAIL — `runLeadFinderTask.ts` doesn't exist.

- [ ] **Step 5: Implement `runLeadFinderTask`**

```typescript
// worker/src/tasks/runLeadFinderTask.ts
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "../db/pool.js";
import { loadTaskEnv } from "../config/taskEnv.js";
import { claimTasks } from "./claimTasks.js";
import { processLeadFinderTask } from "./processLeadFinderTask.js";
import { createSourceRegistry, type SourceRegistry } from "../sources/registry.js";
import { csvAdapter } from "../sources/csvAdapter.js";

export interface RunLeadFinderTaskSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runLeadFinderTask(
  pool: Pool,
  registry: SourceRegistry,
  batchSize: number
): Promise<RunLeadFinderTaskSummary> {
  const workerId = `lead-finder-${process.pid}-${randomUUID()}`;
  const tasks = await claimTasks(pool, workerId, "lead_finder", batchSize);

  let succeeded = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const result = await processLeadFinderTask(pool, registry, task, batchSize);
      if (result.status === "succeeded") succeeded++;
      else failed++;
    } catch (error) {
      console.error(`Unhandled error processing lead_finder task ${task.id}:`, error);
      failed++;
    }
  }

  return { claimed: tasks.length, succeeded, failed };
}

async function main(): Promise<void> {
  const taskEnv = loadTaskEnv();
  const pool = createPool(taskEnv.databaseUrl);
  const registry = createSourceRegistry([csvAdapter]);
  try {
    const summary = await runLeadFinderTask(pool, registry, taskEnv.leadFinderBatchSize);
    console.log(
      `Lead finder task run complete: claimed=${summary.claimed} succeeded=${summary.succeeded} failed=${summary.failed}`
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- runLeadFinderTask`
Expected: PASS (2 tests).

- [ ] **Step 7: Add the `npm run` scripts**

```json
// worker/package.json — scripts block, add these two lines alongside the existing task:research entries
    "task:lead_finder": "node dist/tasks/runLeadFinderTask.js",
    "task:lead_finder:dev": "tsx src/tasks/runLeadFinderTask.ts",
```

- [ ] **Step 8: Run the full worker suite**

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test`
Expected: PASS, every file.

- [ ] **Step 9: Commit**

```bash
git add worker/src/tasks/runLeadFinderTask.ts worker/src/tasks/runLeadFinderTask.test.ts worker/src/config/taskEnv.ts worker/src/config/taskEnv.test.ts worker/package.json
git commit -m "feat(worker): add runLeadFinderTask entrypoint and WORKER_LEAD_FINDER_BATCH_SIZE config"
```

---

### Task 16: CLI script to enqueue a CSV import

**Files:**
- Create: `worker/scripts/enqueue-csv-import.ts`
- Modify: `worker/package.json`
- Modify: `worker/tsconfig.build.json` (or equivalent scripts tsconfig, if `worker/` needs one — see Step 1)

**Interfaces:**
- Produces: a CLI invoked as `npm run enqueue-csv-import -- <organization-id> <source-id> <csv-file-path>`, inserting one `agent_tasks` row (`task_type='lead_finder'`).
- Consumes: nothing from earlier tasks except the `agent_tasks` table shape.

This mirrors `server/scripts/create-admin.ts`'s convention: a plain script, no dedicated test file
(consistent with that existing precedent — it's exercised by manual/operational use, not unit
tests; the actual ingestion logic it triggers is already fully tested in Tasks 13–15).

- [ ] **Step 1: Check whether `worker/` already has a `scripts` build/run convention**

`server/` has `build:scripts` (`tsc -p tsconfig.scripts.json`) because its `Dockerfile` only
compiles `src/`. `worker/`'s `task:*:dev` scripts already run TypeScript directly via `tsx` without
a separate compile step, so no new tsconfig is needed — add the script under `worker/scripts/` and
run it the same way (`tsx worker/scripts/enqueue-csv-import.ts`).

- [ ] **Step 2: Implement the script**

```typescript
// worker/scripts/enqueue-csv-import.ts
import { readFileSync } from "node:fs";
import { loadTaskEnv } from "../src/config/taskEnv.js";
import { createPool } from "../src/db/pool.js";

async function main(): Promise<void> {
  const [, , organizationId, sourceId, csvFilePath] = process.argv;
  if (!organizationId || !sourceId || !csvFilePath) {
    console.error("Usage: npm run enqueue-csv-import -- <organization-id> <source-id> <csv-file-path>");
    process.exitCode = 1;
    return;
  }

  const csvText = readFileSync(csvFilePath, "utf8");
  const taskEnv = loadTaskEnv();
  const pool = createPool(taskEnv.databaseUrl);
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (organization_id, task_type, payload)
       VALUES ($1, 'lead_finder', $2) RETURNING id`,
      [organizationId, JSON.stringify({ sourceId, query: { csvText } })]
    );
    console.log(`Enqueued lead_finder task ${rows[0].id} for source ${sourceId}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Add the `npm run` script**

```json
// worker/package.json — scripts block
    "enqueue-csv-import": "tsx scripts/enqueue-csv-import.ts",
```

- [ ] **Step 4: Verify manually against the local test database**

Run (from `worker/`, with a real Postgres reachable at `WORKER_DATABASE_URL` — e.g. the same
`drickly_worker_test` database used by the test suite, or a real dev database with `lead_sources`
seeded):

```bash
WORKER_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" \
  npm run enqueue-csv-import -- 00000000-0000-0000-0000-000000000001 <a-real-lead_sources-id> ./sample.csv
```

Expected: prints `Enqueued lead_finder task <uuid> for source <source-id>.`; confirm with
`SELECT * FROM agent_tasks WHERE task_type = 'lead_finder' ORDER BY created_at DESC LIMIT 1;`.

- [ ] **Step 5: Commit**

```bash
git add worker/scripts/enqueue-csv-import.ts worker/package.json
git commit -m "feat(worker): add enqueue-csv-import CLI script"
```

---

### Task 17: End-to-end smoke test

**Files:**
- Test: `worker/src/tasks/leadIntelligenceIngestion.e2e.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–16. No new production code — this is the closing verification
  task, matching the repo's existing `app.test.ts` "full stack, one path, top to bottom" convention.

- [ ] **Step 1: Write the smoke test**

```typescript
// worker/src/tasks/leadIntelligenceIngestion.e2e.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { createSourceRegistry } from "../sources/registry.js";
import { csvAdapter } from "../sources/csvAdapter.js";
import { runLeadFinderTask } from "./runLeadFinderTask.js";

let pool: Pool;
const ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("lead intelligence ingestion — end to end", () => {
  it("goes from a seeded lead_source and a CSV, through raw_leads, to a company/contact/lead and a queued research task", async () => {
    const source = await pool.query<{ id: string }>(
      `INSERT INTO lead_sources (organization_id, name, code, source_type) VALUES ($1, 'CSV Import', 'csv-e2e', 'csv') RETURNING id`,
      [ORG_ID]
    );
    const csvText =
      "company_name,domain,contact_full_name,contact_email\n" +
      "Acme Inc,acme.com,Jane Doe,jane@acme.com\n" +
      "Beta LLC,beta.com,,\n";
    await pool.query(`INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'lead_finder', 'pending', $2)`, [
      ORG_ID,
      JSON.stringify({ sourceId: source.rows[0].id, query: { csvText } }),
    ]);

    const registry = createSourceRegistry([csvAdapter]);
    const summary = await runLeadFinderTask(pool, registry, 10);
    expect(summary).toEqual({ claimed: 1, succeeded: 1, failed: 0 });

    const rawLeads = await pool.query("SELECT pipeline_status FROM raw_leads WHERE source_id = $1 ORDER BY discovered_at", [
      source.rows[0].id,
    ]);
    expect(rawLeads.rows.map((r) => r.pipeline_status)).toEqual(["merged", "merged"]);

    const companies = await pool.query("SELECT name, domain FROM companies WHERE organization_id = $1 ORDER BY name", [ORG_ID]);
    expect(companies.rows).toEqual([
      { name: "Acme Inc", domain: "acme.com" },
      { name: "Beta LLC", domain: "beta.com" },
    ]);

    const contacts = await pool.query("SELECT full_name, email FROM contacts WHERE organization_id = $1", [ORG_ID]);
    expect(contacts.rows).toEqual([{ full_name: "Jane Doe", email: "jane@acme.com" }]);

    const leads = await pool.query("SELECT status FROM leads WHERE organization_id = $1", [ORG_ID]);
    expect(leads.rows).toHaveLength(2);
    expect(leads.rows.every((r) => r.status === "new")).toBe(true);

    const researchTasks = await pool.query("SELECT payload FROM agent_tasks WHERE task_type = 'research'");
    expect(researchTasks.rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it**

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test -- leadIntelligenceIngestion.e2e`
Expected: PASS (1 test).

- [ ] **Step 3: Run the entire worker suite and the entire server suite, to confirm nothing anywhere regressed**

Run (from `worker/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_worker_test" npm test` → PASS, all files.
Run (from `worker/`): `npm run typecheck` → PASS, zero errors.
Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test` → PASS, all files (126 tests / 35 files, per Task 2).
Run (from `server/`): `npx tsc --noEmit` → PASS, zero new errors (the one pre-existing unrelated `b2b/domain` error from prior sessions, if still present, is out of scope for this plan).

- [ ] **Step 4: Commit**

```bash
git add worker/src/tasks/leadIntelligenceIngestion.e2e.test.ts
git commit -m "test(worker): add end-to-end smoke test for the lead intelligence ingestion pipeline"
```
