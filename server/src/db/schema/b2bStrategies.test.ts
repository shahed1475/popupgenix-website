// server/src/db/schema/b2bStrategies.test.ts
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

describe('b2b strategies: strategies, strategy_versions', () => {
  it('auto-populates strategy_versions.organization_id from the parent strategy', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-a');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Cold Outreach v1') RETURNING id`,
      [orgId]
    );

    const version = await pool.query(
      `INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}') RETURNING organization_id`,
      [strategy.rows[0].id]
    );
    expect(version.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a duplicate version_number for the same strategy', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-b');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Strategy X') RETURNING id`,
      [orgId]
    );
    await pool.query(`INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}')`, [
      strategy.rows[0].id,
    ]);

    await expect(
      pool.query(`INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}')`, [
        strategy.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('lets strategies.current_version_id point at one of its own strategy_versions', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-c');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Strategy Y') RETURNING id`,
      [orgId]
    );
    const version = await pool.query(
      `INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}') RETURNING id`,
      [strategy.rows[0].id]
    );

    const updated = await pool.query(
      `UPDATE strategies SET current_version_id = $1 WHERE id = $2 RETURNING current_version_id`,
      [version.rows[0].id, strategy.rows[0].id]
    );
    expect(updated.rows[0].current_version_id).toBe(version.rows[0].id);
  });
});
