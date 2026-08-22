import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll, issueTestToken } from '../test/setupTestDb.js';
import { createCompaniesRouter } from './companies.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/companies', createCompaniesRouter(pool, createAuthMiddleware(SECRET, pool)));
  app.use(errorHandler);
  return app;
}

async function createOrgWithMember(orgSlug: string, email: string, role: 'owner' | 'admin' | 'member') {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [orgSlug]);
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ($1, 'h', false) RETURNING id`,
    [email]
  );
  await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`, [
    user.rows[0].id,
    org.rows[0].id,
    role,
  ]);
  const token = await issueTestToken(pool, { sub: user.rows[0].id, email, isAdmin: false }, SECRET, '1h');
  return { orgId: org.rows[0].id as string, userId: user.rows[0].id as string, token };
}

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('companies resource', () => {
  it('lets an owner create and list companies scoped to their own organization', async () => {
    const owner = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Acme Inc', domain: 'acme.com' });
    expect(created.status).toBe(201);
    expect(created.body.organization_id).toBe(owner.orgId);

    const list = await request(app).get('/api/companies').set('Authorization', `Bearer ${owner.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Acme Inc');
  });

  it('ignores a client-supplied organization_id and always derives it from membership', async () => {
    const owner = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('org-x', 'org-x') RETURNING id`);
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Sneaky Co', organization_id: otherOrg.rows[0].id });
    expect(created.status).toBe(201);
    expect(created.body.organization_id).toBe(owner.orgId);
  });

  it('rejects a member (read-only role) trying to create a company', async () => {
    const member = await createOrgWithMember('org-a', 'member@org-a.test', 'member');
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Not allowed' });
    expect(created.status).toBe(403);
  });

  it('never returns another organization data: list and get-by-id are both blind to Org B', async () => {
    const orgA = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const orgB = await createOrgWithMember('org-b', 'owner@org-b.test', 'owner');
    const app = buildApp();

    const orgBCompany = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${orgB.token}`)
      .send({ name: 'Org B Co' });
    expect(orgBCompany.status).toBe(201);

    const orgAList = await request(app).get('/api/companies').set('Authorization', `Bearer ${orgA.token}`);
    expect(orgAList.status).toBe(200);
    expect(orgAList.body).toHaveLength(0);

    const orgAGet = await request(app)
      .get(`/api/companies/${orgBCompany.body.id}`)
      .set('Authorization', `Bearer ${orgA.token}`);
    expect(orgAGet.status).toBe(404);
  });

  it('rejects requests from a user with no organization membership', async () => {
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('nomembership@b.com', 'h', false) RETURNING id`
    );
    const token = await issueTestToken(
      pool,
      { sub: user.rows[0].id, email: 'nomembership@b.com', isAdmin: false },
      SECRET,
      '1h'
    );
    const app = buildApp();

    const list = await request(app).get('/api/companies').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(403);
  });
});
