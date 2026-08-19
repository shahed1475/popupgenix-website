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

describe('sessions schema', () => {
  it('creates a session for a user with a future expiry and no revocation', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@drickly.test', 'h') RETURNING id`);
    const session = await pool.query(
      `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING revoked_at`,
      [user.rows[0].id]
    );
    expect(session.rows[0].revoked_at).toBeNull();
  });

  it('cascades: deleting a user removes their sessions', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('b@drickly.test', 'h') RETURNING id`);
    const session = await pool.query(
      `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
      [user.rows[0].id]
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);
    const remaining = await pool.query(`SELECT id FROM sessions WHERE id = $1`, [session.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
