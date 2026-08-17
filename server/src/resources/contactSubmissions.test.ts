import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createContactSubmissionsRouter } from './contactSubmissions.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/contact-submissions', createContactSubmissionsRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
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

describe('contact submissions resource', () => {
  it('accepts public submissions but restricts reading/updating to admins', async () => {
    const app = buildApp();

    const submitted = await request(app)
      .post('/api/contact-submissions')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello there' });
    expect(submitted.status).toBe(201);

    const forbiddenList = await request(app).get('/api/contact-submissions');
    expect(forbiddenList.status).toBe(401);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin1@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin1@drickly.test', isAdmin: true }, SECRET, '1h');

    const list = await request(app).get('/api/contact-submissions').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/contact-submissions/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('resolved');
  });

  it('denies admin routes to authenticated non-admin users (403)', async () => {
    const app = buildApp();

    // Create a non-admin user
    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user1@drickly.test', $1, false) RETURNING id`,
      ['$2a$12$abcdefghijklmnopqrstuv']
    );
    const userToken = signAuthToken(
      { sub: nonAdmin.rows[0].id, email: 'user1@drickly.test', isAdmin: false },
      SECRET,
      '1h'
    );

    // POST should work (public)
    const submitted = await request(app)
      .post('/api/contact-submissions')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello there' });
    expect(submitted.status).toBe(201);

    // GET should return 403 for non-admin
    const list = await request(app)
      .get('/api/contact-submissions')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(403);

    // PATCH should return 403 for non-admin
    const patched = await request(app)
      .patch(`/api/contact-submissions/${submitted.body.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'resolved' });
    expect(patched.status).toBe(403);
  });
});
