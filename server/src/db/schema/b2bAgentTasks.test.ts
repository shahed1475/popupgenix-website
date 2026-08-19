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

describe('b2b agent_tasks, agent_runs', () => {
  it('requires an explicit organization_id on agent_tasks', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-a');
    const task = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING status, priority, attempts`,
      [orgId]
    );
    expect(task.rows[0].status).toBe('pending');
    expect(task.rows[0].priority).toBe(0);
    expect(task.rows[0].attempts).toBe(0);

    await expect(pool.query(`INSERT INTO agent_tasks (task_type) VALUES ('research')`)).rejects.toThrow();
  });

  it('auto-populates agent_runs.organization_id from the parent agent_task', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-b');
    const task = await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING id`, [
      orgId,
    ]);

    const run = await pool.query(
      `INSERT INTO agent_runs (task_id, status) VALUES ($1, 'running') RETURNING organization_id`,
      [task.rows[0].id]
    );
    expect(run.rows[0].organization_id).toBe(orgId);
  });

  it('rejects an invalid agent_runs.provider value', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-c');
    const task = await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING id`, [
      orgId,
    ]);

    await expect(
      pool.query(`INSERT INTO agent_runs (task_id, status, provider) VALUES ($1, 'running', 'gpt4')`, [
        task.rows[0].id,
      ])
    ).rejects.toThrow();
  });
});
