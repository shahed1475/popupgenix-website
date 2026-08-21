import type { Pool } from "pg";

export interface FailableTask {
  id: string;
  attempts: number;
  max_attempts: number;
}

export interface FailTaskResult {
  taskId: string;
  status: "failed";
  error: string;
}

export async function failTask(
  pool: Pool,
  task: FailableTask,
  message: string
): Promise<FailTaskResult> {
  const attempts = task.attempts + 1;
  const nextStatus = attempts < task.max_attempts ? "pending" : "failed";
  const backoffSeconds = Math.min(2 ** attempts * 30, 3600);
  await pool.query(
    `UPDATE agent_tasks
     SET status = $1,
         attempts = $2,
         scheduled_for = CASE WHEN $1 = 'pending' THEN now() + ($4 || ' seconds')::interval ELSE scheduled_for END
     WHERE id = $3`,
    [nextStatus, attempts, task.id, backoffSeconds]
  );
  return { taskId: task.id, status: "failed", error: message };
}
