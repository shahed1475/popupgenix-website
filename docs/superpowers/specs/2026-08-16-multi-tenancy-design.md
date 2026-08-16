# Multi-Tenancy: Organizations, Roles, Invitations, Tenant Isolation — Design

**Goal:** Convert the B2B Growth Engine (the Supabase-hosted schema that the research worker
operates on — companies, leads, contacts, campaigns, research, agent_tasks, agent_runs, and
9 other tables, 17 total) from a single-admin, globally-shared dataset into a properly
tenant-isolated multi-tenant system, with Organizations as the tenant boundary, role-based
membership (Owner/Admin/Member), email-delivered invitations, and database-enforced tenant
isolation — while preserving local/single-user development as a natural special case (one
seeded organization) rather than a separate code path.

**Explicitly out of scope for this subsystem** (per user instruction and confirmed during
design): CRM, billing, marketplace, additional AI agents, new outreach channels, any frontend
UI (org creation/member management/invite-acceptance screens — schema/RLS/tests only, matching
the existing B2B Growth Engine's own "no admin UI" precedent), and the unmerged `server/`
(drickly-api) backend, which has no B2B Growth Engine tables at all and is not touched here.

## Current State (confirmed by direct inspection of `main` @ `29c98ab`)

- `server/` (drickly-api, self-hosted Postgres) **does not exist on `main`** — it only exists
  on the unmerged `worktree-drickly-backend` branch and has no campaigns/leads/research
  tables regardless. Not in scope.
- The B2B Growth Engine lives entirely in Supabase Postgres, defined across 7 migration files
  under `supabase/migrations/20260813*.sql`: `lead_sources`, `companies`, `contacts`,
  `strategies`, `strategy_versions`, `leads`, `research`, `lead_scores`, `campaigns`,
  `campaign_leads`, `outreach_messages`, `outreach_message_events`, `replies`, `meetings`,
  `agent_tasks`, `agent_runs`, `analytics_events` (17 tables).
- Every one of those 17 tables has RLS enabled with exactly one policy:
  `USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))` — a single
  global admin flag on the pre-existing `profiles` table (itself not defined in any tracked
  migration — created out-of-band in the Supabase dashboard before migration tracking began).
  **Any signed-in admin currently sees and manages every row belonging to every other admin.**
  `leads.owner_id` and `campaigns.created_by` exist as plain FKs to `auth.users` but are not
  referenced by any RLS policy.
- The research worker (`worker/`, merged to `main`) connects to Postgres via
  `WORKER_DATABASE_URL` using a role that **bypasses RLS entirely** (documented requirement
  from the worker's own design spec — it has no `auth.uid()` context, being an automated
  service). Its claiming query (`claimResearchTasks.ts`) and processor
  (`processResearchTask.ts`) have zero tenant filtering today — this matters because it means
  **RLS alone cannot be the isolation mechanism for the worker's own writes**; something else
  must guarantee tenant correctness there.
- No organization/workspace/tenant/role/permission concept exists anywhere in the codebase
  today, and no prior plan or spec has discussed multi-tenancy.

## Confirmed Design Decisions

- **Target system:** the B2B Growth Engine on Supabase only. `server/` stays out of scope.
- **Organization = Workspace:** one flat tenant boundary. "Workspace" is not a separate
  hierarchy level — every table gets exactly one `organization_id`.
- **Enforcement:** RLS is the primary, hard boundary (extending the existing
  `is_admin(auth.uid())` pattern to organization-scoped checks) for all Supabase-client access
  (the frontend, direct API/PostgREST access). Because the worker bypasses RLS by design,
  **trigger-enforced `organization_id` propagation** is the mechanism that keeps the worker's
  writes tenant-correct — not RLS, which doesn't apply to it.
- **Roles:** `owner`, `admin`, `member` — three tiers, no `viewer`.
- **Invitations:** real email delivery via **Resend** (new dependency — requires an API key).
- **Local/single-user dev mode:** no special code path or env flag. A fresh local Supabase
  instance ends up with exactly one organization (seeded by migration), one owner, and every
  RLS policy and query behaves identically to production — just with one tenant.
- **Multi-org membership:** many-to-many. A user can belong to multiple organizations, each
  with its own role, via a `memberships` join table.
- **UI:** none. Backend/schema/RLS/tests only, matching the B2B Growth Engine's existing
  "no admin UI" precedent from its Phase 1 plan.
- **RLS test infrastructure:** the Supabase CLI's local dev stack (`supabase start`) — the
  only way to genuinely exercise `auth.uid()`-based RLS with real simulated users rather than
  a stand-in. New local dev dependency (Docker-based).

## Schema

### New tables

```sql
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_org_unique UNIQUE (user_id, organization_id)
);

CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### Helper functions (SECURITY DEFINER, mirroring the existing `is_admin` pattern)

```sql
public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean
public.org_role(_user_id uuid, _org_id uuid) RETURNS text        -- role or NULL
public.is_org_admin(_user_id uuid, _org_id uuid) RETURNS boolean -- role IN ('owner','admin')
public.is_org_owner(_user_id uuid, _org_id uuid) RETURNS boolean -- role = 'owner'
```

### `organization_id` on all 17 existing B2B tables

Every table gets `organization_id UUID NOT NULL REFERENCES public.organizations(id)`. Root
tables (top of their own hierarchy) accept it as an explicit insert value; derived tables get
it from a `BEFORE INSERT` trigger that copies it from the parent FK and rejects a mismatched
caller-supplied value:

| Category | Tables | organization_id source |
|---|---|---|
| Root | `companies`, `lead_sources`, `strategies`, `campaigns`, `agent_tasks`, `analytics_events` | explicit, set by inserting code |
| Derived from `companies` | `contacts`, `leads` | trigger copies from `companies.id = company_id` |
| Derived from `leads` | `lead_scores` | trigger copies from `leads.id = lead_id` |
| Derived from `strategies` | `strategy_versions` | trigger copies from `strategies.id = strategy_id` |
| Derived from `campaigns` + `leads` | `campaign_leads` | trigger copies from `campaigns.id = campaign_id` and rejects the insert if `leads.id = lead_id` belongs to a different org — a genuine two-parent junction, both must already agree |
| Derived from `campaign_leads` | `outreach_messages` | trigger copies from `campaign_leads.id = campaign_lead_id` (not `campaigns` directly — `outreach_messages` has no direct FK to `campaigns` per the actual migration) |
| Derived from `outreach_messages` | `outreach_message_events` | trigger copies from `outreach_messages.id = message_id` |
| Derived from `leads` | `replies`, `meetings` | trigger copies from `leads.id = lead_id` (both tables' actual parent per the migration — `contact_id` is an optional secondary FK, not the tenant-scoping source) |
| Derived from `agent_tasks` | `agent_runs` | trigger copies from `agent_tasks.id = task_id` |
| Polymorphic | `research` | trigger resolves `subject_type`/`subject_id` to the actual `companies` or `contacts` row and validates/populates from it |

This trigger layer is what keeps the worker's writes tenant-correct even though the worker's
Postgres role bypasses RLS — triggers fire regardless of RLS.

## RLS Policy Model

Replacing every table's current single `is_admin(auth.uid())` policy:

- **B2B data tables** (companies, leads, campaigns, research, etc.): any member (owner, admin,
  or member) of the row's `organization_id` gets full `SELECT`/`INSERT`/`UPDATE`/`DELETE` —
  this preserves today's "every admin has full data access" behavior, just scoped to one org
  instead of globally. No finer-grained per-role data restrictions in this phase (nothing in
  the requirements called for e.g. "members can't delete leads").
- **`memberships`**: members can `SELECT` their own org's membership list. Only owner/admin can
  `INSERT`/`UPDATE`/`DELETE` — invite, change roles, remove people. An owner row cannot be
  demoted or deleted by an admin (only by another owner or the owner themselves) — prevents
  accidental lockout of the last owner.
- **`invitations`**: only owner/admin can `INSERT`/`UPDATE` (create/revoke) for their org. A
  narrow, token-scoped `SELECT` policy (not membership-gated, since the invitee isn't a member
  yet) lets the accept-invitation flow look up a pending invitation by its token.
- **`organizations`**: members can `SELECT` their own org row. Only owner can `UPDATE` (rename)
  or `DELETE`.

## Migration & Backfill Strategy

Ordered migration files (new timestamps after the existing `20260813*` series):

1. Create `organizations`, `memberships`, `invitations` + helper functions.
2. Insert one `organizations` row (`name = 'Default Organization'`) — this is Tenant #1.
3. For every existing `profiles` row with `is_admin = true`, insert a `memberships` row
   `(user_id, organization_id = Tenant #1, role = 'owner')`. Non-admin `profiles` rows (Era A
   "client portal" users, unrelated to the B2B system) are untouched.
4. For each of the 17 B2B tables: add `organization_id` **nullable** first, `UPDATE ... SET
   organization_id = <Tenant #1 id>` for every existing row, then `ALTER COLUMN
   organization_id SET NOT NULL`, add the FK, add the propagation trigger. This
   nullable-then-backfill-then-constrain order avoids ever locking a table against a NOT NULL
   constraint with no valid value to fill in.
5. Drop and replace all 17 tables' RLS policies with the org-scoped versions above, in the same
   migration files (no dangling old policies).

This migration *is* the entire "preserve single-user/local dev mode" story: a fresh local
Supabase instance ends up with exactly one org, one owner, everything scoped to it — same
shape as production, not a parallel dev-only code path.

## Research Worker Changes

Minimal, due to trigger-based propagation:

- `claimResearchTasks.ts`: **unchanged**. The worker is a shared backend service processing
  the global queue across all tenants — each `agent_tasks` row already carries its own
  `organization_id`; there's no reason to filter the claim query by org.
- `processResearchTask.ts`: the existing lead→company lookup query gets `c.organization_id`
  added to its `SELECT`, and that value is passed explicitly into the `research` INSERT (in
  addition to the trigger validating it) — `research` is the one polymorphic table where
  making the worker's intent explicit, not just trigger-implicit, is worth the extra clarity.
- `agent_runs`: no worker code change — its trigger derives `organization_id` from the parent
  `agent_tasks` row automatically.

## Invitation & Signup Flow

- **Creating an org:** any authenticated Supabase user can create an organization and becomes
  its owner automatically. Replaces the old global `is_admin_signup_enabled()` switch, which
  doesn't make sense once orgs are self-serve.
- **Inviting:** an owner/admin creates an `invitations` row (email, role, 7-day `expires_at`,
  generated `token`). Since a Postgres trigger cannot call an external HTTP API, sending the
  actual email is handled by a **Supabase Edge Function** invoked after the insert, which calls
  the **Resend** API. This is the one non-SQL piece of this subsystem.
- **Accepting:** the invitee signs up/logs in via the existing Supabase Auth flow (unchanged),
  then calls an `accept_invitation(token)` Postgres function (`SECURITY DEFINER`, callable via
  Supabase RPC — no `server/` API needed). It validates the token (matches the caller's
  authenticated email, not expired, still `pending`), inserts the `memberships` row with the
  invited role, and marks the invitation `accepted`.

## Testing Strategy

Two surfaces, both required before this subsystem is "production-ready":

1. **Worker-side** (extends the existing real-Postgres `worker/` test convention):
   `worker/src/test/schema.sql` gains the three new tables, `organization_id` columns, and
   propagation triggers. New test: seed two organizations, each with its own
   company/lead/`agent_tasks` row, run `processResearchTask` for org A's task, assert org B's
   `research`/`agent_runs`/`leads` rows are completely untouched.
2. **RLS-policy-level** (new): a plain local Postgres container has no `auth.uid()` or real
   RLS-simulating auth context — proving cross-tenant blocking for real requires the
   **Supabase CLI's local dev stack** (`supabase start`), which runs full Postgres + Auth + RLS
   matching production. A new `supabase/tests/` suite (Node + `@supabase/supabase-js`, real
   HTTP calls against the local stack) authenticates as two different simulated users
   (members of Org A and Org B respectively) and asserts, **across every one of the 17 B2B
   tables plus `memberships`/`invitations`/`organizations`**, that Org A's user cannot read or
   write Org B's rows.

The full test suite (worker's vitest suite + the new Supabase RLS suite) must pass after every
milestone, per the user's explicit requirement, and each subsystem must be reviewed before the
next one starts.

## Implementation Sequencing

This design is one cohesive architecture, but per the requirement to implement and review one
subsystem at a time (not as a single large change), implementation proceeds as separate
sequential plan/execution cycles — each producing working, independently-testable software,
each reviewed and confirmed production-ready before the next starts:

1. **Organizations + Memberships + roles** — the tenant/membership core and helper functions,
   with the Tenant #1 backfill for `organizations`/`memberships` only (no B2B table changes
   yet). Testable in isolation: create orgs, add/remove members, role checks.
2. **Tenant isolation on the 17 B2B tables** — `organization_id` columns, propagation triggers,
   backfill, and the full RLS policy rewrite. The largest and highest-risk subsystem; this is
   where the cross-tenant integration test suite is built and must pass before moving on.
3. **Research worker changes** — the `processResearchTask.ts` update plus the worker-side
   cross-tenant test, now that `organization_id` exists on every relevant table.
4. **Invitations + Resend email delivery** — the `invitations` table, RLS, `accept_invitation`
   function, and the Edge Function/Resend integration. Depends on subsystems 1-2 existing.

Each cycle gets its own implementation plan document and follows this repo's established
TDD/subagent-driven workflow, with the full test suite (worker vitest + Supabase RLS suite)
run and passing at the end of each before the next cycle's plan is even written.
