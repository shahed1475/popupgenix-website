import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createProjectsRouter } from './projects.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectsRouter(pool, createAuthMiddleware(SECRET)));
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

describe('projects resource', () => {
  it('lets an admin create a project and a client only see their own', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const clientA = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('a@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );
    const clientB = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('b@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const clientAToken = signAuthToken({ sub: clientA.rows[0].id, email: 'a@drickly.test', isAdmin: false }, SECRET, '1h');

    const app = buildApp();

    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Site Redesign', description: 'Full redesign', category: 'web', client_user_id: clientA.rows[0].id });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const forbiddenCreate = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({ title: 'Not allowed', description: 'x', category: 'web' });
    expect(forbiddenCreate.status).toBe(403);

    const clientAList = await request(app).get('/api/projects').set('Authorization', `Bearer ${clientAToken}`);
    expect(clientAList.status).toBe(200);
    expect(clientAList.body).toHaveLength(1);
    expect(clientAList.body[0].id).toBe(projectId);

    const clientBToken = signAuthToken({ sub: clientB.rows[0].id, email: 'b@drickly.test', isAdmin: false }, SECRET, '1h');
    const clientBGet = await request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${clientBToken}`);
    expect(clientBGet.status).toBe(404);

    const patched = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ completion_percentage: 50 });
    expect(patched.status).toBe(200);
    expect(patched.body.completion_percentage).toBe(50);

    const deleted = await request(app).delete(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);
  });

  it('rejects non-admin PATCH and DELETE on any project', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const clientA = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('a@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );
    const clientB = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('b@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const clientAToken = signAuthToken({ sub: clientA.rows[0].id, email: 'a@drickly.test', isAdmin: false }, SECRET, '1h');
    const clientBToken = signAuthToken({ sub: clientB.rows[0].id, email: 'b@drickly.test', isAdmin: false }, SECRET, '1h');

    const app = buildApp();

    // Create a project owned by clientA
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Site Redesign', description: 'Full redesign', category: 'web', client_user_id: clientA.rows[0].id });
    const projectId = created.body.id as string;

    // ClientA tries to PATCH their own project
    const clientAPatchOwn = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({ completion_percentage: 50 });
    expect(clientAPatchOwn.status).toBe(403);

    // ClientB tries to PATCH another client's project
    const clientBPatchOther = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${clientBToken}`)
      .send({ completion_percentage: 50 });
    expect(clientBPatchOther.status).toBe(403);

    // ClientA tries to DELETE their own project
    const clientADeleteOwn = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${clientAToken}`);
    expect(clientADeleteOwn.status).toBe(403);

    // ClientB tries to DELETE another client's project
    const clientBDeleteOther = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${clientBToken}`);
    expect(clientBDeleteOther.status).toBe(403);
  });
});
