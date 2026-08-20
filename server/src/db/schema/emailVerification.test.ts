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

describe('email verification schema', () => {
  it('defaults users.email_verified_at to null', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@drickly.test', 'h') RETURNING email_verified_at`);
    expect(user.rows[0].email_verified_at).toBeNull();
  });

  it('enforces a unique token_hash and cascades on user deletion', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('b@drickly.test', 'h') RETURNING id`);
    const token = await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 day') RETURNING id`,
      [user.rows[0].id]
    );
    await expect(
      pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 day')`,
        [user.rows[0].id]
      )
    ).rejects.toThrow();

    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);
    const remaining = await pool.query(`SELECT id FROM email_verification_tokens WHERE id = $1`, [token.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
