import type { Pool } from "pg";

/**
 * Returns tasks stranded by a crashed worker to 'pending'. Both 'claimed' (died between claim and
 * processing) and 'in_progress' (died mid-processing) are reaped — an in_progress row has no other
 * recovery path, since only the worker that set it would ever move it on.
 */
export async function reapStaleClaims(pool: Pool, staleAfterMinutes: number): Promise<number> {
  const result = await pool.query(
    `UPDATE agent_tasks
     SET status = 'pending', claimed_by = NULL, claimed_at = NULL
     WHERE status IN ('claimed', 'in_progress') AND claimed_at < now() - ($1 || ' minutes')::interval`,
    [staleAfterMinutes]
  );
  return result.rowCount ?? 0;
}
