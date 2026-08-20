import type { Pool } from "pg";
import { claimTasks } from "./claimTasks.js";

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
  const rows = await claimTasks(pool, workerId, "research", batchSize);
  return rows.map(({ id, payload, attempts, max_attempts }) => ({ id, payload, attempts, max_attempts }));
}
