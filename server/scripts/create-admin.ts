import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

// Ensures the given user has an `owner` membership in the default organization.
// Idempotent: safe to call repeatedly for the same user (e.g. re-running create-admin).
async function ensureDefaultOrgOwnerMembership(pool: Pool, userId: string): Promise<void> {
  const org = await pool.query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'default'`);
  const organizationId = org.rows[0]?.id;
  if (!organizationId) {
    throw new Error("Default organization (slug = 'default') not found; run migrations first.");
  }
  await pool.query(
    `INSERT INTO memberships (user_id, organization_id, role)
     SELECT $1, $2, 'owner'
     WHERE NOT EXISTS (
       SELECT 1 FROM memberships WHERE user_id = $1 AND organization_id = $2
     )`,
    [userId, organizationId]
  );
}

export async function createOrPromoteAdmin(pool: Pool, email: string, password: string): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    await pool.query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
    await ensureDefaultOrgOwnerMembership(pool, existing.rows[0].id);
    return `Promoted existing user ${email} to admin.`;
  }
  const passwordHash = await hashPassword(password);
  const inserted = await pool.query<{ id: string }>(
    'INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, true) RETURNING id',
    [email, passwordHash]
  );
  await ensureDefaultOrgOwnerMembership(pool, inserted.rows[0].id);
  return `Created admin user ${email}.`;
}

async function main(): Promise<void> {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    process.exitCode = 1;
    return;
  }
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    console.log(await createOrPromoteAdmin(pool, email, password));
  } finally {
    await pool.end();
  }
}

const isMainModule = !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
