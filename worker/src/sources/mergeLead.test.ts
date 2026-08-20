// worker/src/sources/mergeLead.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { mergeLead } from "./mergeLead.js";
import type { CleanedLead } from "./clean.js";

let pool: Pool;
const ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

function cleaned(overrides: Partial<CleanedLead> = {}): CleanedLead {
  return {
    externalId: "ext-1",
    company: { name: "Acme Inc", domain: "acme.com" },
    contact: null,
    raw: {},
    ...overrides,
  };
}

describe("mergeLead", () => {
  it("creates a new company, contact, and lead when nothing exists yet", async () => {
    const result = await mergeLead(
      pool,
      ORG_ID,
      cleaned({ contact: { fullName: "Jane Doe", email: "jane@acme.com" } })
    );

    expect(result.outcome).toBe("merged");
    expect(result.isNewLead).toBe(true);

    const company = await pool.query("SELECT name, domain FROM companies WHERE id = $1", [result.companyId]);
    expect(company.rows[0]).toEqual({ name: "Acme Inc", domain: "acme.com" });

    const contact = await pool.query("SELECT full_name, email, company_id FROM contacts WHERE id = $1", [result.contactId]);
    expect(contact.rows[0]).toMatchObject({ full_name: "Jane Doe", email: "jane@acme.com", company_id: result.companyId });

    const lead = await pool.query("SELECT status, company_id FROM leads WHERE id = $1", [result.leadId]);
    expect(lead.rows[0]).toMatchObject({ status: "new", company_id: result.companyId });
  });

  it("finds an existing company by organization+domain and fills gaps without clobbering existing data", async () => {
    const existing = await pool.query(
      "INSERT INTO companies (organization_id, name, domain, industry) VALUES ($1, 'Acme Inc', 'acme.com', 'Fintech') RETURNING id",
      [ORG_ID]
    );

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme", domain: "acme.com", country: "US" } }));

    expect(result.companyId).toBe(existing.rows[0].id);
    const company = await pool.query("SELECT name, industry, country FROM companies WHERE id = $1", [result.companyId]);
    expect(company.rows[0]).toEqual({ name: "Acme Inc", industry: "Fintech", country: "US" });
  });

  it("finds an existing contact by organization+email", async () => {
    const company = await pool.query("INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme Inc') RETURNING id", [ORG_ID]);
    const existingContact = await pool.query(
      "INSERT INTO contacts (organization_id, company_id, full_name, email) VALUES ($1, $2, 'Jane Doe', 'jane@acme.com') RETURNING id",
      [ORG_ID, company.rows[0].id]
    );

    const result = await mergeLead(
      pool,
      ORG_ID,
      cleaned({
        company: { name: "Acme Inc", domain: null },
        contact: { fullName: "Jane D.", email: "jane@acme.com" },
      })
    );

    expect(result.contactId).toBe(existingContact.rows[0].id);
  });

  it("always inserts a fresh company when domain is absent (accepted duplication limitation)", async () => {
    await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: null } }));
    const second = await mergeLead(pool, ORG_ID, cleaned({ externalId: "ext-2", company: { name: "Acme Inc", domain: null } }));

    expect(second.outcome).toBe("merged");
    const companies = await pool.query("SELECT id FROM companies WHERE organization_id = $1", [ORG_ID]);
    expect(companies.rows).toHaveLength(2);
  });

  it("attaches to an existing active lead instead of creating a new one", async () => {
    const company = await pool.query(
      "INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Inc', 'acme.com') RETURNING id",
      [ORG_ID]
    );
    const existingLead = await pool.query(
      "INSERT INTO leads (organization_id, company_id, status) VALUES ($1, $2, 'qualified') RETURNING id",
      [ORG_ID, company.rows[0].id]
    );

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));

    expect(result.leadId).toBe(existingLead.rows[0].id);
    expect(result.isNewLead).toBe(false);
    const leads = await pool.query("SELECT id FROM leads WHERE company_id = $1", [company.rows[0].id]);
    expect(leads.rows).toHaveLength(1);
  });

  it("creates a new lead when all prior leads for the company are terminal", async () => {
    const company = await pool.query(
      "INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Inc', 'acme.com') RETURNING id",
      [ORG_ID]
    );
    await pool.query("INSERT INTO leads (organization_id, company_id, status) VALUES ($1, $2, 'lost')", [
      ORG_ID,
      company.rows[0].id,
    ]);

    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));

    expect(result.isNewLead).toBe(true);
    const leads = await pool.query("SELECT status FROM leads WHERE company_id = $1 ORDER BY created_at", [company.rows[0].id]);
    expect(leads.rows).toHaveLength(2);
    expect(leads.rows[1].status).toBe("new");
  });

  it("rejects a RawLead with no usable company name, touching no tables", async () => {
    const result = await mergeLead(pool, ORG_ID, cleaned({ company: { name: null, domain: "acme.com" } }));

    expect(result.outcome).toBe("rejected");
    expect(result.rejectionReason).toBeTruthy();
    const companies = await pool.query("SELECT id FROM companies");
    expect(companies.rows).toHaveLength(0);
  });

  it("enqueues a research agent_task only when a new lead is created, not when attaching to an existing one", async () => {
    await mergeLead(pool, ORG_ID, cleaned({ company: { name: "Acme Inc", domain: "acme.com" } }));
    const afterFirstMerge = await pool.query("SELECT task_type, payload FROM agent_tasks");
    expect(afterFirstMerge.rows).toHaveLength(1);
    expect(afterFirstMerge.rows[0].task_type).toBe("research");

    await mergeLead(pool, ORG_ID, cleaned({ externalId: "ext-2", company: { name: "Acme Inc", domain: "acme.com" } }));
    const afterSecondMerge = await pool.query("SELECT id FROM agent_tasks");
    expect(afterSecondMerge.rows).toHaveLength(1);
  });
});
