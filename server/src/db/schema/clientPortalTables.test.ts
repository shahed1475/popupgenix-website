import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('client-portal tables: clients, client_updates, messages, newsletter_subscriptions', () => {
  it('defaults clients.status to active', async () => {
    const client = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('Acme Co', 'billing@acme.test') RETURNING status`
    );
    expect(client.rows[0].status).toBe('active');
  });

  it('links client_updates to a project and an admin user', async () => {
    const admin = await pool.query(`INSERT INTO users (email, password_hash, is_admin) VALUES ('a@drickly.test', 'h', true) RETURNING id`);
    const project = await pool.query(
      `INSERT INTO projects (title, description, category) VALUES ('Site', 'desc', 'web') RETURNING id`
    );

    const update = await pool.query(
      `INSERT INTO client_updates (project_id, title, content, admin_id) VALUES ($1, 'Milestone hit', 'Done', $2) RETURNING status, is_read`,
      [project.rows[0].id, admin.rows[0].id]
    );
    expect(update.rows[0].status).toBe('pending');
    expect(update.rows[0].is_read).toBe(false);
  });

  it('rejects a message with an invalid sender_type', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u@drickly.test', 'h') RETURNING id`);
    await expect(
      pool.query(`INSERT INTO messages (sender_type, sender_id, message_text) VALUES ('bot', $1, 'hi')`, [
        user.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('enforces a unique email on newsletter_subscriptions', async () => {
    await pool.query(`INSERT INTO newsletter_subscriptions (email) VALUES ('reader@drickly.test')`);
    await expect(
      pool.query(`INSERT INTO newsletter_subscriptions (email) VALUES ('reader@drickly.test')`)
    ).rejects.toThrow();
  });
});
