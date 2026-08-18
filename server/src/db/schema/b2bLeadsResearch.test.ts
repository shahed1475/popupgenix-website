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

async function insertOrgAndCompany(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    org.rows[0].id,
    `${slug}-co`,
  ]);
  return { orgId: org.rows[0].id as string, companyId: company.rows[0].id as string };
}

describe('b2b leads, research, lead_scores', () => {
  it('auto-populates leads.organization_id from the parent company', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-leads-a');
    const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING organization_id, status`, [
      companyId,
    ]);
    expect(lead.rows[0].organization_id).toBe(orgId);
    expect(lead.rows[0].status).toBe('new');
  });

  it('resolves research.organization_id polymorphically from a company subject', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-research-a');
    const research = await pool.query(
      `INSERT INTO research (subject_type, subject_id, summary) VALUES ('company', $1, 'notes') RETURNING organization_id`,
      [companyId]
    );
    expect(research.rows[0].organization_id).toBe(orgId);
  });

  it('resolves research.organization_id polymorphically from a contact subject', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-research-b');
    const contact = await pool.query(`INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Jo') RETURNING id`, [
      companyId,
    ]);
    const research = await pool.query(
      `INSERT INTO research (subject_type, subject_id, summary) VALUES ('contact', $1, 'notes') RETURNING organization_id`,
      [contact.rows[0].id]
    );
    expect(research.rows[0].organization_id).toBe(orgId);
  });

  it('rejects research with an invalid subject_type', async () => {
    const { companyId } = await insertOrgAndCompany(pool, 'org-research-c');
    await expect(
      pool.query(`INSERT INTO research (subject_type, subject_id) VALUES ('unknown', $1)`, [companyId])
    ).rejects.toThrow();
  });

  it('auto-populates lead_scores.organization_id from the parent lead', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-scores-a');
    const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [companyId]);
    const score = await pool.query(
      `INSERT INTO lead_scores (lead_id, score) VALUES ($1, 87.5) RETURNING organization_id`,
      [lead.rows[0].id]
    );
    expect(score.rows[0].organization_id).toBe(orgId);
  });
});
