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
