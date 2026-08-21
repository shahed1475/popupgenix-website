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

  it("returns a stuck in_progress task to pending after the staleness window", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (task_type, status, payload, claimed_by, claimed_at)
       VALUES ('lead_finder', 'in_progress', '{}', 'worker-dead', now() - interval '20 minutes')
       RETURNING id`
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(1);
    const task = await pool.query("SELECT status, claimed_by, claimed_at FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("pending");
    expect(task.rows[0].claimed_by).toBeNull();
    expect(task.rows[0].claimed_at).toBeNull();
  });

  it("leaves a recently started in_progress task untouched", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (task_type, status, payload, claimed_by, claimed_at)
       VALUES ('lead_finder', 'in_progress', '{}', 'worker-live', now())
       RETURNING id`
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(0);
    const task = await pool.query("SELECT status FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("in_progress");
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
