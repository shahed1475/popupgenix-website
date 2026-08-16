import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createTestPool(): Promise<Pool> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL must be set to run integration tests — see Global Constraints."
    );
  }
  const pool = new Pool({ connectionString });
  const schemaSql = await readFile(path.resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(schemaSql);
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE agent_runs, agent_tasks, research, leads, companies RESTART IDENTITY CASCADE"
  );
}
