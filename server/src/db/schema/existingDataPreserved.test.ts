// server/src/db/schema/existingDataPreserved.test.ts
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
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints in the plan.');
}

describe('existing database upgrade preserves data', () => {
  it('keeps pre-existing rows from the original schema intact after all Phase 1 migrations run on top', async () => {
    const setupPool = new Pool({ connectionString });
    await setupPool.query('DROP SCHEMA IF EXISTS phase1_upgrade_test CASCADE');
    await setupPool.query('CREATE SCHEMA phase1_upgrade_test');
    await setupPool.end();

    const scopedPool = new Pool({
      connectionString,
      options: '-c search_path=phase1_upgrade_test,public',
    });

    try {
      const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      const onlyFirstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drickly-phase1-only-first-'));
      await fs.copyFile(path.join(migrationsDir, files[0]), path.join(onlyFirstDir, files[0]));

      // Simulate "existing database": apply only the original 0001 schema first.
      await runMigrations(scopedPool, onlyFirstDir);

      const preExisting = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('preexisting@drickly.test', '$2a$12$abcdefghijklmnopqrstuv', true) RETURNING id`
      );

      // Now apply the full, real migrations directory (0001 through the latest Phase 1 file) on top.
      const applied = await runMigrations(scopedPool, migrationsDir);
      expect(applied).not.toContain(files[0]); // already applied, correctly skipped
      expect(applied.length).toBeGreaterThan(0); // the new Phase 1 files were applied

      const stillThere = await scopedPool.query('SELECT id FROM users WHERE email = $1', [
        'preexisting@drickly.test',
      ]);
      expect(stillThere.rows).toHaveLength(1);
      expect(stillThere.rows[0].id).toBe(preExisting.rows[0].id);

      const orgTableExists = await scopedPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'phase1_upgrade_test' AND table_name = 'organizations'`
      );
      expect(orgTableExists.rows).toHaveLength(1);
    } finally {
      await scopedPool.end();
    }
  });

  afterAll(async () => {
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS phase1_upgrade_test CASCADE');
    await cleanupPool.end();
  });
});
