import { readFileSync } from "node:fs";
import { loadTaskEnv } from "../src/config/taskEnv.js";
import { createPool } from "../src/db/pool.js";

async function main(): Promise<void> {
  const [, , organizationId, sourceId, csvFilePath] = process.argv;
  if (!organizationId || !sourceId || !csvFilePath) {
    console.error("Usage: npm run enqueue-csv-import -- <organization-id> <source-id> <csv-file-path>");
    process.exitCode = 1;
    return;
  }

  const csvText = readFileSync(csvFilePath, "utf8");
  const taskEnv = loadTaskEnv();
  const pool = createPool(taskEnv.databaseUrl);
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (organization_id, task_type, payload)
       VALUES ($1, 'lead_finder', $2) RETURNING id`,
      [organizationId, JSON.stringify({ sourceId, query: { csvText } })]
    );
    console.log(`Enqueued lead_finder task ${rows[0].id} for source ${sourceId}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
