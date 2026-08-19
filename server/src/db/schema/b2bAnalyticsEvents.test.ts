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

describe('b2b analytics_events', () => {
  it('requires an explicit organization_id and defaults metadata to an empty object', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Org', 'org-analytics') RETURNING id`);

    const event = await pool.query(
      `INSERT INTO analytics_events (organization_id, event_type) VALUES ($1, 'lead_created') RETURNING metadata`,
      [org.rows[0].id]
    );
    expect(event.rows[0].metadata).toEqual({});

    await expect(pool.query(`INSERT INTO analytics_events (event_type) VALUES ('lead_created')`)).rejects.toThrow();
  });
});
