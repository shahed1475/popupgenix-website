import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../db/migrations');

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints.');
}

describe('Tenant #1 backfill', () => {
  it('makes a pre-existing admin the owner of a default organization', async () => {
    const setupPool = new Pool({ connectionString });
    await setupPool.query('DROP SCHEMA IF EXISTS tenant_one_backfill_test CASCADE');
    await setupPool.query('CREATE SCHEMA tenant_one_backfill_test');
    await setupPool.end();

    const scopedPool = new Pool({
      connectionString,
      options: '-c search_path=tenant_one_backfill_test,public',
    });

    let onlyPreBackfillDir: string | undefined;
    try {
      const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      const backfillFile = '0018_tenant_one_backfill.sql';
      const preBackfillFiles = files.filter((f) => f < backfillFile);

      onlyPreBackfillDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drickly-pre-backfill-'));
      for (const f of preBackfillFiles) {
        await fs.copyFile(path.join(migrationsDir, f), path.join(onlyPreBackfillDir, f));
      }

      await runMigrations(scopedPool, onlyPreBackfillDir);

      const admin = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('owner@popupgenix.com', 'h', true) RETURNING id`
      );
      const nonAdmin = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', 'h', false) RETURNING id`
      );

      await runMigrations(scopedPool, migrationsDir);

      const org = await scopedPool.query(`SELECT id FROM organizations WHERE slug = 'default'`);
      expect(org.rows).toHaveLength(1);

      const adminMembership = await scopedPool.query(
        `SELECT role, organization_id FROM memberships WHERE user_id = $1`,
        [admin.rows[0].id]
      );
      expect(adminMembership.rows).toHaveLength(1);
      expect(adminMembership.rows[0].role).toBe('owner');
      expect(adminMembership.rows[0].organization_id).toBe(org.rows[0].id);

      const nonAdminMembership = await scopedPool.query(
        `SELECT id FROM memberships WHERE user_id = $1`,
        [nonAdmin.rows[0].id]
      );
      expect(nonAdminMembership.rows).toHaveLength(0);
    } finally {
      await scopedPool.end();
      if (onlyPreBackfillDir) {
        await fs.rm(onlyPreBackfillDir, { recursive: true, force: true });
      }
    }
  });

  afterAll(async () => {
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS tenant_one_backfill_test CASCADE');
    await cleanupPool.end();
  });
});
