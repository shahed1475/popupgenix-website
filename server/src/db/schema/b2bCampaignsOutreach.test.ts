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

describe('b2b campaigns: campaigns, campaign_leads, outreach_messages, outreach_message_events', () => {
  it('auto-populates campaign_leads.organization_id when campaign and lead agree', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-camp-a');
    const campaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Q1 Outreach', 'email') RETURNING id`,
      [orgId]
    );

    const campaignLead = await pool.query(
      `INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING organization_id`,
      [campaign.rows[0].id, leadId]
    );
    expect(campaignLead.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a campaign_leads row whose campaign and lead belong to different organizations', async () => {
    const { leadId } = await insertOrgCompanyLead(pool, 'org-camp-b');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('other', 'other-camp') RETURNING id`);
    const otherCampaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Mismatched', 'email') RETURNING id`,
      [otherOrg.rows[0].id]
    );

    await expect(
      pool.query(`INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2)`, [
        otherCampaign.rows[0].id,
        leadId,
      ])
    ).rejects.toThrow();
  });

  it('auto-populates outreach_messages.organization_id from campaign_leads, and events from the message', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-camp-c');
    const campaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Q2 Outreach', 'email') RETURNING id`,
      [orgId]
    );
    const campaignLead = await pool.query(`INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING id`, [
      campaign.rows[0].id,
      leadId,
    ]);

    const message = await pool.query(
      `INSERT INTO outreach_messages (campaign_lead_id, channel) VALUES ($1, 'email') RETURNING id, organization_id`,
      [campaignLead.rows[0].id]
    );
    expect(message.rows[0].organization_id).toBe(orgId);

    const event = await pool.query(
      `INSERT INTO outreach_message_events (message_id, event_type) VALUES ($1, 'sent') RETURNING organization_id`,
      [message.rows[0].id]
    );
    expect(event.rows[0].organization_id).toBe(orgId);
  });

  it('rejects an outreach_messages row with a campaign_lead_id that does not reference an existing campaign_leads row', async () => {
    const { orgId } = await insertOrgCompanyLead(pool, 'org-camp-d');
    const nonexistentCampaignLeadId = '00000000-0000-0000-0000-000000000000';

    await expect(
      pool.query(
        `INSERT INTO outreach_messages (campaign_lead_id, channel) VALUES ($1, 'email')`,
        [nonexistentCampaignLeadId]
      )
    ).rejects.toThrow();
  });

  it('rejects an outreach_message_events row with a message_id that does not reference an existing outreach_messages row', async () => {
    const nonexistentMessageId = '00000000-0000-0000-0000-000000000000';

    await expect(
      pool.query(
        `INSERT INTO outreach_message_events (message_id, event_type) VALUES ($1, 'sent')`,
        [nonexistentMessageId]
      )
    ).rejects.toThrow();
  });
});
