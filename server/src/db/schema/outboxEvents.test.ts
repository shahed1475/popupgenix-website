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

describe('outbox_events', () => {
  it('defaults status to pending and attempts to 0, with a nullable organization_id', async () => {
    const event = await pool.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('client_update', '11111111-1111-1111-1111-111111111111', 'client_update.created', '{"title":"hi"}')
       RETURNING status, attempts, organization_id`
    );
    expect(event.rows[0].status).toBe('pending');
    expect(event.rows[0].attempts).toBe(0);
    expect(event.rows[0].organization_id).toBeNull();
  });

  it('rejects an invalid status', async () => {
    await expect(
      pool.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, status)
         VALUES ('client_update', '11111111-1111-1111-1111-111111111111', 'client_update.created', 'unknown')`
      )
    ).rejects.toThrow();
  });
});
