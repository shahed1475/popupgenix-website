import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate.js';

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
      agent_runs, agent_tasks, analytics_events, replies, meetings, outreach_message_events, outreach_messages, campaign_leads, campaigns, lead_scores, leads, research, strategy_versions, strategies, invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, lead_sources, companies, contacts, memberships, organizations, users, clients, client_updates, messages, newsletter_subscriptions
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}
