import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { truncateAll } from '../test/setupTestDb.js';
import { getGlobalTestPool } from '../test/globalPool.js';
import { createQuoteRequestsRouter } from './quoteRequests.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/quote-requests', createQuoteRequestsRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await getGlobalTestPool();
  await truncateAll(pool);
});

describe('quote requests resource', () => {
  it('accepts public submissions but restricts reading/updating to admins', async () => {
    const app = buildApp();

    const submitted = await request(app).post('/api/quote-requests').send({
      name: 'Jane',
      email: 'jane@example.com',
      project_type: 'website',
      project_description: 'A marketing site',
      budget_range: '5k-10k',
    });
    expect(submitted.status).toBe(201);

    const forbiddenList = await request(app).get('/api/quote-requests');
    expect(forbiddenList.status).toBe(401);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin2@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin2@drickly.test', isAdmin: true }, SECRET, '1h');

    const patched = await request(app)
      .patch(`/api/quote-requests/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'quoted', estimated_cost: 7500 });
    expect(patched.status).toBe(200);
    expect(Number(patched.body.estimated_cost)).toBe(7500);
  });

  it('denies admin routes to authenticated non-admin users (403)', async () => {
    const app = buildApp();

    // Create a non-admin user
    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user2@drickly.test', $1, false) RETURNING id`,
      ['$2a$12$abcdefghijklmnopqrstuv']
    );
    const userToken = signAuthToken(
      { sub: nonAdmin.rows[0].id, email: 'user2@drickly.test', isAdmin: false },
      SECRET,
      '1h'
    );

    // POST should work (public)
    const submitted = await request(app).post('/api/quote-requests').send({
      name: 'Jane',
      email: 'jane@example.com',
      project_type: 'website',
      project_description: 'A marketing site',
      budget_range: '5k-10k',
    });
    expect(submitted.status).toBe(201);

    // GET should return 403 for non-admin
    const list = await request(app)
      .get('/api/quote-requests')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(403);

    // PATCH should return 403 for non-admin
    const patched = await request(app)
      .patch(`/api/quote-requests/${submitted.body.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'quoted', estimated_cost: 7500 });
    expect(patched.status).toBe(403);
  });
});
