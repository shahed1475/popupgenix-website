import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createInvoicesRouter } from './invoices.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;
let adminToken: string;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', createInvoicesRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
  const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
  const admin = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
    [passwordHash]
  );
  adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
});

afterAll(async () => {
  await pool.end();
});

describe('invoices resource', () => {
  it('creates an invoice with line items and replaces them on update', async () => {
    const app = buildApp();

    const created = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        invoice_number: 'INV-0001',
        client_name: 'Acme Co',
        client_email: 'billing@acme.test',
        due_date: '2026-09-01',
        line_items: [{ service_name: 'Design', quantity: 1, rate: 500, amount: 500 }],
      });
    expect(created.status).toBe(201);
    expect(created.body.line_items).toHaveLength(1);
    const invoiceId = created.body.id as string;

    const fetched = await request(app).get(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.line_items).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'sent',
        line_items: [
          { service_name: 'Design', quantity: 1, rate: 500, amount: 500 },
          { service_name: 'Development', quantity: 10, rate: 100, amount: 1000 },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('sent');
    expect(updated.body.line_items).toHaveLength(2);

    const deleted = await request(app).delete(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);

    const lineItemsAfterDelete = await pool.query('SELECT * FROM invoice_line_items WHERE invoice_id = $1', [invoiceId]);
    expect(lineItemsAfterDelete.rows).toHaveLength(0);
  });

  it('blocks anonymous requests (401)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });

  it('denies admin routes to authenticated non-admin users (403)', async () => {
    const app = buildApp();

    // Create a non-admin user
    const nonAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('user@drickly.test', $1, false) RETURNING id`,
      ['$2a$12$abcdefghijklmnopqrstuv']
    );
    const userToken = signAuthToken(
      { sub: nonAdmin.rows[0].id, email: 'user@drickly.test', isAdmin: false },
      SECRET,
      '1h'
    );

    // GET should return 403 for non-admin
    const list = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(403);
  });
});
