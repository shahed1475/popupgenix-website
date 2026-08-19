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

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

async function insertCompany(pool: Pool, orgId: string, name: string) {
  const { rows } = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    orgId,
    name,
  ]);
  return rows[0].id as string;
}

async function insertCampaign(pool: Pool, orgId: string, name: string) {
  const { rows } = await pool.query(
    `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, $2, 'email') RETURNING id`,
    [orgId, name]
  );
  return rows[0].id as string;
}

async function insertLead(pool: Pool, companyId: string) {
  const { rows } = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [companyId]);
  return rows[0].id as string;
}

describe('organization_id propagation triggers guard UPDATE of the parent FK, not just INSERT', () => {
  describe('contacts (single parent FK: company_id)', () => {
    it('rejects updating a contact to point at a company in a different organization', async () => {
      const orgA = await insertOrg(pool, 'upd-org-a');
      const orgB = await insertOrg(pool, 'upd-org-b');
      const companyA = await insertCompany(pool, orgA, 'Org A Co');
      const companyB = await insertCompany(pool, orgB, 'Org B Co');

      const contact = await pool.query(
        `INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Jane Doe') RETURNING id`,
        [companyA]
      );
      const contactId = contact.rows[0].id as string;

      await expect(pool.query(`UPDATE contacts SET company_id = $1 WHERE id = $2`, [companyB, contactId])).rejects.toThrow();
    });

    it('allows updating a contact to point at another company within the same organization, keeping organization_id correct', async () => {
      const orgA = await insertOrg(pool, 'upd-org-c');
      const companyA1 = await insertCompany(pool, orgA, 'Org A Co 1');
      const companyA2 = await insertCompany(pool, orgA, 'Org A Co 2');

      const contact = await pool.query(
        `INSERT INTO contacts (company_id, full_name) VALUES ($1, 'John Roe') RETURNING id`,
        [companyA1]
      );
      const contactId = contact.rows[0].id as string;

      const updated = await pool.query(
        `UPDATE contacts SET company_id = $1 WHERE id = $2 RETURNING organization_id`,
        [companyA2, contactId]
      );
      expect(updated.rows[0].organization_id).toBe(orgA);
    });
  });

  describe('campaign_leads (two parent FKs: campaign_id, lead_id)', () => {
    it('rejects updating a campaign_lead to point at a campaign in a different organization', async () => {
      const orgA = await insertOrg(pool, 'upd-org-d');
      const orgB = await insertOrg(pool, 'upd-org-e');
      const companyA = await insertCompany(pool, orgA, 'Org D Co');
      const leadA = await insertLead(pool, companyA);
      const campaignA = await insertCampaign(pool, orgA, 'Org A Campaign');
      const campaignB = await insertCampaign(pool, orgB, 'Org B Campaign');

      const campaignLead = await pool.query(
        `INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING id`,
        [campaignA, leadA]
      );
      const campaignLeadId = campaignLead.rows[0].id as string;

      await expect(
        pool.query(`UPDATE campaign_leads SET campaign_id = $1 WHERE id = $2`, [campaignB, campaignLeadId])
      ).rejects.toThrow();
    });

    it('allows updating a campaign_lead to point at another campaign within the same organization, keeping organization_id correct', async () => {
      const orgA = await insertOrg(pool, 'upd-org-f');
      const companyA = await insertCompany(pool, orgA, 'Org F Co');
      const leadA = await insertLead(pool, companyA);
      const campaignA1 = await insertCampaign(pool, orgA, 'Org A Campaign 1');
      const campaignA2 = await insertCampaign(pool, orgA, 'Org A Campaign 2');

      const campaignLead = await pool.query(
        `INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING id`,
        [campaignA1, leadA]
      );
      const campaignLeadId = campaignLead.rows[0].id as string;

      const updated = await pool.query(
        `UPDATE campaign_leads SET campaign_id = $1 WHERE id = $2 RETURNING organization_id`,
        [campaignA2, campaignLeadId]
      );
      expect(updated.rows[0].organization_id).toBe(orgA);
    });
  });
});
