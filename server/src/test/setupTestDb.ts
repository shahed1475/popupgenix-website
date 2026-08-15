import { Pool } from 'pg';

export async function createTestPool(): Promise<Pool> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL must be set to run integration tests — see Global Constraints.');
  }
  const pool = new Pool({ connectionString });
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, users
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}
