# B2B Growth Engine — Research Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "research" pipeline step of the B2B Growth Engine — a worker script
that claims pending `agent_tasks` rows of type `research`, gathers company-level
intelligence via AI inference (technology, revenue estimate, employees, growth, hiring,
funding, pain points, buying signals, AI summary), and persists the result.

**Architecture:** A new `worker/src/tasks/` module: a `pg`-based atomic task-claiming
query (`FOR UPDATE SKIP LOCKED`), a per-task processor that calls the existing
`AIProvider.analyzeCompany` (reshaped to match the pipeline stages) and writes to
`research`/`agent_runs`/`agent_tasks`/`leads`, and a one-shot entrypoint script run via
cron. All tests use a real local Postgres, never a mock DB.

**Reference spec:** `docs/superpowers/specs/2026-08-16-b2b-research-worker-design.md`

## Global Constraints

- ESM + NodeNext module resolution: every relative import in `worker/src` must include the
  `.js` extension (e.g. `import { createPool } from '../db/pool.js'`), matching the
  existing `worker/` files.
- Use `pg` parameterized queries (`$1, $2, ...`) everywhere. Never string-interpolate
  request data into SQL.
- Tests use a **real** local Postgres, never a mock/in-memory engine — same convention as
  `server/`. Start one locally before running `npm test` in `worker/`:
  ```bash
  docker run --rm -d --name b2b-worker-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=b2b_worker_test -p 55433:5432 postgres:15-alpine
  ```
  Then export `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test`
  in the shell running `npm test`. (Different host port, `55433`, from the `drickly`
  server's `55432` test DB, so both can run side by side.)
- `worker/` stays fully isolated from `src/` (the main Vite app) — this plan never adds an
  import from `worker/` into `src/b2b/domain` or vice versa. The worker's test schema
  (`worker/src/test/schema.sql`) is a local-only fixture, not a Supabase migration; the
  real Phase 1 migrations under `supabase/migrations/` are never modified.
  `isValidLeadStatusTransition`-style logic is enforced directly via a SQL `WHERE`
  guard (`status = 'new'`), not by importing the frontend's guard function.
- `MockAIProvider` stays the default (`AI_PROVIDER` unset) — the whole test suite must run
  offline, no `ANTHROPIC_API_KEY` required.
- The AI output JSONB keys written to `research.findings` must exactly match the reshaped
  `analyzeCompanyOutputSchema` field names: `technology`, `revenueEstimate`, `employees`,
  `growth`, `hiring`, `funding`, `painPoints`, `buyingSignals`.

---

### Task 1: Reshape the `analyzeCompany` AI schema to match the pipeline stages

**Files:**
- Modify: `worker/src/ai/schemas/analyzeCompany.ts`
- Modify: `worker/src/ai/schemas/analyzeCompany.test.ts`
- Modify: `worker/src/ai/MockAIProvider.ts`
- Modify: `worker/src/ai/MockAIProvider.test.ts`

**Interfaces:**
- Produces: `analyzeCompanyOutputSchema` with fields `technology: string[]`,
  `revenueEstimate: string | null | undefined`, `employees: string | null | undefined`,
  `growth: string | null | undefined`, `hiring: string[]`,
  `funding: string | null | undefined`, `painPoints: string[]`,
  `buyingSignals: string[]`, `aiSummary: string`, `confidence: number` (0..1). Consumed by
  Task 4's `processResearchTask`.

- [ ] **Step 1: Update the failing test for the reshaped output schema**

Replace the `analyzeCompanyOutputSchema` describe block in
`worker/src/ai/schemas/analyzeCompany.test.ts` with:

```ts
describe("analyzeCompanyOutputSchema", () => {
  const valid = {
    technology: ["React"],
    revenueEstimate: "$1M-$5M",
    employees: "11-50",
    growth: "steady",
    hiring: ["Software Engineer"],
    funding: "Series A",
    painPoints: ["Manual work"],
    buyingSignals: ["Recently raised funding"],
    aiSummary: "Acme is a SaaS company.",
    confidence: 0.7,
  };

  it("accepts a valid output", () => {
    expect(() => analyzeCompanyOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects confidence outside 0..1", () => {
    expect(() => analyzeCompanyOutputSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it("rejects a missing aiSummary", () => {
    const { aiSummary: _aiSummary, ...rest } = valid;
    expect(() => analyzeCompanyOutputSchema.parse(rest)).toThrow();
  });

  it("accepts null for optional string fields", () => {
    expect(() =>
      analyzeCompanyOutputSchema.parse({
        ...valid,
        revenueEstimate: null,
        employees: null,
        growth: null,
        funding: null,
      })
    ).not.toThrow();
  });
});
```

(Leave the `analyzeCompanyInputSchema` describe block above it unchanged.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd worker && npx vitest run src/ai/schemas/analyzeCompany.test.ts`
Expected: FAIL — the current schema still has `summary`/`companySizeEstimate`/`techStack`/etc., so `valid` doesn't parse the way the new test expects (missing `aiSummary` field error).

- [ ] **Step 3: Reshape the output schema**

Replace `worker/src/ai/schemas/analyzeCompany.ts` with:

```ts
import { z } from "zod";
import { confidenceSchema, nonEmptyString } from "./common.js";

export const analyzeCompanyInputSchema = z.object({
  companyName: nonEmptyString,
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  rawContext: z.string().nullable().optional(),
});
export type AnalyzeCompanyInput = z.infer<typeof analyzeCompanyInputSchema>;

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd worker && npx vitest run src/ai/schemas/analyzeCompany.test.ts`
Expected: PASS (6 tests: 2 input + 4 output)

- [ ] **Step 5: Update MockAIProvider's canned response and its test**

In `worker/src/ai/MockAIProvider.ts`, replace the `analyzeCompany` method body:

```ts
  async analyzeCompany(rawInput: AnalyzeCompanyInput): Promise<AnalyzeCompanyOutput> {
    const input = parseOrThrow(analyzeCompanyInputSchema, rawInput);
    return parseOrThrow(analyzeCompanyOutputSchema, {
      technology: ["Unknown"],
      revenueEstimate: null,
      employees: "11-50",
      growth: null,
      hiring: [],
      funding: null,
      painPoints: ["Manual processes", "Scaling challenges"],
      buyingSignals: ["Matches target industry"],
      aiSummary: `${input.companyName} is a company in the ${input.industry ?? "unknown"} industry (mock analysis).`,
      confidence: 0.5,
    }, "Output");
  }
```

In `worker/src/ai/MockAIProvider.test.ts`, the `analyzeCompany` test case (lines 8-19)
currently reads:

```ts
  it("analyzeCompany returns schema-valid output referencing the input", async () => {
    const result = await provider.analyzeCompany({
      companyName: "Acme",
      domain: null,
      industry: "Software",
      description: null,
      rawContext: null,
    });
    expect(result.summary).toContain("Acme");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
```

Change only the assertion line `expect(result.summary).toContain("Acme");` to
`expect(result.aiSummary).toContain("Acme");` — everything else in this test (the input,
the confidence assertions) stays exactly as-is. No other test in this file references
`analyzeCompany`'s output shape.

- [ ] **Step 6: Run the full worker test suite to verify everything passes**

Run: `cd worker && npm test`
Expected: PASS, all files green (no other file references the old `analyzeCompany` field
names — confirm with a search if anything fails).

- [ ] **Step 7: Commit**

```bash
git add worker/src/ai/schemas/analyzeCompany.ts worker/src/ai/schemas/analyzeCompany.test.ts worker/src/ai/MockAIProvider.ts worker/src/ai/MockAIProvider.test.ts
git commit -m "feat(worker): reshape analyzeCompany output to match research pipeline stages"
```

---

### Task 2: Task-runner environment config and DB pool

**Files:**
- Create: `worker/src/config/taskEnv.ts`
- Create: `worker/src/config/taskEnv.test.ts`
- Create: `worker/src/db/pool.ts`
- Modify: `worker/package.json` (add `pg`, `@types/pg` dependencies)

**Interfaces:**
- Produces: `loadTaskEnv(source?): TaskEnv` where
  `TaskEnv = { databaseUrl: string; researchBatchSize: number }`. Throws a plain `Error`
  with a clear message if `WORKER_DATABASE_URL` is missing or
  `WORKER_RESEARCH_BATCH_SIZE` is set but not a positive integer.
- Produces: `createPool(connectionString: string): Pool` (re-exported `pg.Pool`).
  Consumed by Task 3's test DB setup and Task 5's entrypoint script.

- [ ] **Step 1: Add `pg` as a dependency**

In `worker/package.json`, add to `"dependencies"`:
```json
    "pg": "^8.13.1"
```
Add to `"devDependencies"`:
```json
    "@types/pg": "^8.11.10"
```

Run: `cd worker && npm install`
Expected: installs cleanly, updates `worker/package-lock.json`.

- [ ] **Step 2: Write the failing test for `loadTaskEnv`**

Create `worker/src/config/taskEnv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadTaskEnv } from "./taskEnv.js";

const DB_URL = "postgresql://user:pass@localhost:5432/b2b";

describe("loadTaskEnv", () => {
  it("returns the database URL with a default batch size of 5", () => {
    const env = loadTaskEnv({ WORKER_DATABASE_URL: DB_URL });
    expect(env).toEqual({ databaseUrl: DB_URL, researchBatchSize: 5 });
  });

  it("throws when WORKER_DATABASE_URL is missing", () => {
    expect(() => loadTaskEnv({})).toThrow(/WORKER_DATABASE_URL/);
  });

  it("accepts a custom positive integer batch size", () => {
    const env = loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "10" });
    expect(env.researchBatchSize).toBe(10);
  });

  it("throws for a non-integer batch size", () => {
    expect(() =>
      loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "abc" })
    ).toThrow(/WORKER_RESEARCH_BATCH_SIZE/);
  });

  it("throws for a zero or negative batch size", () => {
    expect(() =>
      loadTaskEnv({ WORKER_DATABASE_URL: DB_URL, WORKER_RESEARCH_BATCH_SIZE: "0" })
    ).toThrow(/WORKER_RESEARCH_BATCH_SIZE/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd worker && npx vitest run src/config/taskEnv.test.ts`
Expected: FAIL — `taskEnv.ts` doesn't exist yet.

- [ ] **Step 4: Implement `taskEnv.ts`**

Create `worker/src/config/taskEnv.ts`:

```ts
export interface TaskEnv {
  databaseUrl: string;
  researchBatchSize: number;
}

const DEFAULT_RESEARCH_BATCH_SIZE = 5;

export function loadTaskEnv(
  source: Record<string, string | undefined> = process.env
): TaskEnv {
  const databaseUrl = source.WORKER_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("WORKER_DATABASE_URL is required to run task processing.");
  }

  const batchSizeRaw = source.WORKER_RESEARCH_BATCH_SIZE?.trim();
  if (!batchSizeRaw) {
    return { databaseUrl, researchBatchSize: DEFAULT_RESEARCH_BATCH_SIZE };
  }

  const parsed = Number(batchSizeRaw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Invalid WORKER_RESEARCH_BATCH_SIZE "${batchSizeRaw}" — must be a positive integer.`
    );
  }

  return { databaseUrl, researchBatchSize: parsed };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd worker && npx vitest run src/config/taskEnv.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Implement the DB pool helper**

Create `worker/src/db/pool.ts`:

```ts
import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
```

No dedicated test — it's a one-line wrapper, exercised indirectly by every integration
test starting in Task 3.

- [ ] **Step 7: Run the full worker test suite**

Run: `cd worker && npm test`
Expected: PASS, all files green.

- [ ] **Step 8: Commit**

```bash
git add worker/package.json worker/package-lock.json worker/src/config/taskEnv.ts worker/src/config/taskEnv.test.ts worker/src/db/pool.ts
git commit -m "feat(worker): add task-runner env config and Postgres pool helper"
```

---

### Task 3: Test DB scaffold and atomic task claiming

**Files:**
- Create: `worker/src/test/schema.sql`
- Create: `worker/src/test/setupTestDb.ts`
- Create: `worker/src/tasks/claimResearchTasks.ts`
- Create: `worker/src/tasks/claimResearchTasks.test.ts`

**Interfaces:**
- Produces (test helper, consumed by every integration test from here on):
  `createTestPool(): Promise<Pool>`, `truncateAll(pool: Pool): Promise<void>`.
- Produces: `interface ClaimedResearchTask { id: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }`,
  `claimResearchTasks(pool: Pool, workerId: string, batchSize: number): Promise<ClaimedResearchTask[]>`.
  Consumed by Task 5's entrypoint script.

- [ ] **Step 1: Write the local test schema**

Create `worker/src/test/schema.sql` — a minimal, RLS-free mirror of the five B2B tables
this worker touches (from `supabase/migrations/20260813120000_*.sql`,
`20260813120200_*.sql`, and `20260813120500_*.sql`), for use only against a local scratch
test database:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('company', 'contact')),
  subject_id UUID NOT NULL,
  summary TEXT,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  created_by TEXT NOT NULL DEFAULT 'manual' CHECK (created_by IN ('agent', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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

- [ ] **Step 2: Implement the test DB helper**

Create `worker/src/test/setupTestDb.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createTestPool(): Promise<Pool> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL must be set to run integration tests — see Global Constraints."
    );
  }
  const pool = new Pool({ connectionString });
  const schemaSql = await readFile(path.resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(schemaSql);
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE agent_runs, agent_tasks, research, leads, companies RESTART IDENTITY CASCADE"
  );
}
```

- [ ] **Step 3: Write the failing tests for `claimResearchTasks`**

Create `worker/src/tasks/claimResearchTasks.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimResearchTasks } from "./claimResearchTasks.js";

let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedCompanyAndLead() {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ('Acme') RETURNING id"
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (company_id) VALUES ($1) RETURNING id",
    [company.rows[0].id]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}

async function seedResearchTask(leadId: string, overrides: Partial<{ status: string; taskType: string; priority: number }> = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO agent_tasks (task_type, status, payload, priority)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      overrides.taskType ?? "research",
      overrides.status ?? "pending",
      JSON.stringify({ lead_id: leadId }),
      overrides.priority ?? 0,
    ]
  );
  return rows[0].id;
}

describe("claimResearchTasks", () => {
  it("claims a pending research task and marks it claimed", async () => {
    const { leadId } = await seedCompanyAndLead();
    const taskId = await seedResearchTask(leadId);

    const claimed = await claimResearchTasks(pool, "worker-1", 5);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(taskId);
    expect(claimed[0].payload).toEqual({ lead_id: leadId });

    const { rows } = await pool.query("SELECT status, claimed_by FROM agent_tasks WHERE id = $1", [taskId]);
    expect(rows[0].status).toBe("claimed");
    expect(rows[0].claimed_by).toBe("worker-1");
  });

  it("ignores tasks of a different task_type", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { taskType: "outreach" });

    const claimed = await claimResearchTasks(pool, "worker-1", 5);
    expect(claimed).toHaveLength(0);
  });

  it("ignores tasks that are not pending", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { status: "succeeded" });

    const claimed = await claimResearchTasks(pool, "worker-1", 5);
    expect(claimed).toHaveLength(0);
  });

  it("respects the batch size limit and priority ordering", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { priority: 0 });
    const highPriorityId = await seedResearchTask(leadId, { priority: 10 });
    await seedResearchTask(leadId, { priority: 5 });

    const claimed = await claimResearchTasks(pool, "worker-1", 1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(highPriorityId);
  });

  it("never lets two concurrent claims grab the same task", async () => {
    const { leadId } = await seedCompanyAndLead();
    const ids = [await seedResearchTask(leadId), await seedResearchTask(leadId), await seedResearchTask(leadId)];

    const [batchA, batchB] = await Promise.all([
      claimResearchTasks(pool, "worker-a", 2),
      claimResearchTasks(pool, "worker-b", 2),
    ]);

    const claimedIds = [...batchA, ...batchB].map((t) => t.id).sort();
    expect(claimedIds).toEqual([...ids].sort());
    expect(new Set(claimedIds).size).toBe(3);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:
```bash
cd worker
docker run --rm -d --name b2b-worker-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=b2b_worker_test -p 55433:5432 postgres:15-alpine
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/claimResearchTasks.test.ts
```
Expected: FAIL — `claimResearchTasks.ts` doesn't exist yet. (Wait a couple seconds after
`docker run` for Postgres to accept connections if the first attempt errors with
connection refused.)

- [ ] **Step 5: Implement `claimResearchTasks`**

Create `worker/src/tasks/claimResearchTasks.ts`:

```ts
import type { Pool } from "pg";

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
  const { rows } = await pool.query<ClaimedResearchTask>(
    `UPDATE agent_tasks
     SET status = 'claimed', claimed_by = $1, claimed_at = now()
     WHERE id IN (
       SELECT id FROM agent_tasks
       WHERE task_type = 'research' AND status = 'pending' AND scheduled_for <= now()
       ORDER BY priority DESC, scheduled_for ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, payload, attempts, max_attempts`,
    [workerId, batchSize]
  );
  return rows;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/claimResearchTasks.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add worker/src/test/schema.sql worker/src/test/setupTestDb.ts worker/src/tasks/claimResearchTasks.ts worker/src/tasks/claimResearchTasks.test.ts
git commit -m "feat(worker): add test DB scaffold and atomic research-task claiming"
```

---

### Task 4: Research task processor

**Files:**
- Create: `worker/src/tasks/processResearchTask.ts`
- Create: `worker/src/tasks/processResearchTask.test.ts`

**Interfaces:**
- Consumes: `ClaimedResearchTask` (Task 3), `AIProvider`/`AnalyzeCompanyOutput` (existing,
  reshaped in Task 1), `createTestPool`/`truncateAll` (Task 3).
- Produces: `interface ProcessResearchTaskResult { taskId: string; status: 'succeeded' | 'failed'; error?: string }`,
  `processResearchTask(pool: Pool, ai: AIProvider, providerName: 'mock' | 'claude', task: ClaimedResearchTask): Promise<ProcessResearchTaskResult>`.
  Consumed by Task 5's entrypoint script.

- [ ] **Step 1: Write the failing tests**

Create `worker/src/tasks/processResearchTask.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import { MockAIProvider } from "../ai/MockAIProvider.js";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimResearchTasks } from "./claimResearchTasks.js";
import { processResearchTask } from "./processResearchTask.js";

let pool: Pool;
const mockAi = new MockAIProvider();

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedCompanyAndLead(leadStatus = "new") {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (name, domain, industry, description) VALUES ('Acme', 'acme.com', 'Software', 'A SaaS company') RETURNING id"
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (company_id, status) VALUES ($1, $2) RETURNING id",
    [company.rows[0].id, leadStatus]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}

async function seedAndClaimTask(leadId: string) {
  await pool.query(
    "INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', $1)",
    [JSON.stringify({ lead_id: leadId })]
  );
  const [task] = await claimResearchTasks(pool, "worker-1", 1);
  return task;
}

describe("processResearchTask — success path", () => {
  it("writes a research row, an agent_runs row, marks the task succeeded, and moves the lead to researching", async () => {
    const { companyId, leadId } = await seedCompanyAndLead();
    const task = await seedAndClaimTask(leadId);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result).toEqual({ taskId: task.id, status: "succeeded" });

    const research = await pool.query("SELECT * FROM research WHERE subject_id = $1", [companyId]);
    expect(research.rows).toHaveLength(1);
    expect(research.rows[0].subject_type).toBe("company");
    expect(research.rows[0].created_by).toBe("agent");
    expect(research.rows[0].source).toBe("mock");
    expect(research.rows[0].findings).toMatchObject({
      technology: expect.any(Array),
      painPoints: expect.any(Array),
      buyingSignals: expect.any(Array),
    });

    const runs = await pool.query("SELECT status, provider FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows).toEqual([{ status: "succeeded", provider: "mock" }]);

    const taskRow = await pool.query("SELECT status FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("succeeded");

    const leadRow = await pool.query("SELECT status FROM leads WHERE id = $1", [leadId]);
    expect(leadRow.rows[0].status).toBe("researching");
  });

  it("does not touch a lead that is already past the new status", async () => {
    const { leadId } = await seedCompanyAndLead("qualified");
    const task = await seedAndClaimTask(leadId);

    await processResearchTask(pool, mockAi, "mock", task);

    const leadRow = await pool.query("SELECT status FROM leads WHERE id = $1", [leadId]);
    expect(leadRow.rows[0].status).toBe("qualified");
  });
});

describe("processResearchTask — failure paths", () => {
  it("fails the task and retries when the payload has no lead_id", async () => {
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', '{}')");
    const [task] = await claimResearchTasks(pool, "worker-1", 1);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/lead_id/);

    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });

  it("marks the task permanently failed once max_attempts is reached", async () => {
    await pool.query(
      "INSERT INTO agent_tasks (task_type, status, payload, attempts, max_attempts) VALUES ('research', 'pending', '{}', 2, 3)"
    );
    const [task] = await claimResearchTasks(pool, "worker-1", 1);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result.status).toBe("failed");
    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("failed");
    expect(taskRow.rows[0].attempts).toBe(3);
  });

  it("logs a failed agent_runs row and retries when the AI call throws", async () => {
    const { leadId } = await seedCompanyAndLead();
    const task = await seedAndClaimTask(leadId);

    const throwingAi: AIProvider = {
      analyzeCompany: async () => {
        throw new Error("upstream boom");
      },
      researchContact: mockAi.researchContact.bind(mockAi),
      qualifyLead: mockAi.qualifyLead.bind(mockAi),
      generateOutreach: mockAi.generateOutreach.bind(mockAi),
      classifyReply: mockAi.classifyReply.bind(mockAi),
      generateReply: mockAi.generateReply.bind(mockAi),
      analyzeStrategy: mockAi.analyzeStrategy.bind(mockAi),
    };

    const result = await processResearchTask(pool, throwingAi, "mock", task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/upstream boom/);

    const runs = await pool.query("SELECT status, error FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows).toEqual([{ status: "failed", error: expect.stringContaining("upstream boom") }]);

    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/processResearchTask.test.ts
```
Expected: FAIL — `processResearchTask.ts` doesn't exist yet.

- [ ] **Step 3: Implement `processResearchTask`**

Create `worker/src/tasks/processResearchTask.ts`:

```ts
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import type { ClaimedResearchTask } from "./claimResearchTasks.js";

export interface ProcessResearchTaskResult {
  taskId: string;
  status: "succeeded" | "failed";
  error?: string;
}

interface LeadCompanyRow {
  lead_id: string;
  company_id: string;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_description: string | null;
}

export async function processResearchTask(
  pool: Pool,
  ai: AIProvider,
  providerName: "mock" | "claude",
  task: ClaimedResearchTask
): Promise<ProcessResearchTaskResult> {
  const leadId = task.payload.lead_id;
  if (typeof leadId !== "string") {
    return failTask(pool, task, "Task payload is missing lead_id");
  }

  const { rows } = await pool.query<LeadCompanyRow>(
    `SELECT l.id AS lead_id,
            c.id AS company_id, c.name AS company_name, c.domain AS company_domain,
            c.industry AS company_industry, c.description AS company_description
     FROM leads l JOIN companies c ON c.id = l.company_id
     WHERE l.id = $1`,
    [leadId]
  );
  const row = rows[0];
  if (!row) {
    return failTask(pool, task, `Lead ${leadId} not found`);
  }

  await pool.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);
  await pool.query("UPDATE leads SET status = 'researching' WHERE id = $1 AND status = 'new'", [row.lead_id]);

  const startedAt = new Date();
  try {
    const output = await ai.analyzeCompany({
      companyName: row.company_name,
      domain: row.company_domain,
      industry: row.company_industry,
      description: row.company_description,
      rawContext: null,
    });
    const finishedAt = new Date();

    await pool.query(
      `INSERT INTO research (subject_type, subject_id, summary, findings, confidence, source, created_by)
       VALUES ('company', $1, $2, $3, $4, $5, 'agent')`,
      [
        row.company_id,
        output.aiSummary,
        JSON.stringify({
          technology: output.technology,
          revenueEstimate: output.revenueEstimate,
          employees: output.employees,
          growth: output.growth,
          hiring: output.hiring,
          funding: output.funding,
          painPoints: output.painPoints,
          buyingSignals: output.buyingSignals,
        }),
        output.confidence,
        providerName,
      ]
    );

    await pool.query(
      `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, output, duration_ms)
       VALUES ($1, 'succeeded', $2, $3, $4, $5, $6)`,
      [
        task.id,
        providerName,
        startedAt,
        finishedAt,
        JSON.stringify(output),
        finishedAt.getTime() - startedAt.getTime(),
      ]
    );

    await pool.query("UPDATE agent_tasks SET status = 'succeeded' WHERE id = $1", [task.id]);

    return { taskId: task.id, status: "succeeded" };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);

    await pool.query(
      `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, error, duration_ms)
       VALUES ($1, 'failed', $2, $3, $4, $5, $6)`,
      [task.id, providerName, startedAt, finishedAt, message, finishedAt.getTime() - startedAt.getTime()]
    );

    return failTask(pool, task, message);
  }
}

async function failTask(
  pool: Pool,
  task: ClaimedResearchTask,
  message: string
): Promise<ProcessResearchTaskResult> {
  const attempts = task.attempts + 1;
  const nextStatus = attempts < task.max_attempts ? "pending" : "failed";
  await pool.query("UPDATE agent_tasks SET status = $1, attempts = $2 WHERE id = $3", [
    nextStatus,
    attempts,
    task.id,
  ]);
  return { taskId: task.id, status: "failed", error: message };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/processResearchTask.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full worker test suite**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npm test
```
Expected: PASS, all files green.

- [ ] **Step 6: Commit**

```bash
git add worker/src/tasks/processResearchTask.ts worker/src/tasks/processResearchTask.test.ts
git commit -m "feat(worker): add research task processor (AI call + persistence + retry)"
```

---

### Task 5: Entrypoint script, build wiring, and docs

**Files:**
- Create: `worker/src/tasks/runResearchTask.ts`
- Create: `worker/src/tasks/runResearchTask.test.ts`
- Create: `worker/tsconfig.build.json`
- Modify: `worker/package.json` (add `tsx` devDependency, `build`/`task:research`/`task:research:dev` scripts)
- Modify: `worker/.env.example`
- Modify: `worker/README.md`

**Interfaces:**
- Consumes: `claimResearchTasks` (Task 3), `processResearchTask` (Task 4), `createAIProvider`/`loadWorkerEnv` (existing), `loadTaskEnv`/`createPool` (Task 2).
- Produces: `runResearchTask(pool: Pool, ai: AIProvider, providerName: 'mock' | 'claude', batchSize: number): Promise<{ claimed: number; succeeded: number; failed: number }>`, and a `main()` CLI entrypoint that only runs when the file is executed directly.

- [ ] **Step 1: Write the failing test**

Create `worker/src/tasks/runResearchTask.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { MockAIProvider } from "../ai/MockAIProvider.js";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { runResearchTask } from "./runResearchTask.js";

let pool: Pool;
const mockAi = new MockAIProvider();

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedPendingResearchTask() {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ('Acme') RETURNING id"
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (company_id) VALUES ($1) RETURNING id",
    [company.rows[0].id]
  );
  await pool.query("INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', $1)", [
    JSON.stringify({ lead_id: lead.rows[0].id }),
  ]);
}

describe("runResearchTask", () => {
  it("claims and processes a batch of pending research tasks end to end", async () => {
    await seedPendingResearchTask();
    await seedPendingResearchTask();
    await seedPendingResearchTask();

    const summary = await runResearchTask(pool, mockAi, "mock", 2);

    expect(summary).toEqual({ claimed: 2, succeeded: 2, failed: 0 });

    const remaining = await pool.query("SELECT status FROM agent_tasks WHERE status = 'pending'");
    expect(remaining.rows).toHaveLength(1);

    const succeeded = await pool.query("SELECT status FROM agent_tasks WHERE status = 'succeeded'");
    expect(succeeded.rows).toHaveLength(2);
  });

  it("returns zeros when there is nothing pending", async () => {
    const summary = await runResearchTask(pool, mockAi, "mock", 5);
    expect(summary).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/runResearchTask.test.ts
```
Expected: FAIL — `runResearchTask.ts` doesn't exist yet.

- [ ] **Step 3: Implement the entrypoint script**

Create `worker/src/tasks/runResearchTask.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import { createPool } from "../db/pool.js";
import { loadTaskEnv } from "../config/taskEnv.js";
import { loadWorkerEnv } from "../config/env.js";
import { createAIProvider } from "../ai/createAIProvider.js";
import { claimResearchTasks } from "./claimResearchTasks.js";
import { processResearchTask } from "./processResearchTask.js";

export interface RunResearchTaskSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runResearchTask(
  pool: Pool,
  ai: AIProvider,
  providerName: "mock" | "claude",
  batchSize: number
): Promise<RunResearchTaskSummary> {
  const workerId = `research-${process.pid}-${randomUUID()}`;
  const tasks = await claimResearchTasks(pool, workerId, batchSize);

  let succeeded = 0;
  let failed = 0;
  for (const task of tasks) {
    const result = await processResearchTask(pool, ai, providerName, task);
    if (result.status === "succeeded") succeeded++;
    else failed++;
  }

  return { claimed: tasks.length, succeeded, failed };
}

async function main(): Promise<void> {
  const taskEnv = loadTaskEnv();
  const workerEnv = loadWorkerEnv();
  const ai = createAIProvider(workerEnv);
  const pool = createPool(taskEnv.databaseUrl);
  try {
    const summary = await runResearchTask(pool, ai, workerEnv.provider, taskEnv.researchBatchSize);
    console.log(
      `Research task run complete: claimed=${summary.claimed} succeeded=${summary.succeeded} failed=${summary.failed}`
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npx vitest run src/tasks/runResearchTask.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Wire up the build and run scripts**

Create `worker/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["src/**/*.test.ts"]
}
```

In `worker/package.json`, add to `"scripts"`:
```json
    "build": "tsc -p tsconfig.build.json",
    "task:research": "node dist/tasks/runResearchTask.js",
    "task:research:dev": "tsx src/tasks/runResearchTask.ts"
```
Add to `"devDependencies"`:
```json
    "tsx": "^4.19.2"
```

Run: `cd worker && npm install`
Expected: installs cleanly.

Run: `cd worker && npm run build`
Expected: succeeds, produces `worker/dist/tasks/runResearchTask.js` and the rest of the
compiled tree.

- [ ] **Step 6: Update `.env.example` and `README.md`**

In `worker/.env.example`, append:
```

# Required to run `npm run task:research` (the research pipeline). Points at the
# B2B Growth Engine's Postgres instance, using a role that bypasses RLS (RLS policies
# are scoped to auth.uid(), which has no meaning for this automated worker).
WORKER_DATABASE_URL=

# Optional. How many pending research tasks to claim and process per invocation.
# Defaults to 5.
WORKER_RESEARCH_BATCH_SIZE=
```

In `worker/README.md`, add a new section after "## Switching to Claude later":

```markdown

## Running the research task

`npm run task:research` claims up to `WORKER_RESEARCH_BATCH_SIZE` pending `agent_tasks`
rows of type `research`, gathers company intelligence via the configured `AIProvider`, and
writes the result to the `research` table (plus an `agent_runs` log row and the lead's
status transition to `researching`). It's a one-shot script — run it on a cron schedule
(e.g. every 5 minutes), not as a long-running daemon.

Requires `WORKER_DATABASE_URL` (see `.env.example`) in addition to the `AI_PROVIDER`
variables above. `npm run task:research:dev` runs it directly from TypeScript via `tsx`
for local testing; `npm run build && npm run task:research` is the production path.
```

- [ ] **Step 7: Run the full worker test suite one more time**

Run:
```bash
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npm test
```
Expected: PASS, all files green.

Run: `cd worker && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add worker/src/tasks/runResearchTask.ts worker/src/tasks/runResearchTask.test.ts worker/tsconfig.build.json worker/package.json worker/package-lock.json worker/.env.example worker/README.md
git commit -m "feat(worker): add research-task entrypoint script, build wiring, and docs"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full worker suite from a clean state**

```bash
docker stop b2b-worker-test-db
docker run --rm -d --name b2b-worker-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=b2b_worker_test -p 55433:5432 postgres:15-alpine
cd worker
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test npm test
npm run typecheck
npm run build
```
Expected: every test file passes, typecheck is clean, build succeeds.

- [ ] **Step 2: Manual smoke run against the built output**

```bash
cd worker
docker exec b2b-worker-test-db psql -U postgres -d b2b_worker_test -c "SELECT 1;"
WORKER_DATABASE_URL=postgresql://postgres:test@localhost:55433/b2b_worker_test WORKER_RESEARCH_BATCH_SIZE=1 npm run task:research
```
Expected: prints `Research task run complete: claimed=0 succeeded=0 failed=0` (no seeded
tasks in this ad-hoc run — this just proves the compiled script starts, connects, and
exits cleanly against a real Postgres instead of crashing on a config or import error).

- [ ] **Step 3: Stop the local test database container**

```bash
docker stop b2b-worker-test-db
```

- [ ] **Step 4: Report status**

Confirm to the user: all tasks committed, full test suite green, `npm run build` produces
a deployable `worker/dist/`. Note explicitly that this plan does **not** touch production
(no Supabase migration changes, no VPS/cron setup) — wiring `task:research` into an actual
cron schedule against the real Supabase database is a follow-up step requiring the
production `WORKER_DATABASE_URL` and explicit user confirmation before anything is
deployed, per this repo's standing checkpoint convention for remote/production actions.
