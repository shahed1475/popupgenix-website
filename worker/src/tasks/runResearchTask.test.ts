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

async function seedMalformedResearchTask() {
  await pool.query(
    "INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', $1)",
    [JSON.stringify({ lead_id: "not-a-uuid" })]
  );
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

  it("does not abort the batch when one task has a malformed lead_id", async () => {
    await seedPendingResearchTask();
    await seedMalformedResearchTask();

    const summary = await runResearchTask(pool, mockAi, "mock", 2);

    expect(summary).toEqual({ claimed: 2, succeeded: 1, failed: 1 });
  });
});
