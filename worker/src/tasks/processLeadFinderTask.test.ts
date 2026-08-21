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
