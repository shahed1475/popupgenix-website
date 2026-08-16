import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimResearchTasks } from "./claimResearchTasks.js";

let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedCompanyAndLead() {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (name) VALUES ('Acme') RETURNING id"
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (company_id) VALUES ($1) RETURNING id",
    [company.rows[0].id]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}

async function seedResearchTask(leadId: string, overrides: Partial<{ status: string; taskType: string; priority: number }> = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO agent_tasks (task_type, status, payload, priority)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      overrides.taskType ?? "research",
      overrides.status ?? "pending",
      JSON.stringify({ lead_id: leadId }),
      overrides.priority ?? 0,
    ]
  );
  return rows[0].id;
}

describe("claimResearchTasks", () => {
  it("claims a pending research task and marks it claimed", async () => {
    const { leadId } = await seedCompanyAndLead();
    const taskId = await seedResearchTask(leadId);

    const claimed = await claimResearchTasks(pool, "worker-1", 5);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(taskId);
    expect(claimed[0].payload).toEqual({ lead_id: leadId });

    const { rows } = await pool.query("SELECT status, claimed_by FROM agent_tasks WHERE id = $1", [taskId]);
    expect(rows[0].status).toBe("claimed");
    expect(rows[0].claimed_by).toBe("worker-1");
  });

  it("ignores tasks of a different task_type", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { taskType: "outreach" });

    const claimed = await claimResearchTasks(pool, "worker-1", 5);
    expect(claimed).toHaveLength(0);
  });

  it("ignores tasks that are not pending", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { status: "succeeded" });

    const claimed = await claimResearchTasks(pool, "worker-1", 5);
    expect(claimed).toHaveLength(0);
  });

  it("respects the batch size limit and priority ordering", async () => {
    const { leadId } = await seedCompanyAndLead();
    await seedResearchTask(leadId, { priority: 0 });
    const highPriorityId = await seedResearchTask(leadId, { priority: 10 });
    await seedResearchTask(leadId, { priority: 5 });

    const claimed = await claimResearchTasks(pool, "worker-1", 1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(highPriorityId);
  });

  it("never lets two concurrent claims grab the same task", async () => {
    const { leadId } = await seedCompanyAndLead();
    const ids = [await seedResearchTask(leadId), await seedResearchTask(leadId), await seedResearchTask(leadId)];

    const [batchA, batchB] = await Promise.all([
      claimResearchTasks(pool, "worker-a", 2),
      claimResearchTasks(pool, "worker-b", 2),
    ]);

    const claimedIds = [...batchA, ...batchB].map((t) => t.id).sort();
    expect(claimedIds).toEqual([...ids].sort());
    expect(new Set(claimedIds).size).toBe(3);
  });
});
