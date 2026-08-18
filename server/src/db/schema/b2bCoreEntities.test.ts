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

describe('b2b core entities: lead_sources, companies, contacts', () => {
  it('requires an explicit organization_id on companies and lead_sources', async () => {
    const orgId = await insertOrg(pool, 'org-a');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme Corp') RETURNING id`,
      [orgId]
    );
    expect(company.rows[0].id).toBeDefined();

    await expect(pool.query(`INSERT INTO companies (name) VALUES ('No Org Corp')`)).rejects.toThrow();
  });

  it('auto-populates contacts.organization_id from the parent company via trigger', async () => {
    const orgId = await insertOrg(pool, 'org-b');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Beta Inc') RETURNING id`,
      [orgId]
    );

    const contact = await pool.query(
      `INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Jane Doe') RETURNING organization_id`,
      [company.rows[0].id]
    );
    expect(contact.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a contact insert with an organization_id that mismatches its parent company', async () => {
    const orgA = await insertOrg(pool, 'org-c');
    const orgB = await insertOrg(pool, 'org-d');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Gamma LLC') RETURNING id`,
      [orgA]
    );

    await expect(
      pool.query(`INSERT INTO contacts (organization_id, company_id, full_name) VALUES ($1, $2, 'Bad Contact')`, [
        orgB,
        company.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('scopes companies.domain uniqueness per organization, not globally', async () => {
    const orgA = await insertOrg(pool, 'org-e');
    const orgB = await insertOrg(pool, 'org-f');
    await pool.query(`INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme', 'acme.com')`, [orgA]);

    const secondOrgSameDomain = await pool.query(
      `INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Clone', 'acme.com') RETURNING id`,
      [orgB]
    );
    expect(secondOrgSameDomain.rows[0].id).toBeDefined();

    await expect(
      pool.query(`INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Again', 'acme.com')`, [orgA])
    ).rejects.toThrow();
  });
});
