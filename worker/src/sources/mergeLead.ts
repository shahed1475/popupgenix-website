// worker/src/sources/mergeLead.ts
import type { Pool, PoolClient } from "pg";
import type { CleanedLead } from "./clean.js";

export interface MergeResult {
  outcome: "merged" | "rejected";
  companyId?: string;
  contactId?: string;
  leadId?: string;
  isNewLead?: boolean;
  rejectionReason?: string;
}

const TERMINAL_LEAD_STATUSES = ["won", "lost", "disqualified"] as const;

async function resolveCompany(client: PoolClient, organizationId: string, cleaned: CleanedLead): Promise<string> {
  const { name, domain, industry, sizeRange, country, website, linkedinUrl, description } = cleaned.company;
  if (domain) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO companies (organization_id, name, domain, industry, size_range, country, website, linkedin_url, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, domain) WHERE domain IS NOT NULL
       DO UPDATE SET
         industry = COALESCE(companies.industry, EXCLUDED.industry),
         size_range = COALESCE(companies.size_range, EXCLUDED.size_range),
         country = COALESCE(companies.country, EXCLUDED.country),
         website = COALESCE(companies.website, EXCLUDED.website),
         linkedin_url = COALESCE(companies.linkedin_url, EXCLUDED.linkedin_url),
         description = COALESCE(companies.description, EXCLUDED.description)
       RETURNING id`,
      [organizationId, name, domain, industry, sizeRange, country, website, linkedinUrl, description]
    );
    return rows[0].id;
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO companies (organization_id, name, industry, size_range, country, website, linkedin_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [organizationId, name, industry, sizeRange, country, website, linkedinUrl, description]
  );
  return rows[0].id;
}

interface ResolvedContact {
  contactId: string;
  /**
   * The company the contact actually lives under. On the ON CONFLICT path this can be an OLDER
   * company than the `companyId` passed in (the DO UPDATE SET deliberately never re-points an
   * existing contact), so callers must treat this as authoritative for the rest of the merge.
   */
  companyId: string;
}

async function resolveContact(
  client: PoolClient,
  organizationId: string,
  companyId: string,
  cleaned: CleanedLead
): Promise<ResolvedContact | undefined> {
  if (!cleaned.contact) return undefined;
  const { fullName, title, email, phone, linkedinUrl } = cleaned.contact;
  if (!fullName) return undefined;

  if (email) {
    const { rows } = await client.query<{ id: string; company_id: string }>(
      `INSERT INTO contacts (organization_id, company_id, full_name, title, email, phone, linkedin_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, email) WHERE email IS NOT NULL
       DO UPDATE SET
         title = COALESCE(contacts.title, EXCLUDED.title),
         phone = COALESCE(contacts.phone, EXCLUDED.phone),
         linkedin_url = COALESCE(contacts.linkedin_url, EXCLUDED.linkedin_url)
       RETURNING id, company_id`,
      [organizationId, companyId, fullName, title, email, phone, linkedinUrl]
    );
    return { contactId: rows[0].id, companyId: rows[0].company_id };
  }

  const { rows } = await client.query<{ id: string; company_id: string }>(
    `INSERT INTO contacts (organization_id, company_id, full_name, title, phone, linkedin_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, company_id`,
    [organizationId, companyId, fullName, title, phone, linkedinUrl]
  );
  return { contactId: rows[0].id, companyId: rows[0].company_id };
}

async function resolveLead(
  client: PoolClient,
  organizationId: string,
  companyId: string,
  contactId: string | undefined
): Promise<{ leadId: string; isNewLead: boolean }> {
  const active = await client.query<{ id: string }>(
    `SELECT id FROM leads WHERE company_id = $1 AND status NOT IN ($2, $3, $4) ORDER BY created_at DESC LIMIT 1`,
    [companyId, ...TERMINAL_LEAD_STATUSES]
  );
  if (active.rows[0]) {
    return { leadId: active.rows[0].id, isNewLead: false };
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO leads (organization_id, company_id, contact_id, status) VALUES ($1, $2, $3, 'new') RETURNING id`,
    [organizationId, companyId, contactId ?? null]
  );
  return { leadId: rows[0].id, isNewLead: true };
}

/**
 * Runs the merge against an already-open transaction — it does NOT manage BEGIN/COMMIT/ROLLBACK
 * itself. This is what lets a caller (processLeadFinderTask, Task 14) compose it into a larger
 * caller-owned transaction that also covers the raw_leads insert and status update, so the whole
 * per-record unit commits or rolls back together. Standalone callers (including this file's own
 * tests) should use mergeLead() below instead.
 */
export async function mergeLeadWithClient(
  client: PoolClient,
  organizationId: string,
  cleaned: CleanedLead
): Promise<MergeResult> {
  if (!cleaned.company.name) {
    return { outcome: "rejected", rejectionReason: "No usable company name" };
  }

  const resolvedCompanyId = await resolveCompany(client, organizationId, cleaned);
  const contact = await resolveContact(client, organizationId, resolvedCompanyId, cleaned);
  // When an existing contact is matched by (organization_id, email) it keeps its original
  // company_id — the ON CONFLICT DO UPDATE never re-points it. Follow the contact so the returned
  // companyId and the lead's company_id agree with where the contact actually lives, instead of
  // attaching the lead to a company the contact isn't in.
  const companyId = contact?.companyId ?? resolvedCompanyId;
  const contactId = contact?.contactId;
  const { leadId, isNewLead } = await resolveLead(client, organizationId, companyId, contactId);

  if (isNewLead) {
    await client.query(`INSERT INTO agent_tasks (organization_id, task_type, payload) VALUES ($1, 'research', $2)`, [
      organizationId,
      JSON.stringify({ lead_id: leadId }),
    ]);
  }

  return { outcome: "merged", companyId, contactId, leadId, isNewLead };
}

/** Standalone convenience wrapper: opens and manages its own transaction. */
export async function mergeLead(pool: Pool, organizationId: string, cleaned: CleanedLead): Promise<MergeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await mergeLeadWithClient(client, organizationId, cleaned);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
