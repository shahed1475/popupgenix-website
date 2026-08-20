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

async function insertOrgAndSource(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const orgId = org.rows[0].id as string;
  const source = await pool.query(
    `INSERT INTO lead_sources (organization_id, name, code) VALUES ($1, 'CSV Import', $2) RETURNING id`,
    [orgId, `csv-${slug}`]
  );
  return { orgId, sourceId: source.rows[0].id as string };
}

describe('raw_leads schema', () => {
  it('auto-populates organization_id from the parent lead_source via trigger', async () => {
    const { orgId, sourceId } = await insertOrgAndSource(pool, 'org-a');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING organization_id, pipeline_status`,
      [sourceId]
    );
    expect(row.rows[0].organization_id).toBe(orgId);
    expect(row.rows[0].pipeline_status).toBe('pending');
  });

  it('rejects a raw_leads insert with an organization_id that mismatches its parent source', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-b');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Other', 'org-c') RETURNING id`);
    await expect(
      pool.query(`INSERT INTO raw_leads (organization_id, source_id, external_id, raw_payload) VALUES ($1, $2, 'ext-1', '{}')`, [
        otherOrg.rows[0].id,
        sourceId,
      ])
    ).rejects.toThrow();
  });

  it('enforces a unique (source_id, external_id) pair, scoped per source not globally', async () => {
    const { sourceId: sourceA } = await insertOrgAndSource(pool, 'org-d');
    const { sourceId: sourceB } = await insertOrgAndSource(pool, 'org-e');

    await pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}')`, [sourceA]);

    const otherSourceSameExternalId = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}') RETURNING id`,
      [sourceB]
    );
    expect(otherSourceSameExternalId.rows[0].id).toBeDefined();

    await expect(
      pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'dup-ext', '{}')`, [sourceA])
    ).rejects.toThrow();
  });

  it('cascades: deleting a lead_source removes its raw_leads', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-f');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING id`,
      [sourceId]
    );
    await pool.query(`DELETE FROM lead_sources WHERE id = $1`, [sourceId]);
    const remaining = await pool.query(`SELECT id FROM raw_leads WHERE id = $1`, [row.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });

  it('setting lead_id to null on lead deletion, not cascading the raw_leads row away', async () => {
    const { orgId, sourceId } = await insertOrgAndSource(pool, 'org-g');
    const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme') RETURNING id`, [orgId]);
    const lead = await pool.query(`INSERT INTO leads (company_id, source_id) VALUES ($1, $2) RETURNING id`, [
      company.rows[0].id,
      sourceId,
    ]);
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload, lead_id, pipeline_status) VALUES ($1, 'ext-1', '{}', $2, 'merged') RETURNING id`,
      [sourceId, lead.rows[0].id]
    );
    await pool.query(`DELETE FROM leads WHERE id = $1`, [lead.rows[0].id]);
    const remaining = await pool.query(`SELECT lead_id FROM raw_leads WHERE id = $1`, [row.rows[0].id]);
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0].lead_id).toBeNull();
  });

  it('rejects an invalid pipeline_status', async () => {
    const { sourceId } = await insertOrgAndSource(pool, 'org-h');
    await expect(
      pool.query(`INSERT INTO raw_leads (source_id, external_id, raw_payload, pipeline_status) VALUES ($1, 'ext-1', '{}', 'bogus')`, [
        sourceId,
      ])
    ).rejects.toThrow();
  });

  it('re-derives organization_id when source_id is updated to a source in a different organization', async () => {
    const { sourceId: sourceInOrgI } = await insertOrgAndSource(pool, 'org-i');
    const { orgId: orgJ, sourceId: sourceInOrgJ } = await insertOrgAndSource(pool, 'org-j');
    const row = await pool.query(
      `INSERT INTO raw_leads (source_id, external_id, raw_payload) VALUES ($1, 'ext-1', '{}') RETURNING id`,
      [sourceInOrgI]
    );

    const updated = await pool.query(
      `UPDATE raw_leads SET source_id = $1 WHERE id = $2 RETURNING organization_id`,
      [sourceInOrgJ, row.rows[0].id]
    );
    expect(updated.rows[0].organization_id).toBe(orgJ);
  });
});
