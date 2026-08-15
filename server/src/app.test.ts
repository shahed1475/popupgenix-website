import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from './app.js';
import { createTestPool, truncateAll } from './test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp(pool, SECRET, '1h');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('end-to-end: signup -> promote -> login -> manage a service -> public read', () => {
  it('works across the whole wired app', async () => {
    const app = createApp(pool, SECRET, '1h');

    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'admin@drickly.test', password: 'supersecret1' });
    expect(signup.status).toBe(201);

    await pool.query('UPDATE users SET is_admin = true WHERE email = $1', ['admin@drickly.test']);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drickly.test', password: 'supersecret1' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const created = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Web Design', description: 'We build sites' });
    expect(created.status).toBe(201);

    const publicList = await request(app).get('/api/services');
    expect(publicList.status).toBe(200);
    expect(publicList.body).toHaveLength(1);
  });
});
