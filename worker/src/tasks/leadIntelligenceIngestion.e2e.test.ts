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
