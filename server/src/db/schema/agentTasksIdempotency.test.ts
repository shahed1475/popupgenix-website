import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

describe('agent_tasks.idempotency_key', () => {
  it('allows multiple tasks with a null idempotency_key', async () => {
    const orgId = await insertOrg(pool, 'org-a');
    await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'lead_finder')`, [orgId]);
    const second = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'lead_finder') RETURNING id`,
      [orgId]
    );
    expect(second.rows[0].id).toBeDefined();
  });

  it('enforces uniqueness of idempotency_key per organization', async () => {
    const orgId = await insertOrg(pool, 'org-b');
    await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'key-1')`,
      [orgId]
    );
    await expect(
      pool.query(`INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'key-1')`, [orgId])
    ).rejects.toThrow();
  });

  it('allows the same idempotency_key across different organizations', async () => {
    const orgA = await insertOrg(pool, 'org-c');
    const orgB = await insertOrg(pool, 'org-d');
    await pool.query(`INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'shared-key')`, [
      orgA,
    ]);
    const second = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, idempotency_key) VALUES ($1, 'lead_finder', 'shared-key') RETURNING id`,
      [orgB]
    );
    expect(second.rows[0].id).toBeDefined();
  });
});
