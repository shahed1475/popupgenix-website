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
  // Fix the contacts email index to be scoped per organization
  try {
    await pool.query('DROP INDEX IF EXISTS contacts_email_unique');
    await pool.query(
      'DROP INDEX IF EXISTS contacts_org_email_unique; CREATE UNIQUE INDEX contacts_org_email_unique ON contacts(organization_id, email) WHERE email IS NOT NULL'
    );
  } catch {
    // Silently ignore errors if contacts table doesn't exist yet
  }
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, lead_sources, companies, contacts, memberships, organizations, users
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}
