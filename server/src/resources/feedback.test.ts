import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createFeedbackRouter } from './feedback.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/testimonials', createFeedbackRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('feedback / testimonials resource', () => {
  it('only shows approved, non-deleted testimonials publicly, without client_email', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const client = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const clientToken = signAuthToken({ sub: client.rows[0].id, email: 'client@drickly.test', isAdmin: false }, SECRET, '1h');
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const submitted = await request(app)
      .post('/api/testimonials')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ client_name: 'Client', client_email: 'client@drickly.test', rating: 5, testimonial: 'Great work!' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe('pending');

    const publicBeforeApproval = await request(app).get('/api/testimonials');
    expect(publicBeforeApproval.body).toHaveLength(0);

    const approved = await request(app)
      .patch(`/api/testimonials/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', featured: true });
    expect(approved.status).toBe(200);

    const publicAfterApproval = await request(app).get('/api/testimonials');
    expect(publicAfterApproval.body).toHaveLength(1);
    expect(publicAfterApproval.body[0].client_email).toBeUndefined();

    const mine = await request(app).get('/api/testimonials/mine').set('Authorization', `Bearer ${clientToken}`);
    expect(mine.body).toHaveLength(1);

    const softDeleted = await request(app)
      .delete(`/api/testimonials/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(softDeleted.status).toBe(204);

    const publicAfterDelete = await request(app).get('/api/testimonials');
    expect(publicAfterDelete.body).toHaveLength(0);
  });

  it('blocks anonymous requests to POST (401)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/testimonials')
      .send({ client_name: 'Test', client_email: 'test@test.com', rating: 5, testimonial: 'Good' });
    expect(res.status).toBe(401);
  });

  it('blocks anonymous requests to GET /mine (401)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/testimonials/mine');
    expect(res.status).toBe(401);
  });

  it('blocks anonymous requests to GET /admin (401)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/testimonials/admin');
    expect(res.status).toBe(401);
  });

  it('blocks anonymous requests to PATCH (401)', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/api/testimonials/invalid-id')
      .send({ status: 'approved' });
    expect(res.status).toBe(401);
  });

  it('blocks anonymous requests to DELETE (401)', async () => {
    const app = buildApp();
    const res = await request(app).delete('/api/testimonials/invalid-id');
    expect(res.status).toBe(401);
  });

  it('denies admin routes to authenticated non-admin users (403)', async () => {
    const app = buildApp();

    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user@drickly.test', $1, false) RETURNING id`,
      ['$2a$12$abcdefghijklmnopqrstuv']
    );
    const userToken = signAuthToken(
      { sub: nonAdmin.rows[0].id, email: 'user@drickly.test', isAdmin: false },
      SECRET,
      '1h'
    );

    const patchRes = await request(app)
      .patch('/api/testimonials/invalid-id')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'approved' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete('/api/testimonials/invalid-id')
      .set('Authorization', `Bearer ${userToken}`);
    expect(deleteRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/testimonials/admin')
      .set('Authorization', `Bearer ${userToken}`);
    expect(adminRes.status).toBe(403);
  });
});
