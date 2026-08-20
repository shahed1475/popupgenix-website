import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool } from '../../test/setupTestDb.js';

let pool: Pool;

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

describe('full schema (Phase 1 consolidation)', () => {
  it('creates every expected table from migrations alone, starting from an empty database', async () => {
    const expectedTables = [
      'users', 'projects', 'services', 'contact_submissions', 'quote_requests',
      'invoices', 'invoice_line_items', 'homepage_content', 'feedback', 'admin_settings',
      'organizations', 'memberships',
      'lead_sources', 'companies', 'contacts',
      'strategies', 'strategy_versions',
      'leads', 'research', 'lead_scores', 'raw_leads',
      'campaigns', 'campaign_leads', 'outreach_messages', 'outreach_message_events',
      'replies', 'meetings',
      'agent_tasks', 'agent_runs',
      'analytics_events',
      'clients', 'client_updates', 'messages', 'newsletter_subscriptions',
      'outbox_events',
    ];

    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const actual = new Set(rows.map((r) => r.table_name));

    for (const table of expectedTables) {
      expect(actual.has(table), `expected table "${table}" to exist`).toBe(true);
    }
    expect(actual.has('schema_migrations')).toBe(true);
  });
});
