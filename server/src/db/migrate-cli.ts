import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';
import { loadEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const applied = await runMigrations(pool, path.resolve(__dirname, '../../db/migrations'));
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
