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
