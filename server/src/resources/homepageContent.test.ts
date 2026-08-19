import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll, issueTestToken } from '../test/setupTestDb.js';
import { createHomepageContentRouter } from './homepageContent.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/homepage-content', createHomepageContentRouter(pool, createAuthMiddleware(SECRET, pool)));
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

describe('homepage content resource', () => {
  it('returns null before any content exists, then upserts on PUT', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = await issueTestToken(pool, { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const before = await request(app).get('/api/homepage-content');
    expect(before.body).toBeNull();

    const forbidden = await request(app).put('/api/homepage-content').send({ hero_title: 'nope' });
    expect(forbidden.status).toBe(401);

    const created = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hero_title: 'Build faster', clients_count: 12 });
    expect(created.status).toBe(200);
    expect(created.body.hero_title).toBe('Build faster');

    const updated = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hero_title: 'Build even faster', clients_count: 20 });
    expect(updated.status).toBe(200);
    expect(updated.body.hero_title).toBe('Build even faster');

    const all = await pool.query('SELECT * FROM homepage_content');
    expect(all.rows).toHaveLength(1);
  });

  it('rejects non-admin PUT requests with 403', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const adminToken = await issueTestToken(pool, { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const nonAdminToken = await issueTestToken(pool, { sub: nonAdmin.rows[0].id, email: 'user@drickly.test', isAdmin: false }, SECRET, '1h');
    const app = buildApp();

    // Admin creates content for testing
    const created = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hero_title: 'Test content', clients_count: 5 });
    expect(created.status).toBe(200);

    // Non-admin tries to PUT
    const forbiddenPut = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ hero_title: 'Not allowed', clients_count: 100 });
    expect(forbiddenPut.status).toBe(403);
  });
});
