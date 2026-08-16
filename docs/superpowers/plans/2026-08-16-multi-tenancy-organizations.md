# Multi-Tenancy Subsystem 1: Organizations, Memberships, Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tenant/membership core of the multi-tenancy system — `organizations` and
`memberships` tables, role-checking helper functions, RLS policies enforcing owner/admin/member
permissions, and the Tenant #1 backfill that makes the existing single admin account the owner
of a default organization — as a fully tested, independently reviewable first subsystem.

**Architecture:** Supabase Postgres migrations (matching this repo's existing `supabase/migrations/`
conventions) plus a new lightweight RLS integration test harness (`supabase/tests/`, using the
already-installed `@supabase/supabase-js` + `vitest` against a real local Supabase CLI stack —
not a plain Postgres container, since testing RLS requires real `auth.uid()` behavior).

**Reference spec:** `docs/superpowers/specs/2026-08-16-multi-tenancy-design.md` (Subsystem 1 of 4
per its Implementation Sequencing section — this plan does NOT touch the 17 B2B Growth Engine
tables, the research worker, or invitations; those are separate later plans).

## Global Constraints

- Migration file naming/style matches the existing convention exactly (see
  `supabase/migrations/20260813*.sql`): `id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`,
  `created_at`/`updated_at` as `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`, reuse the
  existing `public.update_updated_at_column()` trigger function (never redefine it), `TEXT ...
  CHECK (col IN (...))` instead of native enums, RLS via `SECURITY DEFINER` helper functions
  mirroring the existing `public.is_admin(auth.uid())` pattern. Never modify an existing
  migration file, table, function, or RLS policy.
- **Testing approach (reasoned decision for this plan):** this repo has no SQL/RLS test harness
  on `main` yet. Rather than defer all verification to Subsystem 2 (which per the design spec
  builds the full cross-tenant suite covering all 17 B2B tables), this plan introduces the
  Supabase-CLI-based test harness now, scoped to `organizations`/`memberships` only. Subsystem 2
  extends the same harness — it is not rebuilt. This is necessary because RLS logic this
  consequential (who can create orgs, who can promote/demote roles, owner-lockout prevention)
  cannot be called "reviewed and production-ready" without being exercised against real
  `auth.uid()` behavior, which a plain Postgres container cannot provide.
- Test harness lives at `supabase/tests/*.test.ts`, run via `npm run test:supabase` (a **separate**
  script/vitest config from the existing `npm test`, which stays scoped to `src/**/*.test.ts` and
  must keep working without Docker/Supabase CLI running — these are two independent test suites).
- All new SQL objects are `SECURITY DEFINER` where they need to read/write across RLS boundaries
  (matching `public.is_admin`'s existing pattern), and are owned by the migration's executing role
  by default — no explicit `OWNER TO` needed, consistent with every existing migration.
- Local dev parity: after this plan, a fresh local Supabase instance (via `supabase db reset`)
  ends up with exactly one organization and, if any `profiles` row has `is_admin = true`, exactly
  one membership per such row with `role = 'owner'` — no separate dev-only code path.

## File Structure

```
supabase/
  migrations/
    20260816150000_multi_tenancy_organizations_memberships.sql   # Task 2
    20260816150100_multi_tenancy_tenant_one_backfill.sql          # Task 3
  tests/
    testHelpers.ts             # Task 1 — shared: local Supabase status lookup, admin client, test-user factory
    smoke.test.ts               # Task 1 — proves the harness works end to end
    organizations.test.ts       # Task 2 — org creation, RLS on organizations
    memberships.test.ts         # Task 2 — membership RLS incl. owner-lockout prevention
    tenantOneBackfill.test.ts   # Task 3
package.json                    # Task 1 — new devDependency + scripts (root, not a new package)
vitest.supabase.config.ts       # Task 1
```

---

### Task 1: Supabase CLI local stack + test harness scaffold

**Files:**
- Modify: `package.json` (root)
- Create: `vitest.supabase.config.ts`
- Create: `supabase/tests/testHelpers.ts`
- Create: `supabase/tests/smoke.test.ts`

**Interfaces:**
- Produces: `getSupabaseStatus(): SupabaseStatus` (`{ apiUrl: string; serviceRoleKey: string; anonKey: string }`), `createAdminClient(): SupabaseClient`, `createUserClient(email: string, password: string): Promise<SupabaseClient>` (signs in and returns an authenticated client), `createTestUser(admin: SupabaseClient, email: string, password: string): Promise<{ id: string }>`. Consumed by every later task's tests.

- [ ] **Step 1: Add the Supabase CLI as a dev dependency**

In `package.json`, add to `"devDependencies"`:
```json
    "supabase": "^1.226.4"
```

Run: `npm install`
Expected: installs cleanly, adds `supabase` to `package-lock.json`.

- [ ] **Step 2: Start the local Supabase stack and confirm it's healthy**

Run: `npx supabase start`
Expected: downloads Docker images on first run (may take several minutes), then prints a table
of local URLs and keys (API URL, DB URL, anon key, service_role key, Studio URL). This applies
every existing migration in `supabase/migrations/` to a fresh local Postgres instance —
confirms the whole existing migration history is internally consistent before we add to it.

If it's already running from a previous session, `npx supabase status` prints the same info
without restarting anything.

- [ ] **Step 3: Write `testHelpers.ts`**

Create `supabase/tests/testHelpers.ts`:

```ts
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface SupabaseStatus {
  apiUrl: string;
  serviceRoleKey: string;
  anonKey: string;
}

let cachedStatus: SupabaseStatus | null = null;

export function getSupabaseStatus(): SupabaseStatus {
  if (cachedStatus) return cachedStatus;

  const raw = execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(raw) as {
    API_URL: string;
    SERVICE_ROLE_KEY: string;
    ANON_KEY: string;
  };

  if (!parsed.API_URL || !parsed.SERVICE_ROLE_KEY || !parsed.ANON_KEY) {
    throw new Error(
      "`supabase status -o json` did not return API_URL/SERVICE_ROLE_KEY/ANON_KEY — " +
        "is the local Supabase stack running? Run `npx supabase start` first."
    );
  }

  cachedStatus = {
    apiUrl: parsed.API_URL,
    serviceRoleKey: parsed.SERVICE_ROLE_KEY,
    anonKey: parsed.ANON_KEY,
  };
  return cachedStatus;
}

export function createAdminClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = getSupabaseStatus();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(
  admin: SupabaseClient,
  email: string,
  password: string
): Promise<{ id: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  return { id: data.user.id };
}

export async function createUserClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const { apiUrl, anonKey } = getSupabaseStatus();
  const client = createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }
  return client;
}
```

- [ ] **Step 4: Write the smoke test**

Create `supabase/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAdminClient } from "./testHelpers.js";

describe("supabase test harness smoke test", () => {
  it("connects to the local stack and can query an existing table", async () => {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 5: Add the vitest config and npm script**

Create `vitest.supabase.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
```

In `package.json`, add to `"scripts"`:
```json
    "test:supabase": "vitest run --config vitest.supabase.config.ts"
```

- [ ] **Step 6: Run the smoke test to verify the harness works**

Run: `npm run test:supabase`
Expected: PASS (1 test). If it fails with a connection error, run `npx supabase start` first
(Step 2) and retry.

- [ ] **Step 7: Confirm the existing frontend test suite is unaffected**

Run: `npm test`
Expected: PASS, same as before this task — confirms `vitest.config.ts`'s `include` pattern
(`src/**/*.test.ts`) was untouched and the two suites are fully independent.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.supabase.config.ts supabase/tests/testHelpers.ts supabase/tests/smoke.test.ts
git commit -m "chore: add Supabase CLI local stack and RLS test harness scaffold"
```

---

### Task 2: Organizations, memberships, roles, and RLS

**Files:**
- Create: `supabase/migrations/20260816150000_multi_tenancy_organizations_memberships.sql`
- Create: `supabase/tests/organizations.test.ts`
- Create: `supabase/tests/memberships.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `createTestUser`, `createUserClient` (Task 1).
- Produces (SQL, consumed by Subsystems 2-4 and their tests): `public.organizations` table,
  `public.memberships` table, `public.is_org_member(_user_id uuid, _org_id uuid) boolean`,
  `public.org_role(_user_id uuid, _org_id uuid) text`, `public.is_org_admin(_user_id uuid,
  _org_id uuid) boolean`, `public.is_org_owner(_user_id uuid, _org_id uuid) boolean`,
  `public.create_organization(_name text, _slug text) uuid` (RPC-callable — creates the org row
  and the caller's `owner` membership atomically, bypassing the direct-INSERT RLS bootstrap
  problem: a brand-new org has no members yet, so no one could otherwise pass the membership
  INSERT policy's "must already be an org admin" check).

- [ ] **Step 1: Write the failing tests for organization creation and RLS**

Create `supabase/tests/organizations.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser, createUserClient } from "./testHelpers.js";

const PASSWORD = "test-password-123!";
let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("create_organization", () => {
  it("creates an organization and makes the caller its owner", async () => {
    const email = `org-owner-${randomUUID()}@example.com`;
    await createTestUser(admin, email, PASSWORD);
    const userClient = await createUserClient(email, PASSWORD);

    const { data: orgId, error } = await userClient.rpc("create_organization", {
      _name: "Acme Inc",
      _slug: `acme-${randomUUID()}`,
    });
    expect(error).toBeNull();
    expect(typeof orgId).toBe("string");

    const { data: org, error: readError } = await userClient
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .single();
    expect(readError).toBeNull();
    expect(org?.name).toBe("Acme Inc");

    const { data: membership, error: memberError } = await userClient
      .from("memberships")
      .select("role")
      .eq("organization_id", orgId)
      .single();
    expect(memberError).toBeNull();
    expect(membership?.role).toBe("owner");
  });
});

describe("organizations RLS", () => {
  it("a member of org A cannot see org B's row", async () => {
    const emailA = `org-a-${randomUUID()}@example.com`;
    const emailB = `org-b-${randomUUID()}@example.com`;
    await createTestUser(admin, emailA, PASSWORD);
    await createTestUser(admin, emailB, PASSWORD);
    const clientA = await createUserClient(emailA, PASSWORD);
    const clientB = await createUserClient(emailB, PASSWORD);

    const { data: orgBId } = await clientB.rpc("create_organization", {
      _name: "Org B",
      _slug: `org-b-${randomUUID()}`,
    });

    const { data, error } = await clientA
      .from("organizations")
      .select("id")
      .eq("id", orgBId as string);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("only an owner can rename their organization", async () => {
    const ownerEmail = `owner-${randomUUID()}@example.com`;
    await createTestUser(admin, ownerEmail, PASSWORD);
    const ownerClient = await createUserClient(ownerEmail, PASSWORD);
    const { data: orgId } = await ownerClient.rpc("create_organization", {
      _name: "Rename Me",
      _slug: `rename-${randomUUID()}`,
    });

    const { error } = await ownerClient
      .from("organizations")
      .update({ name: "Renamed" })
      .eq("id", orgId as string);
    expect(error).toBeNull();

    const { data: org } = await ownerClient
      .from("organizations")
      .select("name")
      .eq("id", orgId as string)
      .single();
    expect(org?.name).toBe("Renamed");
  });
});
```

Create `supabase/tests/memberships.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createTestUser, createUserClient } from "./testHelpers.js";

const PASSWORD = "test-password-123!";
let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

async function createOrgWithOwner(): Promise<{
  orgId: string;
  ownerClient: SupabaseClient;
  ownerId: string;
}> {
  const email = `owner-${randomUUID()}@example.com`;
  const { id: ownerId } = await createTestUser(admin, email, PASSWORD);
  const ownerClient = await createUserClient(email, PASSWORD);
  const { data: orgId } = await ownerClient.rpc("create_organization", {
    _name: "Test Org",
    _slug: `test-org-${randomUUID()}`,
  });
  return { orgId: orgId as string, ownerClient, ownerId };
}

describe("memberships RLS", () => {
  it("an owner can add a member with role 'member' or 'admin', and even a co-owner", async () => {
    const { orgId, ownerClient } = await createOrgWithOwner();
    const memberEmail = `member-${randomUUID()}@example.com`;
    const { id: memberId } = await createTestUser(admin, memberEmail, PASSWORD);

    const { error: memberInsertError } = await ownerClient
      .from("memberships")
      .insert({ user_id: memberId, organization_id: orgId, role: "member" });
    expect(memberInsertError).toBeNull();

    // An existing owner is allowed to promote someone else to co-owner too — the
    // restriction is "only an owner may create an owner", not "there can only ever
    // be one owner". A plain admin is what the next test proves CANNOT do this.
    const coOwnerEmail = `co-owner-${randomUUID()}@example.com`;
    const { id: coOwnerId } = await createTestUser(admin, coOwnerEmail, PASSWORD);
    const { error: coOwnerInsertError } = await ownerClient
      .from("memberships")
      .insert({ user_id: coOwnerId, organization_id: orgId, role: "owner" });
    expect(coOwnerInsertError).toBeNull();
  });

  it("a plain admin (not owner) cannot add someone as an owner", async () => {
    const { orgId, ownerClient } = await createOrgWithOwner();
    const adminEmail = `admin-${randomUUID()}@example.com`;
    const { id: adminId } = await createTestUser(admin, adminEmail, PASSWORD);
    await ownerClient
      .from("memberships")
      .insert({ user_id: adminId, organization_id: orgId, role: "admin" });
    const adminClient = await createUserClient(adminEmail, PASSWORD);

    const wannabeOwnerEmail = `wannabe-owner-${randomUUID()}@example.com`;
    const { id: wannabeOwnerId } = await createTestUser(admin, wannabeOwnerEmail, PASSWORD);
    const { error, data } = await adminClient
      .from("memberships")
      .insert({ user_id: wannabeOwnerId, organization_id: orgId, role: "owner" })
      .select();
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("a member of org A cannot see org B's memberships", async () => {
    const { ownerClient: ownerA } = await createOrgWithOwner();
    const { orgId: orgBId } = await createOrgWithOwner();

    const { data, error } = await ownerA
      .from("memberships")
      .select("id")
      .eq("organization_id", orgBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a plain admin cannot demote or remove an owner", async () => {
    const { orgId, ownerClient, ownerId } = await createOrgWithOwner();
    const adminEmail = `admin-${randomUUID()}@example.com`;
    const { id: adminId } = await createTestUser(admin, adminEmail, PASSWORD);
    await ownerClient
      .from("memberships")
      .insert({ user_id: adminId, organization_id: orgId, role: "admin" });
    const adminClient = await createUserClient(adminEmail, PASSWORD);

    const { data: ownerMembership } = await ownerClient
      .from("memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", ownerId)
      .single();

    const { error: updateError, data: updateData } = await adminClient
      .from("memberships")
      .update({ role: "member" })
      .eq("id", ownerMembership!.id)
      .select();
    expect(updateError).toBeNull();
    expect(updateData).toEqual([]);

    const { error: deleteError, data: deleteData } = await adminClient
      .from("memberships")
      .delete()
      .eq("id", ownerMembership!.id)
      .select();
    expect(deleteError).toBeNull();
    expect(deleteData).toEqual([]);

    const { data: stillThere } = await ownerClient
      .from("memberships")
      .select("role")
      .eq("id", ownerMembership!.id)
      .single();
    expect(stillThere?.role).toBe("owner");
  });

  it("a member (not admin/owner) cannot add or remove other members", async () => {
    const { orgId, ownerClient } = await createOrgWithOwner();
    const memberEmail = `plain-member-${randomUUID()}@example.com`;
    const { id: memberId } = await createTestUser(admin, memberEmail, PASSWORD);
    await ownerClient
      .from("memberships")
      .insert({ user_id: memberId, organization_id: orgId, role: "member" });
    const memberClient = await createUserClient(memberEmail, PASSWORD);

    const otherEmail = `other-${randomUUID()}@example.com`;
    const { id: otherId } = await createTestUser(admin, otherEmail, PASSWORD);
    const { error, data } = await memberClient
      .from("memberships")
      .insert({ user_id: otherId, organization_id: orgId, role: "member" })
      .select();
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `create_organization` RPC / `organizations` / `memberships` don't exist yet
(errors like `relation "organizations" does not exist` or `Could not find the function`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816150000_multi_tenancy_organizations_memberships.sql`:

```sql
-- Multi-tenancy: organizations, memberships, role helper functions.
-- Foundational tenant boundary for the B2B Growth Engine. Does not modify any existing
-- table, function, or policy. Organization = workspace (single-level tenant boundary).

CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_org_unique UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_memberships_organization_id ON public.memberships (organization_id);
CREATE INDEX idx_memberships_user_id ON public.memberships (user_id);

CREATE TRIGGER update_memberships_updated_at
BEFORE UPDATE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Role helper functions, mirroring the existing public.is_admin(auth.uid()) pattern.

CREATE OR REPLACE FUNCTION public.org_role(_user_id UUID, _org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.memberships
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.org_role(_user_id, _org_id) IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.org_role(_user_id, _org_id) = 'owner';
$$;

-- Bootstraps a new organization: creates the row and the caller's owner membership
-- atomically. Direct INSERT into organizations/memberships is not exposed to regular
-- users (no INSERT policy on organizations; memberships' INSERT policy requires the
-- caller to already be an org admin, which is impossible for a brand-new org) — this
-- function is the only path to creating an organization, and it runs as SECURITY
-- DEFINER specifically to cross that bootstrap gap safely.
CREATE OR REPLACE FUNCTION public.create_organization(_name TEXT, _slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_organization requires an authenticated user';
  END IF;

  INSERT INTO public.organizations (name, slug) VALUES (_name, _slug)
  RETURNING id INTO _org_id;

  INSERT INTO public.memberships (user_id, organization_id, role)
  VALUES (auth.uid(), _org_id, 'owner');

  RETURN _org_id;
END;
$$;

-- RLS: organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organization"
ON public.organizations
FOR SELECT
USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Owners can update their organization"
ON public.organizations
FOR UPDATE
USING (public.is_org_owner(auth.uid(), id))
WITH CHECK (public.is_org_owner(auth.uid(), id));

CREATE POLICY "Owners can delete their organization"
ON public.organizations
FOR DELETE
USING (public.is_org_owner(auth.uid(), id));

-- No INSERT policy: organization creation goes exclusively through create_organization().

-- RLS: memberships
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organization's memberships"
ON public.memberships
FOR SELECT
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins insert memberships, never as owner unless they are owner"
ON public.memberships
FOR INSERT
WITH CHECK (
  public.is_org_admin(auth.uid(), organization_id)
  AND (role <> 'owner' OR public.is_org_owner(auth.uid(), organization_id))
);

CREATE POLICY "Admins update memberships, never touching an owner unless they are owner"
ON public.memberships
FOR UPDATE
USING (
  public.is_org_admin(auth.uid(), organization_id)
  AND (role <> 'owner' OR public.is_org_owner(auth.uid(), organization_id))
)
WITH CHECK (
  public.is_org_admin(auth.uid(), organization_id)
  AND (role <> 'owner' OR public.is_org_owner(auth.uid(), organization_id))
);

CREATE POLICY "Admins delete memberships, never removing an owner unless they are owner"
ON public.memberships
FOR DELETE
USING (
  public.is_org_admin(auth.uid(), organization_id)
  AND (role <> 'owner' OR public.is_org_owner(auth.uid(), organization_id))
);
```

- [ ] **Step 4: Apply the migration**

Run: `npx supabase db reset`
Expected: reapplies every migration (existing + the new one) to the local stack from scratch.
Watch for errors — a syntax error or ordering problem in the new migration will fail here.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:supabase`
Expected: PASS (9 tests total — the config runs every file under `supabase/tests/`, so this
includes the existing smoke test plus 3 new in `organizations.test.ts` and 5 new in
`memberships.test.ts`).

- [ ] **Step 6: Run the full existing test suites to confirm nothing else broke**

Run: `npm test`
Expected: PASS (frontend/domain suite, unaffected).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260816150000_multi_tenancy_organizations_memberships.sql supabase/tests/organizations.test.ts supabase/tests/memberships.test.ts
git commit -m "feat: add organizations, memberships, role helper functions, and RLS"
```

---

### Task 3: Tenant #1 backfill

**Files:**
- Create: `supabase/migrations/20260816150100_multi_tenancy_tenant_one_backfill.sql`
- Create: `supabase/tests/tenantOneBackfill.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.memberships` (Task 2), `createAdminClient` (Task 1).
- Produces: no new functions — a data migration only. After this task, every fresh local/prod
  database has exactly one `organizations` row and one `owner` `memberships` row per existing
  admin `profiles` row.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/tenantOneBackfill.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("Tenant #1 backfill", () => {
  it("creates exactly one organization", async () => {
    const { data, error } = await admin.from("organizations").select("id, name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].name).toBe("Default Organization");
  });

  it("makes every existing admin an owner of that organization, and non-admins are not members", async () => {
    const { data: org } = await admin.from("organizations").select("id").single();
    const { data: admins } = await admin
      .from("profiles")
      .select("user_id")
      .eq("is_admin", true);
    const { data: nonAdmins } = await admin
      .from("profiles")
      .select("user_id")
      .eq("is_admin", false);

    const { data: memberships, error } = await admin
      .from("memberships")
      .select("user_id, role")
      .eq("organization_id", org!.id);
    expect(error).toBeNull();

    const adminIds = new Set((admins ?? []).map((a) => a.user_id));
    const membershipIds = new Set((memberships ?? []).map((m) => m.user_id));
    expect(membershipIds).toEqual(adminIds);
    for (const m of memberships ?? []) {
      expect(m.role).toBe("owner");
    }

    for (const nonAdmin of nonAdmins ?? []) {
      expect(membershipIds.has(nonAdmin.user_id)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:supabase`
Expected: FAIL — no `organizations` row exists yet (the local stack is a fresh install with
whatever `profiles` rows exist from prior test runs' `auth.users`/`profiles` triggers, but no
backfill migration has run).

Note: because prior tasks' tests create many throwaway users via `createTestUser`, and the
existing `handle_new_user`/admin-promotion triggers only make the very *first-ever* profile an
admin, your local stack's `profiles` table by this point likely has zero or one `is_admin=true`
row depending on test run history — this test only asserts consistency (memberships exactly
match admins), not a specific count, so it's correct either way. Run `npx supabase db reset`
first if you want a clean slate matching a fresh install exactly.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260816150100_multi_tenancy_tenant_one_backfill.sql`:

```sql
-- Multi-tenancy: Tenant #1 backfill. Makes every existing admin the owner of a single
-- default organization, preserving single-user/local dev mode as a natural special case
-- (one org, one owner) rather than a separate code path.

DO $$
DECLARE
  _org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, slug)
  VALUES ('Default Organization', 'default')
  RETURNING id INTO _org_id;

  INSERT INTO public.memberships (user_id, organization_id, role)
  SELECT user_id, _org_id, 'owner'
  FROM public.profiles
  WHERE is_admin = true;
END $$;
```

- [ ] **Step 4: Apply the migration**

Run: `npx supabase db reset`
Expected: reapplies all migrations from scratch, including this backfill, against whatever
`profiles` rows exist after the earlier migrations' triggers run during replay.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:supabase`
Expected: PASS (11 tests total — 2 new in `tenantOneBackfill.test.ts`, plus the 9 from Task 2
and the smoke test).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260816150100_multi_tenancy_tenant_one_backfill.sql supabase/tests/tenantOneBackfill.test.ts
git commit -m "feat: backfill Tenant #1 default organization for existing admins"
```

---

### Task 4: Final verification and documentation

**Files:**
- Create: `supabase/tests/README.md`

- [ ] **Step 1: Run the complete test suite from a clean database**

```bash
npx supabase db reset
npm run test:supabase
npm test
```
Expected: `test:supabase` PASSES (11 tests across 4 files); `npm test` (frontend/domain suite)
PASSES, unaffected.

- [ ] **Step 2: Manually verify RLS blocks cross-org access via the Studio (spot check)**

Run: `npx supabase status` to get the local Studio URL, open it in a browser, and inspect the
`organizations` and `memberships` tables directly — confirm the single seeded "Default
Organization" row and its owner membership look correct. This is a human sanity check on top
of the automated tests, not a replacement for them.

- [ ] **Step 3: Write `supabase/tests/README.md`**

```markdown
# Supabase RLS integration tests

Tests in this directory run against a **real local Supabase stack** (Postgres + Auth + RLS),
not a plain Postgres container — testing Row Level Security requires real `auth.uid()`
behavior, which only Supabase's own local dev stack provides.

## Running

\`\`\`bash
npx supabase start   # first time: downloads Docker images, may take a few minutes
npm run test:supabase
\`\`\`

`npm run test:supabase` is separate from the root `npm test` (which covers `src/**/*.test.ts`
and does not require Docker or Supabase running) — the two suites are independent.

If you've changed a migration file, run `npx supabase db reset` first to reapply the full
migration history to a clean database before re-running tests.

## Adding tests for a new subsystem

`testHelpers.ts` exports `createAdminClient()` (service-role, bypasses RLS — use for setup and
for assertions about ground truth), `createTestUser()` (creates a confirmed auth user), and
`createUserClient()` (an authenticated client for a specific test user — use this to exercise
RLS as that user would experience it). Follow the existing pattern in `organizations.test.ts`
and `memberships.test.ts`.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/README.md
git commit -m "docs: document the Supabase RLS test harness"
```

- [ ] **Step 5: Report status**

Confirm to the user: Subsystem 1 (Organizations, Memberships, Roles) is complete — schema,
role helper functions, `create_organization()` bootstrap, full RLS (including owner-lockout
prevention), Tenant #1 backfill, and a 10-test RLS integration suite, all passing against a
real local Supabase stack. Per the user's explicit requirement, this subsystem should be
reviewed now, before Subsystem 2 (tenant isolation on the 17 B2B Growth Engine tables) is even
planned.
