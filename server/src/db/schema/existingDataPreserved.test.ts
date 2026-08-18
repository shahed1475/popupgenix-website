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

// Kept in sync with the `expectedTables` array in `server/src/db/schema/fullSchema.test.ts` —
// this test proves the same "complete schema" claim, but for an existing database being
// upgraded rather than an empty one, so it duplicates rather than imports (the two tests are
// deliberately independent proofs of the same Definition-of-Done property).
const expectedTables = [
  'users', 'projects', 'services', 'contact_submissions', 'quote_requests',
  'invoices', 'invoice_line_items', 'homepage_content', 'feedback', 'admin_settings',
  'organizations', 'memberships',
  'lead_sources', 'companies', 'contacts',
  'strategies', 'strategy_versions',
  'leads', 'research', 'lead_scores',
  'campaigns', 'campaign_leads', 'outreach_messages', 'outreach_message_events',
  'replies', 'meetings',
  'agent_tasks', 'agent_runs',
  'analytics_events',
  'clients', 'client_updates', 'messages', 'newsletter_subscriptions',
  'outbox_events',
];

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

    let onlyFirstDir: string | undefined;
    try {
      const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      onlyFirstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drickly-phase1-only-first-'));
      await fs.copyFile(path.join(migrationsDir, files[0]), path.join(onlyFirstDir, files[0]));

      // Simulate "existing database": apply only the original 0001 schema first.
      await runMigrations(scopedPool, onlyFirstDir);

      const preExisting = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('preexisting@drickly.test', '$2a$12$abcdefghijklmnopqrstuv', true) RETURNING id`
      );

      // Now apply the full, real migrations directory (0001 through the latest Phase 1 file) on top.
      const applied = await runMigrations(scopedPool, migrationsDir);
      expect(applied).not.toContain(files[0]); // already applied, correctly skipped
      // Exact equality (not just "some files ran") catches a migration being silently skipped
      // or misordered, which a loose length-only assertion would miss.
      expect(applied).toEqual(files.slice(1));

      const stillThere = await scopedPool.query('SELECT id FROM users WHERE email = $1', [
        'preexisting@drickly.test',
      ]);
      expect(stillThere.rows).toHaveLength(1);
      expect(stillThere.rows[0].id).toBe(preExisting.rows[0].id);

      const { rows } = await scopedPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'phase1_upgrade_test' AND table_type = 'BASE TABLE'`
      );
      const actual = new Set(rows.map((r) => r.table_name));
      for (const table of expectedTables) {
        expect(actual.has(table), `expected table "${table}" to exist after upgrade`).toBe(true);
      }
    } finally {
      await scopedPool.end();
      if (onlyFirstDir) {
        await fs.rm(onlyFirstDir, { recursive: true, force: true });
      }
    }
  });

  afterAll(async () => {
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS phase1_upgrade_test CASCADE');
    await cleanupPool.end();
  });
});
