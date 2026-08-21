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
