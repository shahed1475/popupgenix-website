import type { Pool } from 'pg';
import { createTestPool } from './setupTestDb.js';

let globalTestPool: Pool | null = null;

export async function getGlobalTestPool(): Promise<Pool> {
  if (!globalTestPool) {
    globalTestPool = await createTestPool();
  }
  return globalTestPool;
}

export async function closeGlobalTestPool(): Promise<void> {
  if (globalTestPool) {
    await globalTestPool.end();
    globalTestPool = null;
  }
}
