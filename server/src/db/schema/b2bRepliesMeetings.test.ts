import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function insertOrgCompanyLead(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    org.rows[0].id,
    `${slug}-co`,
  ]);
  const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [company.rows[0].id]);
  return { orgId: org.rows[0].id as string, leadId: lead.rows[0].id as string };
}

describe('b2b replies and meetings', () => {
  it('auto-populates replies.organization_id from the parent lead', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-reply-a');
    const reply = await pool.query(
      `INSERT INTO replies (lead_id, raw_content) VALUES ($1, 'Sounds good') RETURNING organization_id`,
      [leadId]
    );
    expect(reply.rows[0].organization_id).toBe(orgId);
  });

  it('auto-populates meetings.organization_id from the parent lead', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-meeting-a');
    const meeting = await pool.query(`INSERT INTO meetings (lead_id) VALUES ($1) RETURNING organization_id, status`, [
      leadId,
    ]);
    expect(meeting.rows[0].organization_id).toBe(orgId);
    expect(meeting.rows[0].status).toBe('proposed');
  });

  it('rejects a reply whose lead_id does not exist', async () => {
    await expect(
      pool.query(`INSERT INTO replies (lead_id, raw_content) VALUES ('00000000-0000-0000-0000-000000000000', 'x')`)
    ).rejects.toThrow();
  });
});
