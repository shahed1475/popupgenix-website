import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { createOrPromoteAdmin } from './create-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../db/migrations');

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints.');
}

describe('create-admin script logic', () => {
  let pool: Pool;

  beforeAll(async () => {
    const setupPool = new Pool({ connectionString });
    await setupPool.query('DROP SCHEMA IF EXISTS create_admin_test CASCADE');
    await setupPool.query('CREATE SCHEMA create_admin_test');
    await setupPool.end();

    pool = new Pool({ connectionString, options: '-c search_path=create_admin_test,public' });
    // Running the full migration set (including the one-shot 0018 backfill) also
    // creates the 'default' organization, matching production's shape.
    await runMigrations(pool, migrationsDir);
  });

  afterEach(async () => {
    await pool.query('TRUNCATE TABLE memberships, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS create_admin_test CASCADE');
    await cleanupPool.end();
  });

  it('gives a brand-new admin exactly one owner membership in the default org', async () => {
    await createOrPromoteAdmin(pool, 'newadmin@test.com', 'password123');

    const user = await pool.query(`SELECT id, is_admin FROM users WHERE email = 'newadmin@test.com'`);
    expect(user.rows).toHaveLength(1);
    expect(user.rows[0].is_admin).toBe(true);

    const org = await pool.query(`SELECT id FROM organizations WHERE slug = 'default'`);
    expect(org.rows).toHaveLength(1);

    const memberships = await pool.query(`SELECT role, organization_id FROM memberships WHERE user_id = $1`, [
      user.rows[0].id,
    ]);
    expect(memberships.rows).toHaveLength(1);
    expect(memberships.rows[0].role).toBe('owner');
    expect(memberships.rows[0].organization_id).toBe(org.rows[0].id);
  });

  it('promoting an existing non-admin user gives them exactly one owner membership, and re-running does not error', async () => {
    const existing = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('promote@test.com', 'h', false) RETURNING id`
    );

    await createOrPromoteAdmin(pool, 'promote@test.com', 'unused-password');
    // Second run for the same email must not error (membership already exists).
    await createOrPromoteAdmin(pool, 'promote@test.com', 'unused-password');

    const user = await pool.query(`SELECT is_admin FROM users WHERE id = $1`, [existing.rows[0].id]);
    expect(user.rows[0].is_admin).toBe(true);

    const org = await pool.query(`SELECT id FROM organizations WHERE slug = 'default'`);

    const memberships = await pool.query(`SELECT role, organization_id FROM memberships WHERE user_id = $1`, [
      existing.rows[0].id,
    ]);
    expect(memberships.rows).toHaveLength(1);
    expect(memberships.rows[0].role).toBe('owner');
    expect(memberships.rows[0].organization_id).toBe(org.rows[0].id);
  });

  it('running create-admin twice for a brand-new email does not error and yields exactly one membership', async () => {
    await createOrPromoteAdmin(pool, 'repeat@test.com', 'password123');
    await createOrPromoteAdmin(pool, 'repeat@test.com', 'password123');

    const user = await pool.query(`SELECT id FROM users WHERE email = 'repeat@test.com'`);
    expect(user.rows).toHaveLength(1);

    const memberships = await pool.query(`SELECT id FROM memberships WHERE user_id = $1`, [user.rows[0].id]);
    expect(memberships.rows).toHaveLength(1);
  });
});
