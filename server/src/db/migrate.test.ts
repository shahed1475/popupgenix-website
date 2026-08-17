import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints in the plan.');
}
const pool = new Pool({ connectionString });

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS migration_test_widgets');
  await pool.query("DELETE FROM schema_migrations WHERE filename = '0001_create_widgets.sql'");
  await pool.end();
});

describe('runMigrations', () => {
  it('applies pending sql files and records them, then is a no-op on rerun', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'drickly-migrations-'));
    await writeFile(
      path.join(dir, '0001_create_widgets.sql'),
      'CREATE TABLE migration_test_widgets (id serial PRIMARY KEY, name text NOT NULL);'
    );

    const applied = await runMigrations(pool, dir);
    expect(applied).toEqual(['0001_create_widgets.sql']);

    const check = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'migration_test_widgets'`
    );
    expect(check.rows).toHaveLength(1);

    const secondRun = await runMigrations(pool, dir);
    expect(secondRun).toEqual([]);
  });
});
