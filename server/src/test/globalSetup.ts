import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate.js';
import { closeGlobalTestPool } from './globalPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setup() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL must be set to run integration tests');
  }
  const pool = new Pool({ connectionString });
  try {
    await runMigrations(pool, path.resolve(__dirname, '../../db/migrations'));
    console.log('Global migrations completed');
  } finally {
    await pool.end();
  }
}

export async function teardown() {
  await closeGlobalTestPool();
}
