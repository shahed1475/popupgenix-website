import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate.js';
import { signAuthToken, type AuthTokenPayload } from '../auth/tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createTestPool(): Promise<Pool> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL must be set to run integration tests — see Global Constraints.');
  }
  const pool = new Pool({ connectionString });
  await runMigrations(pool, path.resolve(__dirname, '../../db/migrations'));
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      agent_runs, agent_tasks, analytics_events, replies, meetings, outreach_message_events, outreach_messages, campaign_leads, campaigns, lead_scores, leads, research, raw_leads, strategy_versions, strategies, invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, lead_sources, companies, contacts, memberships, organizations, users, sessions, email_verification_tokens, password_reset_tokens, clients, client_updates, messages, newsletter_subscriptions, outbox_events
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}

export async function issueTestToken(
  pool: Pool,
  payload: Omit<AuthTokenPayload, 'sid'>,
  secret: string,
  expiresIn: string
): Promise<string> {
  const session = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [payload.sub]
  );
  return signAuthToken({ ...payload, sid: session.rows[0].id }, secret, expiresIn);
}
