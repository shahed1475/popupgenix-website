import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './middleware.js';
import { createAuthRoutes } from './authRoutes.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(pool, createAuthMiddleware(SECRET), SECRET, '1h'));
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

describe('POST /api/auth/signup', () => {
  it('rejects signup while disabled', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(res.status).toBe(403);
  });

  it('creates a non-admin user once enabled, and rejects duplicate emails', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    const first = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(first.status).toBe(201);
    expect(first.body.is_admin).toBe(false);
    expect(first.body.password_hash).toBeUndefined();

    const dup = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(dup.status).toBe(409);
  });
});

describe('login + me', () => {
  it('logs in and returns a usable token', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });

    const badLogin = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong' });
    expect(badLogin.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'longenough1' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@b.com');
  });
});

describe('admin user management', () => {
  it('lets an admin list and create client users, and blocks non-admins', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id, email, is_admin`,
      [passwordHash]
    );
    const client = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const { signAuthToken } = await import('./tokens.js');
    const adminToken = signAuthToken(
      { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true },
      SECRET,
      '1h'
    );
    const clientToken = signAuthToken(
      { sub: client.rows[0].id, email: 'client@drickly.test', isAdmin: false },
      SECRET,
      '1h'
    );

    const app = buildApp();
    const forbidden = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${clientToken}`);
    expect(forbidden.status).toBe(403);

    const list = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const created = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'newclient@drickly.test', password: 'longenough1', full_name: 'New Client' });
    expect(created.status).toBe(201);
    expect(created.body.is_admin).toBe(false);
  });
});
