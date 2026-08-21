import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Only databases named like this may be targeted — see assertWorkerTestDatabase. */
const WORKER_TEST_DB_PATTERN = /_worker_test$/;

function databaseNameFrom(connectionString: string): string | null {
  try {
    const name = new URL(connectionString).pathname.replace(/^\//, "");
    return name.length > 0 ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

/**
 * schema.sql unconditionally DROPs and rebuilds every table it owns on each createTestPool() call.
 * Pointed at the server's `drickly_test` database it would silently destroy the server suite's
 * tables and rebuild them in worker's (different, hand-maintained) shape — which is exactly what
 * happened once during this branch's development. Refuse anything that isn't a worker test DB.
 */
function assertWorkerTestDatabase(connectionString: string): void {
  const databaseName = databaseNameFrom(connectionString);
  if (!databaseName || !WORKER_TEST_DB_PATTERN.test(databaseName)) {
    throw new Error(
      `TEST_DATABASE_URL points at database "${databaseName ?? "<unparseable>"}", which does not match ` +
        `${WORKER_TEST_DB_PATTERN} — refusing to run worker tests against it. ` +
        "worker/src/test/schema.sql DROPs and recreates every table it owns on each connection, so it " +
        "must only ever target a dedicated worker test database (e.g. drickly_worker_test), never the " +
        "server's test database."
    );
  }
}

export async function createTestPool(): Promise<Pool> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL must be set to run integration tests — see Global Constraints."
    );
  }
  assertWorkerTestDatabase(connectionString);
  const pool = new Pool({ connectionString });
  const schemaSql = await readFile(path.resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(schemaSql);
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE agent_runs, agent_tasks, raw_leads, research, contacts, leads, lead_sources, companies RESTART IDENTITY CASCADE"
  );
}
