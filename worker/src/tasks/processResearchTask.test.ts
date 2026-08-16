import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import { MockAIProvider } from "../ai/MockAIProvider.js";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimResearchTasks } from "./claimResearchTasks.js";
import { processResearchTask } from "./processResearchTask.js";

let pool: Pool;
const mockAi = new MockAIProvider();

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedCompanyAndLead(leadStatus = "new") {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (name, domain, industry, description) VALUES ('Acme', 'acme.com', 'Software', 'A SaaS company') RETURNING id"
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (company_id, status) VALUES ($1, $2) RETURNING id",
    [company.rows[0].id, leadStatus]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}

async function seedAndClaimTask(leadId: string) {
  await pool.query(
    "INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', $1)",
    [JSON.stringify({ lead_id: leadId })]
  );
  const [task] = await claimResearchTasks(pool, "worker-1", 1);
  return task;
}

describe("processResearchTask — success path", () => {
  it("writes a research row, an agent_runs row, marks the task succeeded, and moves the lead to researching", async () => {
    const { companyId, leadId } = await seedCompanyAndLead();
    const task = await seedAndClaimTask(leadId);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result).toEqual({ taskId: task.id, status: "succeeded" });

    const research = await pool.query("SELECT * FROM research WHERE subject_id = $1", [companyId]);
    expect(research.rows).toHaveLength(1);
    expect(research.rows[0].subject_type).toBe("company");
    expect(research.rows[0].created_by).toBe("agent");
    expect(research.rows[0].source).toBe("mock");
    expect(research.rows[0].findings).toMatchObject({
      technology: expect.any(Array),
      painPoints: expect.any(Array),
      buyingSignals: expect.any(Array),
    });

    const runs = await pool.query("SELECT status, provider FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows).toEqual([{ status: "succeeded", provider: "mock" }]);

    const taskRow = await pool.query("SELECT status FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("succeeded");

    const leadRow = await pool.query("SELECT status FROM leads WHERE id = $1", [leadId]);
    expect(leadRow.rows[0].status).toBe("researching");
  });

  it("does not touch a lead that is already past the new status", async () => {
    const { leadId } = await seedCompanyAndLead("qualified");
    const task = await seedAndClaimTask(leadId);

    await processResearchTask(pool, mockAi, "mock", task);

    const leadRow = await pool.query("SELECT status FROM leads WHERE id = $1", [leadId]);
    expect(leadRow.rows[0].status).toBe("qualified");
  });
});

describe("processResearchTask — failure paths", () => {
  it("fails the task and retries when the payload has no lead_id", async () => {
    await pool.query("INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', '{}')");
    const [task] = await claimResearchTasks(pool, "worker-1", 1);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/lead_id/);

    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });

  it("fails the task and retries when lead_id is not a well-formed UUID", async () => {
    await pool.query(
      "INSERT INTO agent_tasks (task_type, status, payload) VALUES ('research', 'pending', $1)",
      [JSON.stringify({ lead_id: "not-a-uuid" })]
    );
    const [task] = await claimResearchTasks(pool, "worker-1", 1);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not a valid UUID/);

    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });

  it("marks the task permanently failed once max_attempts is reached", async () => {
    await pool.query(
      "INSERT INTO agent_tasks (task_type, status, payload, attempts, max_attempts) VALUES ('research', 'pending', '{}', 2, 3)"
    );
    const [task] = await claimResearchTasks(pool, "worker-1", 1);

    const result = await processResearchTask(pool, mockAi, "mock", task);

    expect(result.status).toBe("failed");
    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("failed");
    expect(taskRow.rows[0].attempts).toBe(3);
  });

  it("logs a failed agent_runs row and retries when the AI call throws", async () => {
    const { leadId } = await seedCompanyAndLead();
    const task = await seedAndClaimTask(leadId);

    const throwingAi: AIProvider = {
      analyzeCompany: async () => {
        throw new Error("upstream boom");
      },
      researchContact: mockAi.researchContact.bind(mockAi),
      qualifyLead: mockAi.qualifyLead.bind(mockAi),
      generateOutreach: mockAi.generateOutreach.bind(mockAi),
      classifyReply: mockAi.classifyReply.bind(mockAi),
      generateReply: mockAi.generateReply.bind(mockAi),
      analyzeStrategy: mockAi.analyzeStrategy.bind(mockAi),
    };

    const result = await processResearchTask(pool, throwingAi, "mock", task);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/upstream boom/);

    const runs = await pool.query("SELECT status, error FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows).toEqual([{ status: "failed", error: expect.stringContaining("upstream boom") }]);

    const taskRow = await pool.query("SELECT status, attempts FROM agent_tasks WHERE id = $1", [task.id]);
    expect(taskRow.rows[0].status).toBe("pending");
    expect(taskRow.rows[0].attempts).toBe(1);
  });
});
