# Phase 1: Schema Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the B2B Growth Engine's 17 tables, a new `organizations`/`memberships` tenant layer, the client-portal tables (`clients`, `client_updates`, `messages`, `newsletter_subscriptions`), and a new `outbox_events` table into `server/db/migrations/`, so the entire application schema is producible from an empty PostgreSQL database using nothing but the existing migration runner — with zero Supabase dependency and zero RLS.

**Architecture:** Every new table is a plain SQL file appended to the existing `server/db/migrations/` sequence (`0002`-`0011`), applied by the existing hand-rolled runner (`server/src/db/migrate.ts`, unchanged). The 17 B2B tables gain a `organization_id` column: root tables (`companies`, `lead_sources`, `strategies`, `campaigns`, `agent_tasks`, `analytics_events`) require it as an explicit insert value; every other B2B table derives it automatically via a `BEFORE INSERT` trigger that copies `organization_id` from its parent row and rejects a mismatched caller-supplied value. This trigger layer is what keeps tenant-correctness intact even for the `worker/`, which connects with a role that has no session/RLS context at all. No RLS policies are created anywhere — authorization is exclusively an application-layer concern, built in a later phase.

**Tech Stack:** PostgreSQL (plain SQL migration files), Node/TypeScript, `pg`, Vitest + `TEST_DATABASE_URL` (existing integration-test convention).

## Global Constraints

- Backend stays Node/Express/TypeScript — no FastAPI/Python (decision confirmed 2026-08-19).
- No RLS policies, no `auth.uid()`, no Supabase-specific SQL anywhere in new migration files — authorization is application-layer only (decision confirmed 2026-08-19), built in a later phase (not this one).
- `memberships.role` supports exactly `owner`, `admin`, `member` for now — matches the already-designed, reused schema in `docs/superpowers/specs/2026-08-16-multi-tenancy-design.md`. The original directive's finer role set (Manager/Marketing/Sales/Viewer) is **not** added until a real permission check needs it, per the user's own "don't implement permissions that have no current use" instruction.
- SQL style matches the existing `server/db/migrations/0001_core_schema.sql`: lowercase types (`uuid`, `text`, `timestamptz`, `jsonb`), reuse the existing `set_updated_at()` trigger function for every new `updated_at` column — do not redefine it.
- This phase is schema-only. It does **not** migrate any live Supabase data (B2B rows or client-portal rows) into the new tables — that is a separate, later data-migration phase requiring live database credentials this session does not have. Existing Drickly production data (`users`, `projects`, `invoices`, etc., already self-hosted) must remain completely untouched — verified by Task 12.
- All new tests use the existing `TEST_DATABASE_URL` + `createTestPool()`/`truncateAll()`/`runMigrations()` conventions already established in `server/src/test/setupTestDb.ts` and `server/src/db/migrate.test.ts` — no new test infrastructure.
- Every task's migration file must be idempotent-safe under the existing runner (applied once, tracked in `schema_migrations`, never re-run) — do not use `CREATE TABLE IF NOT EXISTS` (the runner's own tracking makes it unnecessary and the existing `0001` file doesn't use it either).

---

### Task 1: Organizations + Memberships schema

**Files:**
- Create: `server/db/migrations/0002_organizations_memberships.sql`
- Test: `server/src/db/schema/organizationsMemberships.test.ts`

**Interfaces:**
- Produces: tables `organizations(id, name, slug, created_at, updated_at)` and `memberships(id, user_id, organization_id, role, created_at, updated_at)`, unique constraint `memberships_user_org_unique (user_id, organization_id)`, `CHECK (role IN ('owner','admin','member'))`.
- Consumes: `users(id)` from `0001_core_schema.sql` (FK target for `memberships.user_id`).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/organizationsMemberships.test.ts
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

describe('organizations + memberships schema', () => {
  it('creates an organization and a membership linking it to a user with a role', async () => {
    const org = await pool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`
    );
    const user = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ('owner@acme.test', 'hash') RETURNING id`
    );

    const membership = await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner') RETURNING id, role`,
      [user.rows[0].id, org.rows[0].id]
    );
    expect(membership.rows[0].role).toBe('owner');
  });

  it('rejects a duplicate membership for the same user and organization', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u@acme.test', 'hash') RETURNING id`);
    await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`,
      [user.rows[0].id, org.rows[0].id]
    );

    await expect(
      pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'admin')`, [
        user.rows[0].id,
        org.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('rejects an invalid role', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u2@acme.test', 'hash') RETURNING id`);

    await expect(
      pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'superadmin')`, [
        user.rows[0].id,
        org.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('cascades: deleting an organization removes its memberships', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme Inc', 'acme') RETURNING id`);
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('u3@acme.test', 'hash') RETURNING id`);
    await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')`, [
      user.rows[0].id,
      org.rows[0].id,
    ]);

    await pool.query(`DELETE FROM organizations WHERE id = $1`, [org.rows[0].id]);

    const remaining = await pool.query(`SELECT id FROM memberships WHERE organization_id = $1`, [org.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test -- organizationsMemberships`
Expected: FAIL — `relation "organizations" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0002_organizations_memberships.sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_org_unique UNIQUE (user_id, organization_id)
);
CREATE INDEX memberships_organization_id_idx ON memberships(organization_id);
CREATE INDEX memberships_user_id_idx ON memberships(user_id);
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- organizationsMemberships`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0002_organizations_memberships.sql server/src/db/schema/organizationsMemberships.test.ts
git commit -m "feat: add organizations and memberships tables"
```

---

### Task 2: B2B core entities — lead_sources, companies, contacts

**Files:**
- Create: `server/db/migrations/0003_b2b_lead_sources_companies_contacts.sql`
- Test: `server/src/db/schema/b2bCoreEntities.test.ts`

**Interfaces:**
- Produces: `lead_sources(id, organization_id, name, code, source_type, config, is_active, created_at, updated_at)`, `companies(id, organization_id, name, domain, industry, size_range, country, website, linkedin_url, description, metadata, created_at, updated_at)`, `contacts(id, organization_id, company_id, full_name, title, email, phone, linkedin_url, is_primary, source_id, opted_out, opted_out_at, metadata, created_at, updated_at)`.
- Consumes: `organizations(id)` from Task 1.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bCoreEntities.test.ts
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

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

describe('b2b core entities: lead_sources, companies, contacts', () => {
  it('requires an explicit organization_id on companies and lead_sources', async () => {
    const orgId = await insertOrg(pool, 'org-a');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme Corp') RETURNING id`,
      [orgId]
    );
    expect(company.rows[0].id).toBeDefined();

    await expect(pool.query(`INSERT INTO companies (name) VALUES ('No Org Corp')`)).rejects.toThrow();
  });

  it('auto-populates contacts.organization_id from the parent company via trigger', async () => {
    const orgId = await insertOrg(pool, 'org-b');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Beta Inc') RETURNING id`,
      [orgId]
    );

    const contact = await pool.query(
      `INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Jane Doe') RETURNING organization_id`,
      [company.rows[0].id]
    );
    expect(contact.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a contact insert with an organization_id that mismatches its parent company', async () => {
    const orgA = await insertOrg(pool, 'org-c');
    const orgB = await insertOrg(pool, 'org-d');
    const company = await pool.query(
      `INSERT INTO companies (organization_id, name) VALUES ($1, 'Gamma LLC') RETURNING id`,
      [orgA]
    );

    await expect(
      pool.query(`INSERT INTO contacts (organization_id, company_id, full_name) VALUES ($1, $2, 'Bad Contact')`, [
        orgB,
        company.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('scopes companies.domain uniqueness per organization, not globally', async () => {
    const orgA = await insertOrg(pool, 'org-e');
    const orgB = await insertOrg(pool, 'org-f');
    await pool.query(`INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme', 'acme.com')`, [orgA]);

    const secondOrgSameDomain = await pool.query(
      `INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Clone', 'acme.com') RETURNING id`,
      [orgB]
    );
    expect(secondOrgSameDomain.rows[0].id).toBeDefined();

    await expect(
      pool.query(`INSERT INTO companies (organization_id, name, domain) VALUES ($1, 'Acme Again', 'acme.com')`, [orgA])
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bCoreEntities`
Expected: FAIL — `relation "companies" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0003_b2b_lead_sources_companies_contacts.sql
CREATE TABLE lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  source_type text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_sources_org_code_unique UNIQUE (organization_id, code)
);
CREATE INDEX lead_sources_organization_id_idx ON lead_sources(organization_id);
CREATE TRIGGER lead_sources_set_updated_at BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  industry text,
  size_range text,
  country text,
  website text,
  linkedin_url text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_organization_id_idx ON companies(organization_id);
CREATE UNIQUE INDEX companies_org_domain_unique ON companies(organization_id, domain) WHERE domain IS NOT NULL;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  email text,
  phone text,
  linkedin_url text,
  is_primary boolean NOT NULL DEFAULT false,
  source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  opted_out boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_company_id_idx ON contacts(company_id);
CREATE INDEX contacts_organization_id_idx ON contacts(organization_id);
CREATE UNIQUE INDEX contacts_org_email_unique ON contacts(organization_id, email) WHERE email IS NOT NULL;
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION contacts_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.company_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'contacts.company_id % does not reference an existing company', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'contacts.organization_id (%) does not match parent company organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_set_organization_id_trigger
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bCoreEntities`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0003_b2b_lead_sources_companies_contacts.sql server/src/db/schema/b2bCoreEntities.test.ts
git commit -m "feat: add lead_sources, companies, and contacts tables"
```

---

### Task 3: B2B strategies — strategies, strategy_versions

**Files:**
- Create: `server/db/migrations/0004_b2b_strategies.sql`
- Test: `server/src/db/schema/b2bStrategies.test.ts`

**Interfaces:**
- Produces: `strategies(id, organization_id, name, description, is_active, current_version_id, created_at, updated_at)`, `strategy_versions(id, organization_id, strategy_id, version_number, config, performance_snapshot, notes, created_by, created_at)`.
- Consumes: `organizations(id)` from Task 1.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bStrategies.test.ts
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

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

describe('b2b strategies: strategies, strategy_versions', () => {
  it('auto-populates strategy_versions.organization_id from the parent strategy', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-a');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Cold Outreach v1') RETURNING id`,
      [orgId]
    );

    const version = await pool.query(
      `INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}') RETURNING organization_id`,
      [strategy.rows[0].id]
    );
    expect(version.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a duplicate version_number for the same strategy', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-b');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Strategy X') RETURNING id`,
      [orgId]
    );
    await pool.query(`INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}')`, [
      strategy.rows[0].id,
    ]);

    await expect(
      pool.query(`INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}')`, [
        strategy.rows[0].id,
      ])
    ).rejects.toThrow();
  });

  it('lets strategies.current_version_id point at one of its own strategy_versions', async () => {
    const orgId = await insertOrg(pool, 'org-strategy-c');
    const strategy = await pool.query(
      `INSERT INTO strategies (organization_id, name) VALUES ($1, 'Strategy Y') RETURNING id`,
      [orgId]
    );
    const version = await pool.query(
      `INSERT INTO strategy_versions (strategy_id, version_number, config) VALUES ($1, 1, '{}') RETURNING id`,
      [strategy.rows[0].id]
    );

    const updated = await pool.query(
      `UPDATE strategies SET current_version_id = $1 WHERE id = $2 RETURNING current_version_id`,
      [version.rows[0].id, strategy.rows[0].id]
    );
    expect(updated.rows[0].current_version_id).toBe(version.rows[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bStrategies`
Expected: FAIL — `relation "strategies" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0004_b2b_strategies.sql
CREATE TABLE strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX strategies_organization_id_idx ON strategies(organization_id);
CREATE TRIGGER strategies_set_updated_at BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_snapshot jsonb,
  notes text,
  created_by text NOT NULL DEFAULT 'manual' CHECK (created_by IN ('system', 'agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_versions_strategy_version_unique UNIQUE (strategy_id, version_number)
);
CREATE INDEX strategy_versions_strategy_id_idx ON strategy_versions(strategy_id);
CREATE INDEX strategy_versions_organization_id_idx ON strategy_versions(organization_id);

ALTER TABLE strategies
  ADD CONSTRAINT strategies_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES strategy_versions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION strategy_versions_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM strategies WHERE id = NEW.strategy_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'strategy_versions.strategy_id % does not reference an existing strategy', NEW.strategy_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'strategy_versions.organization_id (%) does not match parent strategy organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strategy_versions_set_organization_id_trigger
  BEFORE INSERT ON strategy_versions
  FOR EACH ROW EXECUTE FUNCTION strategy_versions_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bStrategies`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0004_b2b_strategies.sql server/src/db/schema/b2bStrategies.test.ts
git commit -m "feat: add strategies and strategy_versions tables"
```

---

### Task 4: B2B leads, research, lead_scores

**Files:**
- Create: `server/db/migrations/0005_b2b_leads_research_scores.sql`
- Test: `server/src/db/schema/b2bLeadsResearch.test.ts`

**Interfaces:**
- Produces: `leads(id, organization_id, company_id, contact_id, source_id, status, current_score, current_strategy_version_id, disqualified_reason, owner_id, created_at, updated_at)`, `research(id, organization_id, subject_type, subject_id, summary, findings, confidence, source, created_by, created_at)`, `lead_scores(id, organization_id, lead_id, score, band, reasoning, strategy_version_id, scored_by, created_at)`.
- Consumes: `companies(id)`, `contacts(id)` from Task 2; `lead_sources(id)`, `strategy_versions(id)` from Tasks 2/3; `users(id)` from `0001`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bLeadsResearch.test.ts
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

async function insertOrgAndCompany(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    org.rows[0].id,
    `${slug}-co`,
  ]);
  return { orgId: org.rows[0].id as string, companyId: company.rows[0].id as string };
}

describe('b2b leads, research, lead_scores', () => {
  it('auto-populates leads.organization_id from the parent company', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-leads-a');
    const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING organization_id, status`, [
      companyId,
    ]);
    expect(lead.rows[0].organization_id).toBe(orgId);
    expect(lead.rows[0].status).toBe('new');
  });

  it('resolves research.organization_id polymorphically from a company subject', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-research-a');
    const research = await pool.query(
      `INSERT INTO research (subject_type, subject_id, summary) VALUES ('company', $1, 'notes') RETURNING organization_id`,
      [companyId]
    );
    expect(research.rows[0].organization_id).toBe(orgId);
  });

  it('resolves research.organization_id polymorphically from a contact subject', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-research-b');
    const contact = await pool.query(`INSERT INTO contacts (company_id, full_name) VALUES ($1, 'Jo') RETURNING id`, [
      companyId,
    ]);
    const research = await pool.query(
      `INSERT INTO research (subject_type, subject_id, summary) VALUES ('contact', $1, 'notes') RETURNING organization_id`,
      [contact.rows[0].id]
    );
    expect(research.rows[0].organization_id).toBe(orgId);
  });

  it('rejects research with an invalid subject_type', async () => {
    const { companyId } = await insertOrgAndCompany(pool, 'org-research-c');
    await expect(
      pool.query(`INSERT INTO research (subject_type, subject_id) VALUES ('unknown', $1)`, [companyId])
    ).rejects.toThrow();
  });

  it('auto-populates lead_scores.organization_id from the parent lead', async () => {
    const { orgId, companyId } = await insertOrgAndCompany(pool, 'org-scores-a');
    const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [companyId]);
    const score = await pool.query(
      `INSERT INTO lead_scores (lead_id, score) VALUES ($1, 87.5) RETURNING organization_id`,
      [lead.rows[0].id]
    );
    expect(score.rows[0].organization_id).toBe(orgId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bLeadsResearch`
Expected: FAIL — `relation "leads" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0005_b2b_leads_research_scores.sql
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','researching','qualified','disqualified','approved_for_outreach',
    'contacted','replied','meeting_booked','proposal','won','lost'
  )),
  current_score numeric,
  current_strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  disqualified_reason text,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_company_id_idx ON leads(company_id);
CREATE INDEX leads_contact_id_idx ON leads(contact_id);
CREATE INDEX leads_status_idx ON leads(status);
CREATE INDEX leads_created_at_idx ON leads(created_at DESC);
CREATE INDEX leads_organization_id_idx ON leads(organization_id);
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.company_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'leads.company_id % does not reference an existing company', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'leads.organization_id (%) does not match parent company organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_set_organization_id_trigger
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_organization_id();

CREATE TABLE research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('company', 'contact')),
  subject_id uuid NOT NULL,
  summary text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source text,
  created_by text NOT NULL DEFAULT 'manual' CHECK (created_by IN ('agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_subject_idx ON research(subject_type, subject_id);
CREATE INDEX research_organization_id_idx ON research(organization_id);

CREATE OR REPLACE FUNCTION research_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  IF NEW.subject_type = 'company' THEN
    SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.subject_id;
  ELSIF NEW.subject_type = 'contact' THEN
    SELECT organization_id INTO parent_org_id FROM contacts WHERE id = NEW.subject_id;
  ELSE
    RAISE EXCEPTION 'research.subject_type must be ''company'' or ''contact''';
  END IF;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'research.subject_id % does not reference an existing %', NEW.subject_id, NEW.subject_type;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'research.organization_id (%) does not match subject organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER research_set_organization_id_trigger
  BEFORE INSERT ON research
  FOR EACH ROW EXECUTE FUNCTION research_set_organization_id();

CREATE TABLE lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  band text,
  reasoning text,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  scored_by text NOT NULL DEFAULT 'manual' CHECK (scored_by IN ('agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_scores_lead_id_idx ON lead_scores(lead_id);
CREATE INDEX lead_scores_organization_id_idx ON lead_scores(organization_id);

CREATE OR REPLACE FUNCTION lead_scores_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_scores.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'lead_scores.organization_id (%) does not match parent lead organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_scores_set_organization_id_trigger
  BEFORE INSERT ON lead_scores
  FOR EACH ROW EXECUTE FUNCTION lead_scores_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bLeadsResearch`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0005_b2b_leads_research_scores.sql server/src/db/schema/b2bLeadsResearch.test.ts
git commit -m "feat: add leads, research, and lead_scores tables"
```

---

### Task 5: B2B campaigns — campaigns, campaign_leads, outreach_messages, outreach_message_events

**Files:**
- Create: `server/db/migrations/0006_b2b_campaigns_outreach_messages.sql`
- Test: `server/src/db/schema/b2bCampaignsOutreach.test.ts`

**Interfaces:**
- Produces: `campaigns(id, organization_id, name, channel, status, strategy_version_id, created_by, created_at, updated_at)`, `campaign_leads(id, organization_id, campaign_id, lead_id, approval_status, approved_by, approved_at, status, created_at, updated_at)`, `outreach_messages(id, organization_id, campaign_lead_id, channel, direction, subject, body, status, scheduled_at, sent_at, created_at, updated_at)`, `outreach_message_events(id, organization_id, message_id, event_type, metadata, occurred_at)`.
- Consumes: `strategy_versions(id)` (Task 3), `leads(id)` (Task 4), `users(id)` (`0001`).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bCampaignsOutreach.test.ts
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

async function insertOrgCompanyLead(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    org.rows[0].id,
    `${slug}-co`,
  ]);
  const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [company.rows[0].id]);
  return { orgId: org.rows[0].id as string, leadId: lead.rows[0].id as string };
}

describe('b2b campaigns: campaigns, campaign_leads, outreach_messages, outreach_message_events', () => {
  it('auto-populates campaign_leads.organization_id when campaign and lead agree', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-camp-a');
    const campaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Q1 Outreach', 'email') RETURNING id`,
      [orgId]
    );

    const campaignLead = await pool.query(
      `INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING organization_id`,
      [campaign.rows[0].id, leadId]
    );
    expect(campaignLead.rows[0].organization_id).toBe(orgId);
  });

  it('rejects a campaign_leads row whose campaign and lead belong to different organizations', async () => {
    const { leadId } = await insertOrgCompanyLead(pool, 'org-camp-b');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('other', 'other-camp') RETURNING id`);
    const otherCampaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Mismatched', 'email') RETURNING id`,
      [otherOrg.rows[0].id]
    );

    await expect(
      pool.query(`INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2)`, [
        otherCampaign.rows[0].id,
        leadId,
      ])
    ).rejects.toThrow();
  });

  it('auto-populates outreach_messages.organization_id from campaign_leads, and events from the message', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-camp-c');
    const campaign = await pool.query(
      `INSERT INTO campaigns (organization_id, name, channel) VALUES ($1, 'Q2 Outreach', 'email') RETURNING id`,
      [orgId]
    );
    const campaignLead = await pool.query(`INSERT INTO campaign_leads (campaign_id, lead_id) VALUES ($1, $2) RETURNING id`, [
      campaign.rows[0].id,
      leadId,
    ]);

    const message = await pool.query(
      `INSERT INTO outreach_messages (campaign_lead_id, channel) VALUES ($1, 'email') RETURNING id, organization_id`,
      [campaignLead.rows[0].id]
    );
    expect(message.rows[0].organization_id).toBe(orgId);

    const event = await pool.query(
      `INSERT INTO outreach_message_events (message_id, event_type) VALUES ($1, 'sent') RETURNING organization_id`,
      [message.rows[0].id]
    );
    expect(event.rows[0].organization_id).toBe(orgId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bCampaignsOutreach`
Expected: FAIL — `relation "campaigns" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0006_b2b_campaigns_outreach_messages.sql
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_organization_id_idx ON campaigns(organization_id);
CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'paused', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_leads_campaign_lead_unique UNIQUE (campaign_id, lead_id)
);
CREATE INDEX campaign_leads_campaign_id_idx ON campaign_leads(campaign_id);
CREATE INDEX campaign_leads_lead_id_idx ON campaign_leads(lead_id);
CREATE INDEX campaign_leads_organization_id_idx ON campaign_leads(organization_id);
CREATE TRIGGER campaign_leads_set_updated_at BEFORE UPDATE ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION campaign_leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  campaign_org_id uuid;
  lead_org_id uuid;
BEGIN
  SELECT organization_id INTO campaign_org_id FROM campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id INTO lead_org_id FROM leads WHERE id = NEW.lead_id;
  IF campaign_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_leads.campaign_id % does not reference an existing campaign', NEW.campaign_id;
  END IF;
  IF lead_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_leads.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF campaign_org_id <> lead_org_id THEN
    RAISE EXCEPTION 'campaign % and lead % belong to different organizations', NEW.campaign_id, NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> campaign_org_id THEN
    RAISE EXCEPTION 'campaign_leads.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, campaign_org_id;
  END IF;
  NEW.organization_id := campaign_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_leads_set_organization_id_trigger
  BEFORE INSERT ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION campaign_leads_set_organization_id();

CREATE TABLE outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  channel text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction = 'outbound'),
  subject text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'queued', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_messages_campaign_lead_id_idx ON outreach_messages(campaign_lead_id);
CREATE INDEX outreach_messages_organization_id_idx ON outreach_messages(organization_id);
CREATE TRIGGER outreach_messages_set_updated_at BEFORE UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION outreach_messages_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM campaign_leads WHERE id = NEW.campaign_lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'outreach_messages.campaign_lead_id % does not reference an existing campaign_lead', NEW.campaign_lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'outreach_messages.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outreach_messages_set_organization_id_trigger
  BEFORE INSERT ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION outreach_messages_set_organization_id();

CREATE TABLE outreach_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'queued','sent','delivered','opened','clicked','bounced','failed','unsubscribed'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_message_events_message_id_idx ON outreach_message_events(message_id);
CREATE INDEX outreach_message_events_organization_id_idx ON outreach_message_events(organization_id);

CREATE OR REPLACE FUNCTION outreach_message_events_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM outreach_messages WHERE id = NEW.message_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'outreach_message_events.message_id % does not reference an existing outreach_message', NEW.message_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'outreach_message_events.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outreach_message_events_set_organization_id_trigger
  BEFORE INSERT ON outreach_message_events
  FOR EACH ROW EXECUTE FUNCTION outreach_message_events_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bCampaignsOutreach`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0006_b2b_campaigns_outreach_messages.sql server/src/db/schema/b2bCampaignsOutreach.test.ts
git commit -m "feat: add campaigns, campaign_leads, outreach_messages, outreach_message_events tables"
```

---

### Task 6: B2B replies, meetings

**Files:**
- Create: `server/db/migrations/0007_b2b_replies_meetings.sql`
- Test: `server/src/db/schema/b2bRepliesMeetings.test.ts`

**Interfaces:**
- Produces: `replies(id, organization_id, lead_id, contact_id, in_reply_to_message_id, raw_content, received_at, intent, sentiment, created_at)`, `meetings(id, organization_id, lead_id, contact_id, status, scheduled_at, meeting_link, source, notes, created_at, updated_at)`.
- Consumes: `leads(id)` (Task 4), `contacts(id)` (Task 2), `outreach_messages(id)` (Task 5).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bRepliesMeetings.test.ts
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

async function insertOrgCompanyLead(pool: Pool, slug: string) {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  const company = await pool.query(`INSERT INTO companies (organization_id, name) VALUES ($1, $2) RETURNING id`, [
    org.rows[0].id,
    `${slug}-co`,
  ]);
  const lead = await pool.query(`INSERT INTO leads (company_id) VALUES ($1) RETURNING id`, [company.rows[0].id]);
  return { orgId: org.rows[0].id as string, leadId: lead.rows[0].id as string };
}

describe('b2b replies and meetings', () => {
  it('auto-populates replies.organization_id from the parent lead', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-reply-a');
    const reply = await pool.query(
      `INSERT INTO replies (lead_id, raw_content) VALUES ($1, 'Sounds good') RETURNING organization_id`,
      [leadId]
    );
    expect(reply.rows[0].organization_id).toBe(orgId);
  });

  it('auto-populates meetings.organization_id from the parent lead', async () => {
    const { orgId, leadId } = await insertOrgCompanyLead(pool, 'org-meeting-a');
    const meeting = await pool.query(`INSERT INTO meetings (lead_id) VALUES ($1) RETURNING organization_id, status`, [
      leadId,
    ]);
    expect(meeting.rows[0].organization_id).toBe(orgId);
    expect(meeting.rows[0].status).toBe('proposed');
  });

  it('rejects a reply whose lead_id does not exist', async () => {
    await expect(
      pool.query(`INSERT INTO replies (lead_id, raw_content) VALUES ('00000000-0000-0000-0000-000000000000', 'x')`)
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bRepliesMeetings`
Expected: FAIL — `relation "replies" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0007_b2b_replies_meetings.sql
CREATE TABLE replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  in_reply_to_message_id uuid REFERENCES outreach_messages(id) ON DELETE SET NULL,
  raw_content text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  intent text,
  sentiment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX replies_lead_id_idx ON replies(lead_id);
CREATE INDEX replies_in_reply_to_message_id_idx ON replies(in_reply_to_message_id);
CREATE INDEX replies_organization_id_idx ON replies(organization_id);

CREATE OR REPLACE FUNCTION replies_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'replies.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'replies.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER replies_set_organization_id_trigger
  BEFORE INSERT ON replies
  FOR EACH ROW EXECUTE FUNCTION replies_set_organization_id();

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'completed', 'no_show', 'cancelled')),
  scheduled_at timestamptz,
  meeting_link text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'booking_agent')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_lead_id_idx ON meetings(lead_id);
CREATE INDEX meetings_organization_id_idx ON meetings(organization_id);
CREATE TRIGGER meetings_set_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION meetings_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'meetings.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'meetings.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_set_organization_id_trigger
  BEFORE INSERT ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bRepliesMeetings`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0007_b2b_replies_meetings.sql server/src/db/schema/b2bRepliesMeetings.test.ts
git commit -m "feat: add replies and meetings tables"
```

---

### Task 7: B2B agent_tasks, agent_runs

**Files:**
- Create: `server/db/migrations/0008_b2b_agent_tasks_runs.sql`
- Test: `server/src/db/schema/b2bAgentTasks.test.ts`

**Interfaces:**
- Produces: `agent_tasks(id, organization_id, task_type, status, payload, subject_type, subject_id, priority, scheduled_for, claimed_at, claimed_by, attempts, max_attempts, created_at, updated_at)`, `agent_runs(id, organization_id, task_id, status, provider, started_at, finished_at, output, error, duration_ms, created_at)`.
- Consumes: `organizations(id)` (Task 1). This is the table `worker/src/tasks/claimResearchTasks.ts` already claims from via `FOR UPDATE SKIP LOCKED` — this task changes its schema only, not its claiming query (worker code changes are a later phase).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bAgentTasks.test.ts
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

async function insertOrg(pool: Pool, slug: string) {
  const { rows } = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [slug]);
  return rows[0].id as string;
}

describe('b2b agent_tasks, agent_runs', () => {
  it('requires an explicit organization_id on agent_tasks', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-a');
    const task = await pool.query(
      `INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING status, priority, attempts`,
      [orgId]
    );
    expect(task.rows[0].status).toBe('pending');
    expect(task.rows[0].priority).toBe(0);
    expect(task.rows[0].attempts).toBe(0);

    await expect(pool.query(`INSERT INTO agent_tasks (task_type) VALUES ('research')`)).rejects.toThrow();
  });

  it('auto-populates agent_runs.organization_id from the parent agent_task', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-b');
    const task = await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING id`, [
      orgId,
    ]);

    const run = await pool.query(
      `INSERT INTO agent_runs (task_id, status) VALUES ($1, 'running') RETURNING organization_id`,
      [task.rows[0].id]
    );
    expect(run.rows[0].organization_id).toBe(orgId);
  });

  it('rejects an invalid agent_runs.provider value', async () => {
    const orgId = await insertOrg(pool, 'org-tasks-c');
    const task = await pool.query(`INSERT INTO agent_tasks (organization_id, task_type) VALUES ($1, 'research') RETURNING id`, [
      orgId,
    ]);

    await expect(
      pool.query(`INSERT INTO agent_runs (task_id, status, provider) VALUES ($1, 'running', 'gpt4')`, [
        task.rows[0].id,
      ])
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bAgentTasks`
Expected: FAIL — `relation "agent_tasks" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0008_b2b_agent_tasks_runs.sql
CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN (
    'strategy','lead_finder','research','qualification','outreach',
    'reply','booking','notification','analytics'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','claimed','in_progress','succeeded','failed','cancelled'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject_type text,
  subject_id uuid,
  priority integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_tasks_status_idx ON agent_tasks(status);
CREATE INDEX agent_tasks_scheduled_for_idx ON agent_tasks(scheduled_for);
CREATE INDEX agent_tasks_subject_idx ON agent_tasks(subject_type, subject_id);
CREATE INDEX agent_tasks_organization_id_idx ON agent_tasks(organization_id);
CREATE TRIGGER agent_tasks_set_updated_at BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  provider text CHECK (provider IS NULL OR provider IN ('mock', 'claude')),
  started_at timestamptz,
  finished_at timestamptz,
  output jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_task_id_idx ON agent_runs(task_id);
CREATE INDEX agent_runs_organization_id_idx ON agent_runs(organization_id);

CREATE OR REPLACE FUNCTION agent_runs_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM agent_tasks WHERE id = NEW.task_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'agent_runs.task_id % does not reference an existing agent_task', NEW.task_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'agent_runs.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_runs_set_organization_id_trigger
  BEFORE INSERT ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION agent_runs_set_organization_id();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bAgentTasks`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0008_b2b_agent_tasks_runs.sql server/src/db/schema/b2bAgentTasks.test.ts
git commit -m "feat: add agent_tasks and agent_runs tables"
```

---

### Task 8: B2B analytics_events

**Files:**
- Create: `server/db/migrations/0009_b2b_analytics_events.sql`
- Test: `server/src/db/schema/b2bAnalyticsEvents.test.ts`

**Interfaces:**
- Produces: `analytics_events(id, organization_id, event_type, subject_type, subject_id, strategy_version_id, metadata, occurred_at)`.
- Consumes: `organizations(id)` (Task 1), `strategy_versions(id)` (Task 3).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/b2bAnalyticsEvents.test.ts
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

describe('b2b analytics_events', () => {
  it('requires an explicit organization_id and defaults metadata to an empty object', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Org', 'org-analytics') RETURNING id`);

    const event = await pool.query(
      `INSERT INTO analytics_events (organization_id, event_type) VALUES ($1, 'lead_created') RETURNING metadata`,
      [org.rows[0].id]
    );
    expect(event.rows[0].metadata).toEqual({});

    await expect(pool.query(`INSERT INTO analytics_events (event_type) VALUES ('lead_created')`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- b2bAnalyticsEvents`
Expected: FAIL — `relation "analytics_events" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0009_b2b_analytics_events.sql
CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  subject_type text,
  subject_id uuid,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_event_type_idx ON analytics_events(event_type);
CREATE INDEX analytics_events_occurred_at_idx ON analytics_events(occurred_at DESC);
CREATE INDEX analytics_events_subject_idx ON analytics_events(subject_type, subject_id);
CREATE INDEX analytics_events_organization_id_idx ON analytics_events(organization_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- b2bAnalyticsEvents`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0009_b2b_analytics_events.sql server/src/db/schema/b2bAnalyticsEvents.test.ts
git commit -m "feat: add analytics_events table"
```

---

### Task 9: Client-portal tables — clients, client_updates, messages, newsletter_subscriptions

**Files:**
- Create: `server/db/migrations/0010_client_portal_tables.sql`
- Test: `server/src/db/schema/clientPortalTables.test.ts`

**Interfaces:**
- Produces: `clients(id, name, email, company, phone, website, notes, status, created_at, updated_at)`, `client_updates(id, project_id, title, content, admin_id, file_url, link_url, status, is_read, created_at, updated_at)`, `messages(id, project_id, sender_type, sender_id, message_text, is_read, created_at, updated_at)`, `newsletter_subscriptions(id, email, subscribed_at, created_at, updated_at)`.
- Consumes: `projects(id)`, `users(id)` from `0001_core_schema.sql`.
- Note: this task ports table **shape** only, matching the live Supabase schema captured in `src/integrations/supabase/types.ts` (the two out-of-band tables `profiles`/`clients` were never in a tracked Supabase migration — `clients`'s exact columns and the `status` default of `'active'` are confirmed from `types.ts` plus `src/components/AdminPanel/ClientManager.tsx:61`, not guessed). `profiles` itself is **not** ported as a table — its role is fully absorbed by the existing `users` table; reconciling live `profiles`/`auth.users` data into `users` rows is a data-migration task in a later phase, not this one.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/clientPortalTables.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- clientPortalTables`
Expected: FAIL — `relation "clients" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0010_client_portal_tables.sql
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  phone text,
  website text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE client_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url text,
  link_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_updates_project_id_idx ON client_updates(project_id);
CREATE INDEX client_updates_admin_id_idx ON client_updates(admin_id);
CREATE INDEX client_updates_created_at_idx ON client_updates(created_at DESC);
CREATE TRIGGER client_updates_set_updated_at BEFORE UPDATE ON client_updates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('admin', 'client')),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_project_id_idx ON messages(project_id);
CREATE INDEX messages_created_at_idx ON messages(created_at DESC);
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER newsletter_subscriptions_set_updated_at BEFORE UPDATE ON newsletter_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- clientPortalTables`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0010_client_portal_tables.sql server/src/db/schema/clientPortalTables.test.ts
git commit -m "feat: add client-portal tables (clients, client_updates, messages, newsletter_subscriptions)"
```

---

### Task 10: outbox_events table

**Files:**
- Create: `server/db/migrations/0011_outbox_events.sql`
- Test: `server/src/db/schema/outboxEvents.test.ts`

**Interfaces:**
- Produces: `outbox_events(id, aggregate_type, aggregate_id, event_type, payload, organization_id, status, attempts, created_at, processed_at)`.
- Consumes: `organizations(id)` (Task 1, nullable FK — not every outbox event is org-scoped, e.g. a client-portal notification has no B2B organization).

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/outboxEvents.test.ts
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

describe('outbox_events', () => {
  it('defaults status to pending and attempts to 0, with a nullable organization_id', async () => {
    const event = await pool.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('client_update', '11111111-1111-1111-1111-111111111111', 'client_update.created', '{"title":"hi"}')
       RETURNING status, attempts, organization_id`
    );
    expect(event.rows[0].status).toBe('pending');
    expect(event.rows[0].attempts).toBe(0);
    expect(event.rows[0].organization_id).toBeNull();
  });

  it('rejects an invalid status', async () => {
    await expect(
      pool.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, status)
         VALUES ('client_update', '11111111-1111-1111-1111-111111111111', 'client_update.created', 'unknown')`
      )
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- outboxEvents`
Expected: FAIL — `relation "outbox_events" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0011_outbox_events.sql
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX outbox_events_status_idx ON outbox_events(status);
CREATE INDEX outbox_events_created_at_idx ON outbox_events(created_at);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- outboxEvents`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0011_outbox_events.sql server/src/db/schema/outboxEvents.test.ts
git commit -m "feat: add outbox_events table"
```

---

### Task 11: Extend `truncateAll` and add the full-schema empty-database verification test

**Files:**
- Modify: `server/src/test/setupTestDb.ts`
- Test: `server/src/db/schema/fullSchema.test.ts`

**Interfaces:**
- Consumes: every table created in Tasks 1-10.
- Produces: an updated `truncateAll(pool)` that clears 33 of the schema's 34 tables (the original 10 minus `admin_settings`, which is reset via `UPDATE` instead of truncation, plus 24 new ones) between tests, and a test proving the complete schema — the user's Definition of Done item "a fresh developer can run migrations against an empty database and get a functional database" — actually holds.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/fullSchema.test.ts
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
      'leads', 'research', 'lead_scores',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fullSchema`
Expected: FAIL (this specific test should actually already PASS once Tasks 1-10 are done and committed — if run strictly before any of them, it fails on the first missing table, e.g. `organizations`). If Tasks 1-10 are already complete by the time this task starts, skip to Step 4 and treat this as a regression check.

- [ ] **Step 3: Update `truncateAll`**

```typescript
// server/src/test/setupTestDb.ts
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
      outbox_events,
      newsletter_subscriptions, messages, client_updates, clients,
      agent_runs, agent_tasks,
      analytics_events,
      outreach_message_events, outreach_messages, campaign_leads, campaigns,
      meetings, replies,
      lead_scores, research, leads,
      strategy_versions, strategies,
      contacts, companies, lead_sources,
      memberships, organizations,
      invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, users
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fullSchema`
Expected: PASS (1 test). Then run the entire suite to confirm the `truncateAll` change didn't break any existing test: `npm test`.
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add server/src/test/setupTestDb.ts server/src/db/schema/fullSchema.test.ts
git commit -m "test: extend truncateAll for Phase 1 tables and verify full schema from an empty database"
```

---

### Task 12: Existing-database upgrade preserves data

**Files:**
- Test: `server/src/db/schema/existingDataPreserved.test.ts`

**Interfaces:**
- Consumes: `runMigrations` from `server/src/db/migrate.ts` (unchanged), the full `server/db/migrations/` directory (Tasks 1-10's files plus the original `0001`).
- Produces: nothing new in application code — this is the user's second explicit Definition-of-Done test ("existing database → run migrations → data preserved → tests pass"), proving Phase 1's new migrations don't disturb pre-existing rows from `0001_core_schema.sql`. Runs in an isolated Postgres schema (`phase1_upgrade_test`) on the same `TEST_DATABASE_URL` server so it never touches the tables the rest of the suite uses.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/existingDataPreserved.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../db/migrations');

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints in the plan.');
}

describe('existing database upgrade preserves data', () => {
  it('keeps pre-existing rows from the original schema intact after all Phase 1 migrations run on top', async () => {
    const setupPool = new Pool({ connectionString });
    await setupPool.query('DROP SCHEMA IF EXISTS phase1_upgrade_test CASCADE');
    await setupPool.query('CREATE SCHEMA phase1_upgrade_test');
    await setupPool.end();

    const scopedPool = new Pool({
      connectionString,
      options: '-c search_path=phase1_upgrade_test,public',
    });

    try {
      const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      const onlyFirstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drickly-phase1-only-first-'));
      await fs.copyFile(path.join(migrationsDir, files[0]), path.join(onlyFirstDir, files[0]));

      // Simulate "existing database": apply only the original 0001 schema first.
      await runMigrations(scopedPool, onlyFirstDir);

      const preExisting = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('preexisting@drickly.test', '$2a$12$abcdefghijklmnopqrstuv', true) RETURNING id`
      );

      // Now apply the full, real migrations directory (0001 through the latest Phase 1 file) on top.
      const applied = await runMigrations(scopedPool, migrationsDir);
      expect(applied).not.toContain(files[0]); // already applied, correctly skipped
      expect(applied.length).toBeGreaterThan(0); // the new Phase 1 files were applied

      const stillThere = await scopedPool.query('SELECT id FROM users WHERE email = $1', [
        'preexisting@drickly.test',
      ]);
      expect(stillThere.rows).toHaveLength(1);
      expect(stillThere.rows[0].id).toBe(preExisting.rows[0].id);

      const orgTableExists = await scopedPool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'phase1_upgrade_test' AND table_name = 'organizations'`
      );
      expect(orgTableExists.rows).toHaveLength(1);
    } finally {
      await scopedPool.end();
    }
  });

  afterAll(async () => {
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS phase1_upgrade_test CASCADE');
    await cleanupPool.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- existingDataPreserved`
Expected: FAIL if any migration file has a bug that only surfaces when applied after a pre-existing `0001`-only state (e.g., an accidental dependency ordering issue). If Tasks 1-11 are already correct, this may PASS immediately — in that case this task is a regression/safety-net addition, which is still valuable to commit.

- [ ] **Step 3: (No implementation needed beyond the test itself)** — this task validates behavior that Tasks 1-11 already provide. If it fails, fix the offending migration file from the earlier task before proceeding (do not patch around it here).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- existingDataPreserved`
Expected: PASS (1 test). Then run `npm test` for the full server suite one final time.
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema/existingDataPreserved.test.ts
git commit -m "test: verify Phase 1 migrations preserve pre-existing data when applied to an already-running database"
```

---

## Definition of Done for Phase 1

- [ ] `docker compose up` against an empty `drickly-db` volume, followed by `npm run db:migrate` (or the server's own startup migration step), produces every table listed in Task 11's `fullSchema.test.ts`.
- [ ] All 12 tasks' tests pass (`npm test` inside `server/`, full suite).
- [ ] No RLS policy, `auth.uid()`, or Supabase-specific SQL exists in any file under `server/db/migrations/`.
- [ ] Existing Drickly production data (once this is actually deployed) is provably preserved, per Task 12.
- [ ] `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md` is updated to mark Phase 1 (Schema Consolidation) complete and note that the live-data migration (Supabase → self-hosted, and the `profiles`/`auth.users` identity reconciliation) remains a distinct, not-yet-started follow-up — not silently folded into "done."

**Explicitly out of scope for Phase 1** (do not attempt in this plan's execution): RBAC middleware, `requireOrgMember`/`requirePermission`, any route/resource code for the new tables, `worker/` code changes, live Supabase data export/import, `profiles`/`auth.users` identity reconciliation, Docker Compose changes, and deleting anything from `supabase/`. Each is a later phase per `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md` §9.
