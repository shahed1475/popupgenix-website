import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import { createPool } from "../db/pool.js";
import { loadTaskEnv } from "../config/taskEnv.js";
import { loadWorkerEnv } from "../config/env.js";
import { createAIProvider } from "../ai/createAIProvider.js";
import { claimResearchTasks } from "./claimResearchTasks.js";
import { processResearchTask } from "./processResearchTask.js";

export interface RunResearchTaskSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function runResearchTask(
  pool: Pool,
  ai: AIProvider,
  providerName: "mock" | "claude",
  batchSize: number
): Promise<RunResearchTaskSummary> {
  const workerId = `research-${process.pid}-${randomUUID()}`;
  const tasks = await claimResearchTasks(pool, workerId, batchSize);

  let succeeded = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const result = await processResearchTask(pool, ai, providerName, task);
      if (result.status === "succeeded") succeeded++;
      else failed++;
    } catch (error) {
      console.error(`Unhandled error processing research task ${task.id}:`, error);
      failed++;
    }
  }

  return { claimed: tasks.length, succeeded, failed };
}

async function main(): Promise<void> {
  const taskEnv = loadTaskEnv();
  const workerEnv = loadWorkerEnv();
  if (workerEnv.provider === "mock") {
    console.warn(
      "WARNING: AI_PROVIDER is not set to 'claude' — using MockAIProvider. Research results will be fabricated placeholder data, not real AI analysis. Set AI_PROVIDER=claude for production use."
    );
  }
  const ai = createAIProvider(workerEnv);
  const pool = createPool(taskEnv.databaseUrl);
  try {
    const summary = await runResearchTask(pool, ai, workerEnv.provider, taskEnv.researchBatchSize);
    console.log(
      `Research task run complete: claimed=${summary.claimed} succeeded=${summary.succeeded} failed=${summary.failed}`
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
