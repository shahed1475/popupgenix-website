import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  const lockClient = await pool.connect();
  try {
    // Acquire advisory lock to serialize migration check-and-apply across concurrent calls
    await lockClient.query('SELECT pg_advisory_lock(727294)');

    try {
      await lockClient.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

      const { rows } = await lockClient.query<{ filename: string }>('SELECT filename FROM schema_migrations');
      const applied = new Set(rows.map((r) => r.filename));

      const newlyApplied: string[] = [];
      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = await readFile(path.join(migrationsDir, file), 'utf8');
        try {
          await lockClient.query('BEGIN');
          await lockClient.query(sql);
          await lockClient.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await lockClient.query('COMMIT');
          newlyApplied.push(file);
        } catch (err) {
          await lockClient.query('ROLLBACK');
          throw err;
        }
      }
      return newlyApplied;
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(727294)');
    }
  } finally {
    lockClient.release();
  }
}
