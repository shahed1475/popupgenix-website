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
