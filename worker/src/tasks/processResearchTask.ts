import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import type { ClaimedResearchTask } from "./claimResearchTasks.js";
import { failTask } from "./failTask.js";

export interface ProcessResearchTaskResult {
  taskId: string;
  status: "succeeded" | "failed";
  error?: string;
}

interface LeadCompanyRow {
  lead_id: string;
  company_id: string;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_description: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function processResearchTask(
  pool: Pool,
  ai: AIProvider,
  providerName: "mock" | "claude",
  task: ClaimedResearchTask
): Promise<ProcessResearchTaskResult> {
  const leadId = task.payload.lead_id;
  if (typeof leadId !== "string") {
    return failTask(pool, task, "Task payload is missing lead_id");
  }
  if (!UUID_RE.test(leadId)) {
    return failTask(pool, task, `Task payload lead_id "${leadId}" is not a valid UUID`);
  }

  const { rows } = await pool.query<LeadCompanyRow>(
    `SELECT l.id AS lead_id,
            c.id AS company_id, c.name AS company_name, c.domain AS company_domain,
            c.industry AS company_industry, c.description AS company_description
     FROM leads l JOIN companies c ON c.id = l.company_id
     WHERE l.id = $1`,
    [leadId]
  );
  const row = rows[0];
  if (!row) {
    return failTask(pool, task, `Lead ${leadId} not found`);
  }

  await pool.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);
  await pool.query("UPDATE leads SET status = 'researching' WHERE id = $1 AND status = 'new'", [row.lead_id]);

  const startedAt = new Date();
  try {
    const output = await ai.analyzeCompany({
      companyName: row.company_name,
      domain: row.company_domain,
      industry: row.company_industry,
      description: row.company_description,
      rawContext: null,
    });
    const finishedAt = new Date();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO research (subject_type, subject_id, summary, findings, confidence, source, created_by)
         VALUES ('company', $1, $2, $3, $4, $5, 'agent')`,
        [
          row.company_id,
          output.aiSummary,
          JSON.stringify({
            technology: output.technology,
            revenueEstimate: output.revenueEstimate,
            employees: output.employees,
            growth: output.growth,
            hiring: output.hiring,
            funding: output.funding,
            painPoints: output.painPoints,
            buyingSignals: output.buyingSignals,
          }),
          output.confidence,
          providerName,
        ]
      );

      await client.query(
        `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, output, duration_ms)
         VALUES ($1, 'succeeded', $2, $3, $4, $5, $6)`,
        [
          task.id,
          providerName,
          startedAt,
          finishedAt,
          JSON.stringify(output),
          finishedAt.getTime() - startedAt.getTime(),
        ]
      );

      await client.query("UPDATE agent_tasks SET status = 'succeeded' WHERE id = $1", [task.id]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return { taskId: task.id, status: "succeeded" };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);

    await pool.query(
      `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, error, duration_ms)
       VALUES ($1, 'failed', $2, $3, $4, $5, $6)`,
      [task.id, providerName, startedAt, finishedAt, message, finishedAt.getTime() - startedAt.getTime()]
    );

    return failTask(pool, task, message);
  }
}
