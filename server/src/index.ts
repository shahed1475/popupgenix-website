import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  await runMigrations(pool, path.resolve(__dirname, '../db/migrations'));
  const app = createApp(pool, env.JWT_SECRET, env.JWT_EXPIRES_IN);
  app.listen(env.PORT, () => {
    console.log(`Drickly API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
