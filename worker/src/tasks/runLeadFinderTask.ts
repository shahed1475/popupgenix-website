import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "../db/pool.js";
import { loadTaskEnv } from "../config/taskEnv.js";
import { claimTasks } from "./claimTasks.js";
import { processLeadFinderTask } from "./processLeadFinderTask.js";
import { createSourceRegistry, type SourceRegistry } from "../sources/registry.js";
import { csvAdapter } from "../sources/csvAdapter.js";

export interface RunLeadFinderTaskSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runLeadFinderTask(
  pool: Pool,
  registry: SourceRegistry,
  batchSize: number
): Promise<RunLeadFinderTaskSummary> {
  const workerId = `lead-finder-${process.pid}-${randomUUID()}`;
  const tasks = await claimTasks(pool, workerId, "lead_finder", batchSize);

  let succeeded = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const result = await processLeadFinderTask(pool, registry, task, batchSize);
      if (result.status === "succeeded") succeeded++;
      else failed++;
    } catch (error) {
      console.error(`Unhandled error processing lead_finder task ${task.id}:`, error);
      failed++;
    }
  }

  return { claimed: tasks.length, succeeded, failed };
}

async function main(): Promise<void> {
  const taskEnv = loadTaskEnv();
  const pool = createPool(taskEnv.databaseUrl);
  const registry = createSourceRegistry([csvAdapter]);
  try {
    const summary = await runLeadFinderTask(pool, registry, taskEnv.leadFinderBatchSize);
    console.log(
      `Lead finder task run complete: claimed=${summary.claimed} succeeded=${summary.succeeded} failed=${summary.failed}`
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
