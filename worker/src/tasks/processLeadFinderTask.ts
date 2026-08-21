// worker/src/tasks/processLeadFinderTask.ts
import type { Pool } from "pg";
import type { ClaimedTask } from "./claimTasks.js";
import { failTask } from "./failTask.js";
import type { SourceRegistry } from "../sources/registry.js";
import { normalize } from "../sources/normalize.js";
import { clean } from "../sources/clean.js";
import { mergeLeadWithClient } from "../sources/mergeLead.js";
import type { RawLead } from "../sources/types.js";

export interface ProcessLeadFinderTaskResult {
  taskId: string;
  status: "succeeded" | "failed";
  discovered: number;
  merged: number;
  rejected: number;
  errored: number;
  error?: string;
}

interface LeadSourceRow {
  id: string;
  organization_id: string;
  source_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
}

interface LeadFinderPayload {
  sourceId: string;
  query: unknown;
  cursor?: string | null;
}

async function stageAndMergeOneRawLead(
  pool: Pool,
  organizationId: string,
  sourceId: string,
  rawLead: RawLead
): Promise<"inserted-merged" | "inserted-rejected" | "inserted-errored" | "already-seen"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_id, external_id) DO NOTHING
       RETURNING id`,
      [sourceId, rawLead.externalId, JSON.stringify(rawLead.raw)]
    );
    if (!inserted.rows[0]) {
      await client.query("COMMIT");
      return "already-seen";
    }
    const rawLeadId = inserted.rows[0].id;

    try {
      const cleaned = clean(normalize(rawLead));
      const merged = await mergeLeadWithClient(client, organizationId, cleaned);
      if (merged.outcome === "rejected") {
        await client.query(
          `UPDATE raw_leads SET pipeline_status = 'rejected', rejection_reason = $1, processed_at = now() WHERE id = $2`,
          [merged.rejectionReason, rawLeadId]
        );
        await client.query("COMMIT");
        return "inserted-rejected";
      }
      await client.query(
        `UPDATE raw_leads SET pipeline_status = 'merged', lead_id = $1, processed_at = now() WHERE id = $2`,
        [merged.leadId, rawLeadId]
      );
      await client.query("COMMIT");
      return "inserted-merged";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE raw_leads SET pipeline_status = 'errored', error_message = $1, processed_at = now() WHERE id = $2`,
        [message, rawLeadId]
      );
      await client.query("COMMIT");
      return "inserted-errored";
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function processLeadFinderTask(
  pool: Pool,
  registry: SourceRegistry,
  task: ClaimedTask,
  leadFinderBatchSize = 100
): Promise<ProcessLeadFinderTaskResult> {
  const payload = task.payload as unknown as LeadFinderPayload;
  const sourceResult = await pool.query<LeadSourceRow>(
    `SELECT id, organization_id, source_type, config, is_active FROM lead_sources WHERE id = $1`,
    [payload.sourceId]
  );
  const source = sourceResult.rows[0];
  if (!source || !source.is_active) {
    const failed = await failTask(pool, task, `lead_sources ${payload.sourceId} not found or inactive`);
    return { taskId: failed.taskId, status: "failed", discovered: 0, merged: 0, rejected: 0, errored: 0, error: failed.error };
  }

  const adapter = registry.get(source.source_type);
  if (!adapter) {
    const failed = await failTask(pool, task, `No LeadSourceAdapter registered for source_type "${source.source_type}"`);
    return { taskId: failed.taskId, status: "failed", discovered: 0, merged: 0, rejected: 0, errored: 0, error: failed.error };
  }

  await pool.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);

  const controller = new AbortController();
  let discovered = 0;
  let merged = 0;
  let rejected = 0;
  let errored = 0;

  // NOTE: source.organization_id is read back from the lead_sources row (SELECT above), never
  // from task.payload — the payload is caller-supplied JSON on agent_tasks and must not be
  // trusted as an authorization boundary. lead_sources.organization_id is the trigger-validated
  // source of truth threaded into mergeLeadWithClient below.
  const generator = adapter.discover(payload.query, {
    organizationId: source.organization_id,
    sourceId: source.id,
    config: source.config,
    cursor: payload.cursor ?? null,
    limit: leadFinderBatchSize,
    signal: controller.signal,
  });

  let next = await generator.next();
  while (!next.done) {
    discovered++;
    const outcome = await stageAndMergeOneRawLead(pool, source.organization_id, source.id, next.value);
    if (outcome === "inserted-merged") merged++;
    else if (outcome === "inserted-rejected") rejected++;
    else if (outcome === "inserted-errored") errored++;
    next = await generator.next();
  }

  const discoverResult = next.value;
  if (discoverResult.cursor !== null) {
    const idempotencyKey = `leadfinder:${source.id}:${discoverResult.cursor}`;
    await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type, payload, idempotency_key)
       VALUES ($1, 'lead_finder', $2, $3)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [source.organization_id, JSON.stringify({ sourceId: source.id, query: payload.query, cursor: discoverResult.cursor }), idempotencyKey]
    );
  }

  await pool.query(
    `INSERT INTO agent_runs (task_id, status, provider, started_at, finished_at, output)
     VALUES ($1, 'succeeded', NULL, now(), now(), $2)`,
    [task.id, JSON.stringify({ discovered, merged, rejected, errored })]
  );
  await pool.query("UPDATE agent_tasks SET status = 'succeeded' WHERE id = $1", [task.id]);

  return { taskId: task.id, status: "succeeded", discovered, merged, rejected, errored };
}
