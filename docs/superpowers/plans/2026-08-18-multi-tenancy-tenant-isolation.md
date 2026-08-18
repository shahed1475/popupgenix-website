# Multi-Tenancy Subsystem 2+3: Tenant Isolation on the 17 B2B Tables + Worker Changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit `organization_id` onto all 17 existing B2B Growth Engine tables (companies,
contacts, leads, campaigns, outreach_messages, etc.), replace their single global
`is_admin(auth.uid())` RLS policy with org-scoped member access, and update the research worker
so its writes stay tenant-correct despite bypassing RLS. This is the largest, highest-risk
subsystem in the multi-tenancy design — every table changes, but each migration is additive
and scoped to the same logical grouping the original tables were created in.

**Architecture:** Supabase Postgres migrations, one file per logical table group (mirroring the
original `20260813120*.sql` groupings exactly), each adding `organization_id` + a `BEFORE INSERT`
propagation trigger + rewritten RLS in one migration, plus new tests in the existing
`supabase/tests/` RLS harness. Worker changes are a small, separate task at the end.

**Tech Stack:** Supabase Postgres (SQL migrations), `worker/` (TypeScript + `pg`, vitest).

**Prerequisite:** Subsystem 1 must be complete and merged first — this plan depends on
`public.organizations`, `public.memberships`, `public.is_org_member`, `public.is_org_admin`,
`public.is_org_owner`, `public.create_organization()`, and the `'Default Organization'` /
`slug = 'default'` Tenant #1 row all existing (see
`docs/superpowers/plans/2026-08-16-multi-tenancy-organizations.md`).

**Reference spec:** `docs/superpowers/specs/2026-08-16-multi-tenancy-design.md` (Subsystems 2
and 3 of 4 per its Implementation Sequencing section).

## Global Constraints

- Migration file naming/style matches the existing convention exactly: `id UUID NOT NULL
  DEFAULT gen_random_uuid() PRIMARY KEY`, `created_at`/`updated_at` as `TIMESTAMP WITH TIME
  ZONE NOT NULL DEFAULT now()`, reuse `public.update_updated_at_column()` (never redefine it),
  `TEXT ... CHECK (col IN (...))` instead of native enums. **Never modify an existing migration
  file, table, function, or RLS policy** — every change here is a new, additive migration file.
- Every `organization_id` column follows the same three-step order to avoid ever locking a
  table against a NOT NULL constraint with no value to fill: add nullable → `UPDATE` backfill
  to `(SELECT id FROM public.organizations WHERE slug = 'default')` → `ALTER COLUMN ...  SET
  NOT NULL` → add the FK → (derived tables only) add the `BEFORE INSERT` propagation trigger
  *after* the column is populated and constrained, so it only governs new inserts going
  forward.
- Every propagation trigger function is `SECURITY DEFINER`, `SET search_path = public`, and:
  resolves the parent's `organization_id` (raising if the parent doesn't exist or has no
  `organization_id`), rejects the insert if the caller supplied a mismatched explicit
  `organization_id`, and otherwise sets `NEW.organization_id` from the resolved parent value.
  This exact shape is used for every derived table below — copy the pattern, do not invent a
  variant per table.
- RLS rewrite for every data table (all 17): `DROP POLICY "Admins manage <table>" ON
  public.<table>;` immediately followed by one new `FOR ALL` policy named `"Members manage
  <table>"` using `public.is_org_member(auth.uid(), organization_id)` for both `USING` and
  `WITH CHECK`. No finer-grained per-role restriction on data tables in this phase (matches the
  approved design — nothing requires e.g. "members can't delete leads" yet).
- Test additions go in the existing `supabase/tests/` harness (`npm run test:supabase`, real
  local Supabase CLI stack — RLS cannot be verified against a plain Postgres container). Every
  new test file follows the existing `organizations.test.ts`/`memberships.test.ts` pattern:
  `createTestUser` + `createUserClient` per simulated user, `create_organization` RPC to get
  each user their own org, assert cross-org `SELECT` returns `[]` and cross-org writes are
  rejected.
- The worker's Postgres role bypasses RLS by design (documented in the worker's own spec) — RLS
  is not the isolation mechanism for anything the worker writes. The propagation triggers are
  what keep worker writes tenant-correct; this is why triggers exist even though the worker
  never runs as an authenticated Supabase user.
- After every task: `npx supabase db reset` (reapply full migration history from scratch) then
  `npm run test:supabase` — a broken migration or ordering problem must surface immediately,
  not accumulate across tasks.

## File Structure

```
supabase/
  migrations/
    20260818140000_multi_tenancy_lead_sources_companies_contacts.sql   # Task 1
    20260818140100_multi_tenancy_strategies.sql                        # Task 2
    20260818140200_multi_tenancy_leads_research_scores.sql             # Task 3
    20260818140300_multi_tenancy_campaigns_outreach_messages.sql       # Task 4
    20260818140400_multi_tenancy_replies_meetings.sql                  # Task 5
    20260818140500_multi_tenancy_agent_tasks_runs.sql                  # Task 6
    20260818140600_multi_tenancy_analytics_events.sql                  # Task 7
  tests/
    testHelpers.ts                    # Task 1 — extended with a shared org-fixture helper
    tenantIsolationLeadSourcesCompaniesContacts.test.ts   # Task 1
    tenantIsolationStrategies.test.ts                     # Task 2
    tenantIsolationLeadsResearchScores.test.ts             # Task 3
    tenantIsolationCampaignsOutreachMessages.test.ts        # Task 4
    tenantIsolationRepliesMeetings.test.ts                  # Task 5
    tenantIsolationAgentTasksRuns.test.ts                   # Task 6
    tenantIsolationAnalyticsEvents.test.ts                  # Task 7
worker/
  src/
    tasks/
      processResearchTask.ts    # Task 8 (modify)
    test/
      schema.sql                # Task 8 (modify)
    tasks/
      processResearchTask.test.ts   # Task 8 (modify)
```

---

### Task 1: `lead_sources`, `companies`, `contacts` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140000_multi_tenancy_lead_sources_companies_contacts.sql`
- Modify: `supabase/tests/testHelpers.ts` (add shared fixture helper)
- Create: `supabase/tests/tenantIsolationLeadSourcesCompaniesContacts.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.is_org_member`, `create_organization` RPC,
  `createAdminClient`/`createTestUser`/`createUserClient` (Subsystem 1).
- Produces: `organization_id` on `lead_sources` (root), `companies` (root), `contacts` (derived
  from `companies`). Produces a new shared test helper `createOrgWithOwnerClient(admin):
  Promise<{ orgId: string; client: SupabaseClient }>` — every later task's tests use this
  instead of re-deriving the create-org-and-sign-in boilerplate.

- [ ] **Step 1: Add the shared org-fixture test helper**

Add to `supabase/tests/testHelpers.ts` (append, do not modify existing exports):

```ts
export async function createOrgWithOwnerClient(
  admin: SupabaseClient
): Promise<{ orgId: string; client: SupabaseClient }> {
  const email = `org-${randomUUID()}@example.com`;
  await createTestUser(admin, email, "test-password-123!");
  const client = await createUserClient(email, "test-password-123!");
  const { data: orgId, error } = await client.rpc("create_organization", {
    _name: `Test Org ${orgId}`,
    _slug: `test-org-${randomUUID()}`,
  });
  if (error || !orgId) {
    throw new Error(`Failed to create test org: ${error?.message}`);
  }
  return { orgId: orgId as string, client };
}
```

Add `import { randomUUID } from "node:crypto";` to the top of `testHelpers.ts` if not already
present (it is — `organizations.test.ts` imports it there already; `testHelpers.ts` itself does
not yet, so add it here).

Fix the self-referential `orgId` in the name template above before using it — the name doesn't
need to be unique, only the slug does, so use a fixed readable name:

```ts
export async function createOrgWithOwnerClient(
  admin: SupabaseClient
): Promise<{ orgId: string; client: SupabaseClient }> {
  const email = `org-${randomUUID()}@example.com`;
  await createTestUser(admin, email, "test-password-123!");
  const client = await createUserClient(email, "test-password-123!");
  const { data: orgId, error } = await client.rpc("create_organization", {
    _name: "Test Org",
    _slug: `test-org-${randomUUID()}`,
  });
  if (error || !orgId) {
    throw new Error(`Failed to create test org: ${error?.message}`);
  }
  return { orgId: orgId as string, client };
}
```

- [ ] **Step 2: Write the failing tests**

Create `supabase/tests/tenantIsolationLeadSourcesCompaniesContacts.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("lead_sources tenant isolation", () => {
  it("a member of org A cannot see or modify org B's lead_sources", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: sourceB, error: insertError } = await clientB
      .from("lead_sources")
      .insert({ name: "Org B Source", code: `org-b-${orgBId}`, organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA, error: readError } = await clientA
      .from("lead_sources")
      .select("id")
      .eq("id", sourceB!.id);
    expect(readError).toBeNull();
    expect(seenByA).toEqual([]);

    const { error: crossOrgInsertError } = await clientA
      .from("lead_sources")
      .insert({ name: "Forged", code: `forged-${orgBId}`, organization_id: orgBId });
    expect(crossOrgInsertError).not.toBeNull();
  });
});

describe("companies tenant isolation", () => {
  it("a member of org A cannot see or modify org B's companies", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: companyB, error: insertError } = await clientB
      .from("companies")
      .insert({ name: "Org B Co", organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("companies")
      .select("id")
      .eq("id", companyB!.id);
    expect(seenByA).toEqual([]);

    const { error: crossOrgInsertError } = await clientA
      .from("companies")
      .insert({ name: "Forged Co", organization_id: orgBId });
    expect(crossOrgInsertError).not.toBeNull();
  });
});

describe("contacts tenant isolation", () => {
  it("a contact inherits its company's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: companyA } = await clientA
      .from("companies")
      .insert({ name: "Org A Co", organization_id: orgAId })
      .select()
      .single();

    const { data: contactA, error: insertError } = await clientA
      .from("contacts")
      .insert({ company_id: companyA!.id, full_name: "Jane Doe" })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(contactA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB
      .from("contacts")
      .select("id")
      .eq("id", contactA!.id);
    expect(seenByB).toEqual([]);
  });

  it("rejects an explicit organization_id on contacts that mismatches its company's org", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId } = await createOrgWithOwnerClient(admin);

    const { data: companyA } = await clientA
      .from("companies")
      .insert({ name: "Org A Co 2", organization_id: orgAId })
      .select()
      .single();

    const { error } = await clientA
      .from("contacts")
      .insert({ company_id: companyA!.id, full_name: "Mismatch", organization_id: orgBId });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` column doesn't exist on any of these three tables yet.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260818140000_multi_tenancy_lead_sources_companies_contacts.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for lead_sources, companies, contacts.
-- Does not modify any existing table, function, or policy.

-- lead_sources (root)
ALTER TABLE public.lead_sources ADD COLUMN organization_id UUID;
UPDATE public.lead_sources SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.lead_sources ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_lead_sources_organization_id ON public.lead_sources (organization_id);

DROP POLICY "Admins manage lead_sources" ON public.lead_sources;
CREATE POLICY "Members manage lead_sources"
ON public.lead_sources
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- companies (root)
ALTER TABLE public.companies ADD COLUMN organization_id UUID;
UPDATE public.companies SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.companies ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.companies ADD CONSTRAINT companies_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_companies_organization_id ON public.companies (organization_id);

DROP POLICY "Admins manage companies" ON public.companies;
CREATE POLICY "Members manage companies"
ON public.companies
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- contacts (derived from companies)
ALTER TABLE public.contacts ADD COLUMN organization_id UUID;
UPDATE public.contacts SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_contacts_organization_id ON public.contacts (organization_id);

CREATE OR REPLACE FUNCTION public.set_contacts_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.companies WHERE id = NEW.company_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'company_id % has no organization_id or does not exist', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: contacts must match its company''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_contacts_organization_id
BEFORE INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_contacts_organization_id();

DROP POLICY "Admins manage contacts" ON public.contacts;
CREATE POLICY "Members manage contacts"
ON public.contacts
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 5: Apply the migration and run the tests**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 5 new ones in this file).

- [ ] **Step 6: Run the full existing test suites**

Run: `npm test`
Expected: PASS, unaffected (frontend/domain suite doesn't touch Supabase).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260818140000_multi_tenancy_lead_sources_companies_contacts.sql supabase/tests/testHelpers.ts supabase/tests/tenantIsolationLeadSourcesCompaniesContacts.test.ts
git commit -m "feat: tenant-isolate lead_sources, companies, contacts"
```

---

### Task 2: `strategies`, `strategy_versions` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140100_multi_tenancy_strategies.sql`
- Create: `supabase/tests/tenantIsolationStrategies.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/tenantIsolationStrategies.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("strategies tenant isolation", () => {
  it("a member of org A cannot see org B's strategies", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: strategyB, error: insertError } = await clientB
      .from("strategies")
      .insert({ name: "Org B Strategy", organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("strategies")
      .select("id")
      .eq("id", strategyB!.id);
    expect(seenByA).toEqual([]);
  });
});

describe("strategy_versions tenant isolation", () => {
  it("a version inherits its strategy's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: strategyA } = await clientA
      .from("strategies")
      .insert({ name: "Org A Strategy", organization_id: orgAId })
      .select()
      .single();

    const { data: versionA, error: insertError } = await clientA
      .from("strategy_versions")
      .insert({ strategy_id: strategyA!.id, version_number: 1, config: {} })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(versionA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB
      .from("strategy_versions")
      .select("id")
      .eq("id", versionA!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on `strategies`/`strategy_versions` yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140100_multi_tenancy_strategies.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for strategies, strategy_versions.

ALTER TABLE public.strategies ADD COLUMN organization_id UUID;
UPDATE public.strategies SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.strategies ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.strategies ADD CONSTRAINT strategies_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_strategies_organization_id ON public.strategies (organization_id);

DROP POLICY "Admins manage strategies" ON public.strategies;
CREATE POLICY "Members manage strategies"
ON public.strategies
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

ALTER TABLE public.strategy_versions ADD COLUMN organization_id UUID;
UPDATE public.strategy_versions SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.strategy_versions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.strategy_versions ADD CONSTRAINT strategy_versions_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_strategy_versions_organization_id ON public.strategy_versions (organization_id);

CREATE OR REPLACE FUNCTION public.set_strategy_versions_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.strategies WHERE id = NEW.strategy_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'strategy_id % has no organization_id or does not exist', NEW.strategy_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: strategy_versions must match its strategy''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_strategy_versions_organization_id
BEFORE INSERT ON public.strategy_versions
FOR EACH ROW
EXECUTE FUNCTION public.set_strategy_versions_organization_id();

DROP POLICY "Admins manage strategy_versions" ON public.strategy_versions;
CREATE POLICY "Members manage strategy_versions"
ON public.strategy_versions
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140100_multi_tenancy_strategies.sql supabase/tests/tenantIsolationStrategies.test.ts
git commit -m "feat: tenant-isolate strategies, strategy_versions"
```

---

### Task 3: `leads`, `research`, `lead_scores` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140200_multi_tenancy_leads_research_scores.sql`
- Create: `supabase/tests/tenantIsolationLeadsResearchScores.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/tenantIsolationLeadsResearchScores.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

async function seedCompany(client: SupabaseClient, orgId: string, name: string) {
  const { data } = await client
    .from("companies")
    .insert({ name, organization_id: orgId })
    .select()
    .single();
  return data!;
}

describe("leads tenant isolation", () => {
  it("a lead inherits its company's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const companyA = await seedCompany(clientA, orgAId, "Org A Co");

    const { data: leadA, error: insertError } = await clientA
      .from("leads")
      .insert({ company_id: companyA.id })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(leadA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB.from("leads").select("id").eq("id", leadA!.id);
    expect(seenByB).toEqual([]);
  });
});

describe("research tenant isolation (polymorphic)", () => {
  it("research on a company resolves organization_id from the company", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const companyA = await seedCompany(clientA, orgAId, "Org A Research Co");

    const { data: researchA, error: insertError } = await clientA
      .from("research")
      .insert({ subject_type: "company", subject_id: companyA.id, summary: "test" })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(researchA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB.from("research").select("id").eq("id", researchA!.id);
    expect(seenByB).toEqual([]);
  });

  it("research on a contact resolves organization_id from the contact", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const companyA = await seedCompany(clientA, orgAId, "Org A Contact Co");
    const { data: contactA } = await clientA
      .from("contacts")
      .insert({ company_id: companyA.id, full_name: "Jane" })
      .select()
      .single();

    const { data: researchA, error } = await clientA
      .from("research")
      .insert({ subject_type: "contact", subject_id: contactA!.id, summary: "test" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(researchA!.organization_id).toBe(orgAId);
  });
});

describe("lead_scores tenant isolation", () => {
  it("a score inherits its lead's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const companyA = await seedCompany(clientA, orgAId, "Org A Score Co");
    const { data: leadA } = await clientA
      .from("leads")
      .insert({ company_id: companyA.id })
      .select()
      .single();

    const { data: scoreA, error: insertError } = await clientA
      .from("lead_scores")
      .insert({ lead_id: leadA!.id, score: 80 })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(scoreA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB
      .from("lead_scores")
      .select("id")
      .eq("id", scoreA!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on any of these three tables yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140200_multi_tenancy_leads_research_scores.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for leads, research, lead_scores.

-- leads (derived from companies)
ALTER TABLE public.leads ADD COLUMN organization_id UUID;
UPDATE public.leads SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.leads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_leads_organization_id ON public.leads (organization_id);

CREATE OR REPLACE FUNCTION public.set_leads_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.companies WHERE id = NEW.company_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'company_id % has no organization_id or does not exist', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: leads must match its company''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_leads_organization_id
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.set_leads_organization_id();

DROP POLICY "Admins manage leads" ON public.leads;
CREATE POLICY "Members manage leads"
ON public.leads
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- research (polymorphic: company or contact)
ALTER TABLE public.research ADD COLUMN organization_id UUID;
UPDATE public.research SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.research ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.research ADD CONSTRAINT research_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_research_organization_id ON public.research (organization_id);

CREATE OR REPLACE FUNCTION public.set_research_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  IF NEW.subject_type = 'company' THEN
    SELECT organization_id INTO _parent_org_id FROM public.companies WHERE id = NEW.subject_id;
  ELSIF NEW.subject_type = 'contact' THEN
    SELECT organization_id INTO _parent_org_id FROM public.contacts WHERE id = NEW.subject_id;
  ELSE
    RAISE EXCEPTION 'unknown research.subject_type %', NEW.subject_type;
  END IF;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'subject_id % (subject_type %) has no organization_id or does not exist', NEW.subject_id, NEW.subject_type;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch for research';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_research_organization_id
BEFORE INSERT ON public.research
FOR EACH ROW
EXECUTE FUNCTION public.set_research_organization_id();

DROP POLICY "Admins manage research" ON public.research;
CREATE POLICY "Members manage research"
ON public.research
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- lead_scores (derived from leads)
ALTER TABLE public.lead_scores ADD COLUMN organization_id UUID;
UPDATE public.lead_scores SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.lead_scores ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.lead_scores ADD CONSTRAINT lead_scores_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_lead_scores_organization_id ON public.lead_scores (organization_id);

CREATE OR REPLACE FUNCTION public.set_lead_scores_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.leads WHERE id = NEW.lead_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_id % has no organization_id or does not exist', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: lead_scores must match its lead''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lead_scores_organization_id
BEFORE INSERT ON public.lead_scores
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_scores_organization_id();

DROP POLICY "Admins manage lead_scores" ON public.lead_scores;
CREATE POLICY "Members manage lead_scores"
ON public.lead_scores
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140200_multi_tenancy_leads_research_scores.sql supabase/tests/tenantIsolationLeadsResearchScores.test.ts
git commit -m "feat: tenant-isolate leads, research, lead_scores"
```

---

### Task 4: `campaigns`, `campaign_leads`, `outreach_messages`, `outreach_message_events` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140300_multi_tenancy_campaigns_outreach_messages.sql`
- Create: `supabase/tests/tenantIsolationCampaignsOutreachMessages.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1), `leads` tenant isolation (Task 3, for
  `campaign_leads`' two-parent check).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/tenantIsolationCampaignsOutreachMessages.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

async function seedLead(client: SupabaseClient, orgId: string) {
  const { data: company } = await client
    .from("companies")
    .insert({ name: "Co", organization_id: orgId })
    .select()
    .single();
  const { data: lead } = await client
    .from("leads")
    .insert({ company_id: company!.id })
    .select()
    .single();
  return lead!;
}

describe("campaigns tenant isolation", () => {
  it("a member of org A cannot see org B's campaigns", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: campaignB, error: insertError } = await clientB
      .from("campaigns")
      .insert({ name: "Org B Campaign", channel: "email", organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("campaigns")
      .select("id")
      .eq("id", campaignB!.id);
    expect(seenByA).toEqual([]);
  });
});

describe("campaign_leads tenant isolation (two-parent junction)", () => {
  it("inherits organization_id when campaign and lead agree", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "Campaign A", channel: "email", organization_id: orgAId })
      .select()
      .single();

    const { data: campaignLeadA, error } = await clientA
      .from("campaign_leads")
      .insert({ campaign_id: campaignA!.id, lead_id: leadA.id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(campaignLeadA!.organization_id).toBe(orgAId);
  });

  it("rejects a campaign_leads row whose campaign and lead belong to different orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);
    const { data: campaignB } = await clientB
      .from("campaigns")
      .insert({ name: "Campaign B", channel: "email", organization_id: orgBId })
      .select()
      .single();

    // clientA can't even see campaignB (RLS), so this insert fails at the FK/RLS layer
    // regardless — the important assertion is that it is rejected, not which layer catches it.
    const { error } = await clientA
      .from("campaign_leads")
      .insert({ campaign_id: campaignB!.id, lead_id: leadA.id });
    expect(error).not.toBeNull();
  });
});

describe("outreach_messages and outreach_message_events tenant isolation", () => {
  it("a message inherits its campaign_lead's organization_id, and its events inherit from it", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "Campaign A2", channel: "email", organization_id: orgAId })
      .select()
      .single();
    const { data: campaignLeadA } = await clientA
      .from("campaign_leads")
      .insert({ campaign_id: campaignA!.id, lead_id: leadA.id })
      .select()
      .single();

    const { data: messageA, error: messageError } = await clientA
      .from("outreach_messages")
      .insert({ campaign_lead_id: campaignLeadA!.id, channel: "email", body: "hi" })
      .select()
      .single();
    expect(messageError).toBeNull();
    expect(messageA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB
      .from("outreach_messages")
      .select("id")
      .eq("id", messageA!.id);
    expect(seenByB).toEqual([]);

    const { data: eventA, error: eventError } = await clientA
      .from("outreach_message_events")
      .insert({ message_id: messageA!.id, event_type: "sent" })
      .select()
      .single();
    expect(eventError).toBeNull();
    expect(eventA!.organization_id).toBe(orgAId);

    const { data: eventSeenByB } = await clientB
      .from("outreach_message_events")
      .select("id")
      .eq("id", eventA!.id);
    expect(eventSeenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on any of these four tables yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140300_multi_tenancy_campaigns_outreach_messages.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for campaigns, campaign_leads,
-- outreach_messages, outreach_message_events.

-- campaigns (root)
ALTER TABLE public.campaigns ADD COLUMN organization_id UUID;
UPDATE public.campaigns SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.campaigns ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_campaigns_organization_id ON public.campaigns (organization_id);

DROP POLICY "Admins manage campaigns" ON public.campaigns;
CREATE POLICY "Members manage campaigns"
ON public.campaigns
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- campaign_leads (derived from campaigns AND leads -- two parents must agree)
ALTER TABLE public.campaign_leads ADD COLUMN organization_id UUID;
UPDATE public.campaign_leads SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.campaign_leads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.campaign_leads ADD CONSTRAINT campaign_leads_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_campaign_leads_organization_id ON public.campaign_leads (organization_id);

CREATE OR REPLACE FUNCTION public.set_campaign_leads_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _campaign_org_id UUID;
  _lead_org_id UUID;
BEGIN
  SELECT organization_id INTO _campaign_org_id FROM public.campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id INTO _lead_org_id FROM public.leads WHERE id = NEW.lead_id;
  IF _campaign_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_id % has no organization_id or does not exist', NEW.campaign_id;
  END IF;
  IF _lead_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_id % has no organization_id or does not exist', NEW.lead_id;
  END IF;
  IF _campaign_org_id <> _lead_org_id THEN
    RAISE EXCEPTION 'campaign and lead belong to different organizations';
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _campaign_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch for campaign_leads';
  END IF;
  NEW.organization_id := _campaign_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_campaign_leads_organization_id
BEFORE INSERT ON public.campaign_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_campaign_leads_organization_id();

DROP POLICY "Admins manage campaign_leads" ON public.campaign_leads;
CREATE POLICY "Members manage campaign_leads"
ON public.campaign_leads
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- outreach_messages (derived from campaign_leads)
ALTER TABLE public.outreach_messages ADD COLUMN organization_id UUID;
UPDATE public.outreach_messages SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.outreach_messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.outreach_messages ADD CONSTRAINT outreach_messages_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_outreach_messages_organization_id ON public.outreach_messages (organization_id);

CREATE OR REPLACE FUNCTION public.set_outreach_messages_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.campaign_leads WHERE id = NEW.campaign_lead_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_lead_id % has no organization_id or does not exist', NEW.campaign_lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: outreach_messages must match its campaign_lead''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_outreach_messages_organization_id
BEFORE INSERT ON public.outreach_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_outreach_messages_organization_id();

DROP POLICY "Admins manage outreach_messages" ON public.outreach_messages;
CREATE POLICY "Members manage outreach_messages"
ON public.outreach_messages
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- outreach_message_events (derived from outreach_messages)
ALTER TABLE public.outreach_message_events ADD COLUMN organization_id UUID;
UPDATE public.outreach_message_events SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.outreach_message_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.outreach_message_events ADD CONSTRAINT outreach_message_events_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_outreach_message_events_organization_id ON public.outreach_message_events (organization_id);

CREATE OR REPLACE FUNCTION public.set_outreach_message_events_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.outreach_messages WHERE id = NEW.message_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'message_id % has no organization_id or does not exist', NEW.message_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: outreach_message_events must match its message''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_outreach_message_events_organization_id
BEFORE INSERT ON public.outreach_message_events
FOR EACH ROW
EXECUTE FUNCTION public.set_outreach_message_events_organization_id();

DROP POLICY "Admins manage outreach_message_events" ON public.outreach_message_events;
CREATE POLICY "Members manage outreach_message_events"
ON public.outreach_message_events
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140300_multi_tenancy_campaigns_outreach_messages.sql supabase/tests/tenantIsolationCampaignsOutreachMessages.test.ts
git commit -m "feat: tenant-isolate campaigns, campaign_leads, outreach_messages, outreach_message_events"
```

---

### Task 5: `replies`, `meetings` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140400_multi_tenancy_replies_meetings.sql`
- Create: `supabase/tests/tenantIsolationRepliesMeetings.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1), `leads` tenant isolation (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/tenantIsolationRepliesMeetings.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

async function seedLead(client: SupabaseClient, orgId: string) {
  const { data: company } = await client
    .from("companies")
    .insert({ name: "Co", organization_id: orgId })
    .select()
    .single();
  const { data: lead } = await client
    .from("leads")
    .insert({ company_id: company!.id })
    .select()
    .single();
  return lead!;
}

describe("replies tenant isolation", () => {
  it("a reply inherits its lead's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);

    const { data: replyA, error: insertError } = await clientA
      .from("replies")
      .insert({ lead_id: leadA.id, raw_content: "Sounds good" })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(replyA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB.from("replies").select("id").eq("id", replyA!.id);
    expect(seenByB).toEqual([]);
  });
});

describe("meetings tenant isolation", () => {
  it("a meeting inherits its lead's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);

    const { data: meetingA, error: insertError } = await clientA
      .from("meetings")
      .insert({ lead_id: leadA.id })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(meetingA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB.from("meetings").select("id").eq("id", meetingA!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on `replies`/`meetings` yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140400_multi_tenancy_replies_meetings.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for replies, meetings.
-- Both derive from leads.lead_id, not the optional contact_id, per the design spec.

ALTER TABLE public.replies ADD COLUMN organization_id UUID;
UPDATE public.replies SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.replies ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.replies ADD CONSTRAINT replies_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_replies_organization_id ON public.replies (organization_id);

CREATE OR REPLACE FUNCTION public.set_replies_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.leads WHERE id = NEW.lead_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_id % has no organization_id or does not exist', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: replies must match its lead''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_replies_organization_id
BEFORE INSERT ON public.replies
FOR EACH ROW
EXECUTE FUNCTION public.set_replies_organization_id();

DROP POLICY "Admins manage replies" ON public.replies;
CREATE POLICY "Members manage replies"
ON public.replies
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

ALTER TABLE public.meetings ADD COLUMN organization_id UUID;
UPDATE public.meetings SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.meetings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_meetings_organization_id ON public.meetings (organization_id);

CREATE OR REPLACE FUNCTION public.set_meetings_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.leads WHERE id = NEW.lead_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_id % has no organization_id or does not exist', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: meetings must match its lead''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_meetings_organization_id
BEFORE INSERT ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.set_meetings_organization_id();

DROP POLICY "Admins manage meetings" ON public.meetings;
CREATE POLICY "Members manage meetings"
ON public.meetings
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140400_multi_tenancy_replies_meetings.sql supabase/tests/tenantIsolationRepliesMeetings.test.ts
git commit -m "feat: tenant-isolate replies, meetings"
```

---

### Task 6: `agent_tasks`, `agent_runs` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140500_multi_tenancy_agent_tasks_runs.sql`
- Create: `supabase/tests/tenantIsolationAgentTasksRuns.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/tenantIsolationAgentTasksRuns.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("agent_tasks tenant isolation", () => {
  it("a member of org A cannot see org B's agent_tasks", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: taskB, error: insertError } = await clientB
      .from("agent_tasks")
      .insert({ task_type: "research", organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("agent_tasks")
      .select("id")
      .eq("id", taskB!.id);
    expect(seenByA).toEqual([]);
  });
});

describe("agent_runs tenant isolation", () => {
  it("a run inherits its task's organization_id and is isolated from other orgs", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: taskA } = await clientA
      .from("agent_tasks")
      .insert({ task_type: "research", organization_id: orgAId })
      .select()
      .single();

    const { data: runA, error: insertError } = await clientA
      .from("agent_runs")
      .insert({ task_id: taskA!.id, status: "running" })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(runA!.organization_id).toBe(orgAId);

    const { data: seenByB } = await clientB.from("agent_runs").select("id").eq("id", runA!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on `agent_tasks`/`agent_runs` yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140500_multi_tenancy_agent_tasks_runs.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for agent_tasks, agent_runs.

ALTER TABLE public.agent_tasks ADD COLUMN organization_id UUID;
UPDATE public.agent_tasks SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.agent_tasks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.agent_tasks ADD CONSTRAINT agent_tasks_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_agent_tasks_organization_id ON public.agent_tasks (organization_id);

DROP POLICY "Admins manage agent_tasks" ON public.agent_tasks;
CREATE POLICY "Members manage agent_tasks"
ON public.agent_tasks
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

ALTER TABLE public.agent_runs ADD COLUMN organization_id UUID;
UPDATE public.agent_runs SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.agent_runs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_agent_runs_organization_id ON public.agent_runs (organization_id);

CREATE OR REPLACE FUNCTION public.set_agent_runs_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.agent_tasks WHERE id = NEW.task_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'task_id % has no organization_id or does not exist', NEW.task_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: agent_runs must match its task''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_agent_runs_organization_id
BEFORE INSERT ON public.agent_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_agent_runs_organization_id();

DROP POLICY "Admins manage agent_runs" ON public.agent_runs;
CREATE POLICY "Members manage agent_runs"
ON public.agent_runs
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140500_multi_tenancy_agent_tasks_runs.sql supabase/tests/tenantIsolationAgentTasksRuns.test.ts
git commit -m "feat: tenant-isolate agent_tasks, agent_runs"
```

---

### Task 7: `analytics_events` tenant isolation

**Files:**
- Create: `supabase/migrations/20260818140600_multi_tenancy_analytics_events.sql`
- Create: `supabase/tests/tenantIsolationAnalyticsEvents.test.ts`

**Interfaces:**
- Consumes: `createOrgWithOwnerClient` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/tenantIsolationAnalyticsEvents.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("analytics_events tenant isolation", () => {
  it("a member of org A cannot see org B's analytics_events", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: eventB, error: insertError } = await clientB
      .from("analytics_events")
      .insert({ event_type: "test_event", organization_id: orgBId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("analytics_events")
      .select("id")
      .eq("id", eventB!.id);
    expect(seenByA).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:supabase`
Expected: FAIL — `organization_id` doesn't exist on `analytics_events` yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818140600_multi_tenancy_analytics_events.sql`:

```sql
-- Multi-tenancy Subsystem 2: organization_id + RLS for analytics_events.

ALTER TABLE public.analytics_events ADD COLUMN organization_id UUID;
UPDATE public.analytics_events SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'default');
ALTER TABLE public.analytics_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
CREATE INDEX idx_analytics_events_organization_id ON public.analytics_events (organization_id);

DROP POLICY "Admins manage analytics_events" ON public.analytics_events;
CREATE POLICY "Members manage analytics_events"
ON public.analytics_events
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (all tests, including the 1 new one). This completes Subsystem 2 — all 17
tables now have `organization_id`, propagation triggers where derived, and org-scoped RLS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818140600_multi_tenancy_analytics_events.sql supabase/tests/tenantIsolationAnalyticsEvents.test.ts
git commit -m "feat: tenant-isolate analytics_events"
```

---

### Task 8: Research worker tenant-aware changes (Subsystem 3)

**Files:**
- Modify: `worker/src/test/schema.sql`
- Modify: `worker/src/tasks/processResearchTask.ts`
- Modify: `worker/src/tasks/processResearchTask.test.ts`

**Interfaces:**
- Consumes: `organization_id` now `NOT NULL` on `companies`, `leads`, `agent_tasks`, `research`,
  `agent_runs` (Tasks 1, 3, 6 above).
- Produces: `processResearchTask` now reads and threads `organization_id` explicitly through
  its `research` insert (in addition to the trigger validating it — the design spec calls this
  out as worth the extra clarity on the one polymorphic table the worker writes to).

- [ ] **Step 1: Update the worker's test schema**

`worker/src/test/schema.sql` is a hand-maintained subset of the real migrations. Add
`organization_id UUID NOT NULL,` as the second column (right after `id`) in each of its five
`CREATE TABLE IF NOT EXISTS` statements — no `organizations` table needed here, a bare
`UUID NOT NULL` with no FK, matching this file's existing documented trade-off of being
auth-free and FK-light. Replace the file's full contents with:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size_range TEXT,
  country TEXT,
  website TEXT,
  linkedin_url TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID,
  source_id UUID,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','researching','qualified','disqualified','approved_for_outreach',
    'contacted','replied','meeting_booked','proposal','won','lost'
  )),
  current_score NUMERIC,
  current_strategy_version_id UUID,
  disqualified_reason TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('company', 'contact')),
  subject_id UUID NOT NULL,
  summary TEXT,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  created_by TEXT NOT NULL DEFAULT 'manual' CHECK (created_by IN ('agent', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'strategy','lead_finder','research','qualification','outreach',
    'reply','booking','notification','analytics'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','claimed','in_progress','succeeded','failed','cancelled'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  subject_type TEXT,
  subject_id UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('mock', 'claude')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  output JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Update the test fixtures and write the failing test**

In `worker/src/tasks/processResearchTask.test.ts`, add a module-level constant near the top
(after the existing imports):

```ts
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
```

Update `seedCompanyAndLead` to include it in both inserts:

```ts
async function seedCompanyAndLead(leadStatus = "new") {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (organization_id, name, domain, industry, description) VALUES ($1, 'Acme', 'acme.com', 'Software', 'A SaaS company') RETURNING id",
    [TEST_ORG_ID]
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (organization_id, company_id, status) VALUES ($1, $2, $3) RETURNING id",
    [TEST_ORG_ID, company.rows[0].id, leadStatus]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}
```

Update `seedAndClaimTask` and both other bare `agent_tasks` inserts (in the "no lead_id",
"not a valid UUID", and "max_attempts reached" failure-path tests) to include
`organization_id`:

```ts
async function seedAndClaimTask(leadId: string) {
  await pool.query(
    "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'research', 'pending', $2)",
    [TEST_ORG_ID, JSON.stringify({ lead_id: leadId })]
  );
  const [task] = await claimResearchTasks(pool, "worker-1", 1);
  return task;
}
```

```ts
await pool.query(
  "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'research', 'pending', '{}')",
  [TEST_ORG_ID]
);
```

```ts
await pool.query(
  "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'research', 'pending', $2)",
  [TEST_ORG_ID, JSON.stringify({ lead_id: "not-a-uuid" })]
);
```

```ts
await pool.query(
  "INSERT INTO agent_tasks (organization_id, task_type, status, payload, attempts, max_attempts) VALUES ($1, 'research', 'pending', '{}', 2, 3)",
  [TEST_ORG_ID]
);
```

Add one new test to the `"processResearchTask — success path"` describe block:

```ts
  it("threads organization_id from the company into the research and agent_runs rows", async () => {
    const { companyId, leadId } = await seedCompanyAndLead();
    const task = await seedAndClaimTask(leadId);

    await processResearchTask(pool, mockAi, "mock", task);

    const research = await pool.query("SELECT organization_id FROM research WHERE subject_id = $1", [companyId]);
    expect(research.rows[0].organization_id).toBe(TEST_ORG_ID);

    const runs = await pool.query("SELECT organization_id FROM agent_runs WHERE task_id = $1", [task.id]);
    expect(runs.rows[0].organization_id).toBe(TEST_ORG_ID);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `worker/`): `npm test -- processResearchTask`
Expected: FAIL — `organization_id` isn't selected in the lead→company query or inserted into
`research`/`agent_runs` yet, so the new test's assertions fail (the other tests should pass once
the fixtures compile against the new schema, since `organization_id` is already being inserted
by the fixtures themselves at this point — only the new test is expected red).

- [ ] **Step 4: Implement**

In `worker/src/tasks/processResearchTask.ts`, update the `LeadCompanyRow` interface to add the
new field:

```ts
interface LeadCompanyRow {
  lead_id: string;
  company_id: string;
  company_organization_id: string;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_description: string | null;
}
```

Update the `SELECT` query to include it:

```ts
  const { rows } = await pool.query<LeadCompanyRow>(
    `SELECT l.id AS lead_id,
            c.id AS company_id, c.organization_id AS company_organization_id,
            c.name AS company_name, c.domain AS company_domain,
            c.industry AS company_industry, c.description AS company_description
     FROM leads l JOIN companies c ON c.id = l.company_id
     WHERE l.id = $1`,
    [leadId]
  );
```

Update the `research` `INSERT` to add `organization_id` as the first column/value:

```ts
      await client.query(
        `INSERT INTO research (organization_id, subject_type, subject_id, summary, findings, confidence, source, created_by)
         VALUES ($1, 'company', $2, $3, $4, $5, $6, 'agent')`,
        [
          row.company_organization_id,
          row.company_id,
          output.aiSummary,
          JSON.stringify({
            technology: output.technology,
            revenueEstimate: output.revenueEstimate,
            employees: output.employees,
            growth: output.growth,
            hiring: output.hiring,
            funding: output.funding,
            painPoints: output.painPoints,
            buyingSignals: output.buyingSignals,
          }),
          output.confidence,
          providerName,
        ]
      );
```

Update the success-path `agent_runs` `INSERT` to add `organization_id`:

```ts
      await client.query(
        `INSERT INTO agent_runs (organization_id, task_id, status, provider, started_at, finished_at, output, duration_ms)
         VALUES ($1, $2, 'succeeded', $3, $4, $5, $6, $7)`,
        [
          row.company_organization_id,
          task.id,
          providerName,
          startedAt,
          finishedAt,
          JSON.stringify(output),
          finishedAt.getTime() - startedAt.getTime(),
        ]
      );
```

The failure-path `agent_runs` `INSERT` (in the `catch` block) stays as-is — it's reached when
the lead→company lookup may not have happened yet (e.g. a missing `lead_id`), so there is no
`row.company_organization_id` reliably available at that point; leaving it unchanged is correct,
not an oversight (`agent_runs.organization_id` in that path is backfilled by that row's own
`set_agent_runs_organization_id` trigger, which derives it from `task_id` → `agent_tasks` —
already `NOT NULL` there — regardless of whether this INSERT names the column explicitly).

- [ ] **Step 5: Run the test to verify it passes**

Run (from `worker/`): `npm test -- processResearchTask`
Expected: PASS.

- [ ] **Step 6: Fix `claimResearchTasks.test.ts`'s fixtures for the same schema change**

This file (untouched by Steps 1-5) has its own `seedCompanyAndLead`/`seedResearchTask` helpers
that also insert into `companies`/`leads`/`agent_tasks` without `organization_id` — they will
now fail their `NOT NULL` constraint. In `worker/src/tasks/claimResearchTasks.test.ts`, add the
same constant used in Step 2 and update both helpers:

```ts
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

async function seedCompanyAndLead() {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme') RETURNING id",
    [TEST_ORG_ID]
  );
  const lead = await pool.query<{ id: string }>(
    "INSERT INTO leads (organization_id, company_id) VALUES ($1, $2) RETURNING id",
    [TEST_ORG_ID, company.rows[0].id]
  );
  return { companyId: company.rows[0].id, leadId: lead.rows[0].id };
}

async function seedResearchTask(leadId: string, overrides: Partial<{ status: string; taskType: string; priority: number }> = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO agent_tasks (organization_id, task_type, status, payload, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      TEST_ORG_ID,
      overrides.taskType ?? "research",
      overrides.status ?? "pending",
      JSON.stringify({ lead_id: leadId }),
      overrides.priority ?? 0,
    ]
  );
  return rows[0].id;
}
```

No test assertions in this file change — only the two fixture helpers.

- [ ] **Step 7: Run the full worker suite**

Run (from `worker/`): `npm test`
Expected: PASS — both `processResearchTask.test.ts` and `claimResearchTasks.test.ts` green,
along with every other worker test file (none of the others touch real Postgres fixtures per
the AI provider tests being pure unit tests against mocked/injected clients, not this shared
schema).

- [ ] **Step 8: Commit**

```bash
git add worker/src/test/schema.sql worker/src/tasks/processResearchTask.ts worker/src/tasks/processResearchTask.test.ts worker/src/tasks/claimResearchTasks.test.ts
git commit -m "feat(worker): thread organization_id through research task processing"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run the complete test suite from a clean database**

```bash
npx supabase db reset
npm run test:supabase
npm test
cd worker && npm test
```

Expected: `test:supabase` PASSES (all tests across every file in `supabase/tests/`); root
`npm test` PASSES (frontend/domain suite, unaffected); `worker` suite PASSES (needs
`TEST_DATABASE_URL` set to a real local Postgres per the worker's existing convention).

- [ ] **Step 2: Report status**

Confirm to the user: Subsystems 2 and 3 are complete — all 17 B2B Growth Engine tables now
carry `organization_id`, enforced by propagation triggers (derived tables) or application code
(root tables), with org-scoped RLS replacing the old global-admin policy everywhere, verified by
a comprehensive cross-tenant RLS test suite against a real local Supabase stack. The research
worker threads `organization_id` explicitly through its one polymorphic write. Per the user's
explicit requirement, this should be reviewed now, before Subsystem 4 (invitations — deferred
per the earlier scope decision) or the Omnichannel Outreach Engine's own schema work begins.
