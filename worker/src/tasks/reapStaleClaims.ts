import type { Pool } from "pg";

export async function reapStaleClaims(pool: Pool, staleAfterMinutes: number): Promise<number> {
  const result = await pool.query(
    `UPDATE agent_tasks
     SET status = 'pending', claimed_by = NULL, claimed_at = NULL
     WHERE status = 'claimed' AND claimed_at < now() - ($1 || ' minutes')::interval`,
    [staleAfterMinutes]
  );
  return result.rowCount ?? 0;
}
