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
