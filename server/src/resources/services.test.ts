import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createServicesRouter } from './services.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/services', createServicesRouter(pool, createAuthMiddleware(SECRET)));
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

describe('services resource', () => {
  it('hides inactive services from the public but shows them to admins, and blocks writes from non-admins', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const active = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Web Design', description: 'We build sites' });
    expect(active.status).toBe(201);

    const inactive = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Legacy Service', description: 'Retired', active: false });
    expect(inactive.status).toBe(201);

    const publicList = await request(app).get('/api/services');
    expect(publicList.body).toHaveLength(1);
    expect(publicList.body[0].title).toBe('Web Design');

    const adminList = await request(app).get('/api/services').set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body).toHaveLength(2);

    const forbiddenWrite = await request(app).post('/api/services').send({ title: 'x', description: 'y' });
    expect(forbiddenWrite.status).toBe(401);

    const deleted = await request(app)
      .delete(`/api/services/${inactive.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);
  });

  it('rejects non-admin POST, PATCH, and DELETE on services', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const nonAdminToken = signAuthToken({ sub: nonAdmin.rows[0].id, email: 'user@drickly.test', isAdmin: false }, SECRET, '1h');
    const app = buildApp();

    // Admin creates a service for testing PATCH/DELETE
    const created = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Service', description: 'For testing' });
    const serviceId = created.body.id as string;

    // Non-admin tries to POST
    const forbiddenPost = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ title: 'Not allowed', description: 'Hacking attempt' });
    expect(forbiddenPost.status).toBe(403);

    // Non-admin tries to PATCH
    const forbiddenPatch = await request(app)
      .patch(`/api/services/${serviceId}`)
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ title: 'Updated Title' });
    expect(forbiddenPatch.status).toBe(403);

    // Non-admin tries to DELETE
    const forbiddenDelete = await request(app)
      .delete(`/api/services/${serviceId}`)
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(forbiddenDelete.status).toBe(403);

    // Admin can PATCH (happy path)
    const patchedByAdmin = await request(app)
      .patch(`/api/services/${serviceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title', description: 'Updated description' });
    expect(patchedByAdmin.status).toBe(200);
    expect(patchedByAdmin.body.title).toBe('Updated Title');
    expect(patchedByAdmin.body.description).toBe('Updated description');
  });
});
