import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './middleware.js';
import { createAuthRoutes } from './authRoutes.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll, issueTestToken } from '../test/setupTestDb.js';
import type { EmailSender, EmailMessage } from '../email/EmailSender.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp(sender: EmailSender = { send: async () => {} }) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(pool, createAuthMiddleware(SECRET, pool), SECRET, '1h', sender));
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
    expect(typeof first.body.token).toBe('string');
    expect(first.body.user.is_admin).toBe(false);
    expect(first.body.user.password_hash).toBeUndefined();

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

    const adminToken = await issueTestToken(
      pool,
      { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true },
      SECRET,
      '1h'
    );
    const clientToken = await issueTestToken(
      pool,
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

describe('logout revokes the session', () => {
  it('rejects the token on any request after logout', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    await request(app).post('/api/auth/signup').send({ email: 'logout@drickly.test', password: 'longenough1' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logout@drickly.test', password: 'longenough1' });
    const token = login.body.token as string;

    const meBeforeLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meBeforeLogout.status).toBe(200);

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(204);

    const meAfterLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meAfterLogout.status).toBe(401);
  });

  it('rejects logout without a token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('email verification', () => {
  it('sends a verification email, then confirms it and marks the user verified', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const sentMessages: EmailMessage[] = [];
    const app = buildApp({ send: async (message) => { sentMessages.push(message); } });
    await request(app).post('/api/auth/signup').send({ email: 'verify@drickly.test', password: 'longenough1' });
    const login = await request(app).post('/api/auth/login').send({ email: 'verify@drickly.test', password: 'longenough1' });
    const token = login.body.token as string;

    const requestRes = await request(app).post('/api/auth/verify-email/request').set('Authorization', `Bearer ${token}`);
    expect(requestRes.status).toBe(202);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].to).toBe('verify@drickly.test');

    const rawToken = sentMessages[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(rawToken).toBeDefined();

    const confirmRes = await request(app).post('/api/auth/verify-email/confirm').send({ token: rawToken });
    expect(confirmRes.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.email_verified_at).not.toBeNull();

    const reuse = await request(app).post('/api/auth/verify-email/confirm').send({ token: rawToken });
    expect(reuse.status).toBe(400);
  });

  it('rejects confirm with an invalid token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/verify-email/confirm').send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });
});
