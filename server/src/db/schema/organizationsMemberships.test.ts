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

describe('organizations + memberships schema', () => {
  it('creates an organization and a membership linking it to a user with a role', async () => {
    const org = await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`
    );
    const user = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ('owner@acme.test', 'hash') RETURNING id`
    );

    const membership = await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner') RETURNING id, role`,
      [user.rows[0].id, org.rows[0].id]
    );
    expect(membership.rows[0].role).toBe('owner');
  });

  it('rejects a duplicate membership for the same user and organization', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u@acme.test', 'hash') RETURNING id`);
    await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`,
      [user.rows[0].id, org.rows[0].id]
    );

    await expect(
      pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')`, [
        user.rows[0].id,
        org.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('rejects an invalid role', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u2@acme.test', 'hash') RETURNING id`);

    await expect(
      pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'superadmin')`, [
        user.rows[0].id,
        org.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('cascades: deleting an organization removes its memberships', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u3@acme.test', 'hash') RETURNING id`);
    await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')`, [
      user.rows[0].id,
      org.rows[0].id,
    ]);

    await pool.query(`DELETE FROM organizations WHERE id = $1`, [org.rows[0].id]);

    const remaining = await pool.query(`SELECT id FROM memberships WHERE organization_id = $1`, [org.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
