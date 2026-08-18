# PostgreSQL-First Architecture: Supabase Removal — Audit & Migration Design

**Status:** Audit complete. No implementation has started. This document is the source of truth for the Supabase → self-hosted-Postgres migration; per-subsystem implementation plans will be written separately, one at a time.

This document supersedes `docs/superpowers/specs/2026-08-18-postgres-first-saas-migration-audit.md` (an earlier, overlapping audit produced in parallel) — that file's ground-truth findings agreed with this one; its unique migration-plan specifics (StorageProvider interface, `outbox_events` schema, RBAC permission-map file path) have been folded in below.

## Decisions confirmed by the user (2026-08-19)

1. **Backend framework: stays Node/Express/TypeScript.** No FastAPI/Python rewrite. `server/` and `worker/` are extended, not replaced. "FastAPI Backend" in the original directive is treated as describing the layered shape (frontend → backend → Postgres → workers → AI), not a literal requirement.
2. **Authorization model: app-level only.** RLS is dropped entirely, not kept as defense-in-depth. Tenant/ownership isolation is enforced solely by Express middleware (`requireOrgMember`/`requirePermission`) deriving org/role from the authenticated session, backed by the mandatory cross-tenant automated test suite as the safety net (Risk #2 below is the reason this must be built and tested *before* RLS is dropped, not after).
3. **Portal route: `/portal` (`Portal.tsx`) is canonical.** `ClientPortal.tsx` (`/client`) is superseded — it's missing the Messages page and its own redirect/fallback logic already points back to `/portal`. `ClientPortal.tsx`, its route, and any child components used exclusively by it are removed during the auth/storage migration phase (§9 Phase 2), not before then.
4. **Stale `multi-tenancy-outreach` branch/worktree: discarded.** Contained only a Supabase-CLI RLS test-harness scaffold (5 files, no schema, no other work) — deleted from git on 2026-08-19. (Its on-disk worktree folder may still linger until a file lock from an open editor clears; that's a harmless cleanup detail, not a decision point.)

---

## 1. Current Architecture

The repo is not a clean "Supabase app" — it's two backends running in parallel, at different stages of migration off Supabase:

```
React/Vite frontend (src/)
  │
  ├── Admin content/CRM (services, homepage, invoices, quotes, testimonials, projects list)
  │        → migrated → Express API (server/) → self-hosted Postgres (plain `pg`, own migration runner)
  │
  ├── Admin: client file uploads, admin↔client messaging, legacy signOut cleanup
  │        → still Supabase-direct (storage, realtime, auth-ui cleanup call)
  │
  ├── Client Portal (Portal.tsx, ClientPortal.tsx, src/components/ClientPortal/*)
  │        → 100% Supabase-direct: Auth (Auth UI widget), Postgres (profiles/clients/messages/client_updates/projects),
  │          Storage (client-updates + documents buckets), Realtime (messages table)
  │
  └── B2B Growth Engine (companies/leads/campaigns/agent_tasks/research/... — 17 tables)
           → DB-only today, no frontend (`src/b2b` does not exist)
           → schema lives only in supabase/migrations/20260813120*.sql, RLS-gated
           → worker/ processes it via a direct `pg` connection (WORKER_DATABASE_URL) using a
             dedicated BYPASSRLS Postgres role — the worker itself has zero Supabase SDK dependency,
             it just happens to point at Supabase-hosted Postgres today.

Supabase project (umiryxoccksiicwglezx) provides, for the still-unmigrated slice:
  Auth · Postgres (profiles/clients/messages/client_updates/B2B tables + RLS) · Storage
  (client-updates, documents buckets) · Realtime · 3 Edge Functions (Deno, Resend email senders)

server/ (Express 4 + TypeScript, plain `pg`)
  - JWT bearer auth (no cookies), bcrypt (12 rounds), single global `is_admin` boolean — no orgs, no RBAC
  - Custom hand-rolled migration runner (advisory lock + schema_migrations table), one migration file
    (0001_core_schema.sql): users, projects, services, contact_submissions, quote_requests, invoices(+line items),
    homepage_content, feedback, admin_settings. Zero multi-tenancy tables anywhere.
  - Already deployed live on a VPS (per prior session), already Docker-composed.

worker/ (Node + TypeScript, plain `pg`)
  - Research pipeline: claimResearchTasks (FOR UPDATE SKIP LOCKED on agent_tasks) → processResearchTask → AI call → research/agent_runs
  - AIProvider abstraction already exists: 7-op interface, MockAIProvider + ClaudeAIProvider, selected via AI_PROVIDER env var.
    No Ollama or OpenAI provider yet.
  - No outbox pattern anywhere in the repo (grep confirmed zero matches).
  - Hard-coded to task_type='research' only — not yet generalized to other task types.

Prior planning docs (docs/superpowers/{specs,plans}/2026-08-1{3,4,6,8}-*.md) already designed most of
multi-tenancy, tenant isolation, and the omnichannel outreach domain — but ALL of them target Supabase-hosted
Postgres (RLS, auth.uid()), and none is merged beyond a 5-file, zero-schema test-harness scaffold sitting on an
unmerged worktree branch (`multi-tenancy-outreach`, 1 commit ahead of main). Two other worktrees
(`drickly-backend`, `multi-tenancy-organizations`) are stale — fully merged already, safe to prune.
```

**Net picture:** the website/CRM side is already where the user wants everything to end up. The client portal and the B2B growth engine are the two things that actually depend on Supabase today, plus a handful of legacy cleanup calls in the admin panel.

---

## 2. Supabase Dependencies (complete inventory)

### 2.1 Client SDK & config
- `package.json`: `@supabase/supabase-js@^2.57.4`, `@supabase/auth-ui-react@^0.4.7`, `@supabase/auth-ui-shared@^0.1.8`.
- `src/integrations/supabase/client.ts` — **auto-generated, hardcoded** `SUPABASE_URL` and anon key (not env-driven at all — no `import.meta.env.*` involved). Low risk in isolation (anon key is meant to be public) but means there's no environment-based override today.
- `supabase/config.toml` — `project_id` + `verify_jwt = false` for all 3 edge functions. No storage/bucket config tracked here.
- `server/` and `worker/`: **zero** Supabase imports (confirmed by grep) — already clean.

### 2.2 Auth
- `src/pages/Portal.tsx`, `src/pages/ClientPortal.tsx` — render `<Auth supabaseClient={supabase}>` from `@supabase/auth-ui-react`; both routed simultaneously (`/portal/*` and `/client/*`) — apparent duplicate/legacy surface, needs a decision during migration (keep one).
- `src/pages/AdminSignup.tsx` — `supabase.auth.signUp(...)`, RPC `is_admin_signup_enabled()`.
- `getSession()/getUser()/onAuthStateChange` scattered across `ClientPortal/{Dashboard,Updates,Messages,Feedback,FilesDocuments}.tsx` and `AdminPanel/{ClientManager,ClientMessagesManager,WorkUpdatesManager}.tsx`.
- `src/components/ClientPortal/PortalNavigation.tsx` — `supabase.auth.signOut()`.
- `src/components/AdminPanel/AdminSidebar.tsx` — calls the **Express** `logout()` first (authoritative), then `supabase.auth.signOut()` only as legacy best-effort cleanup — confirms admin auth is already migrated.

### 2.3 Database (client-direct queries, bypassing any backend)
- Full CRUD across all of `src/components/ClientPortal/*` (profiles, clients, client_updates, messages, projects).
- `src/pages/PrivacyPolicy.tsx` — direct insert into `contact_submissions` (parallel path to the Express `contact_submissions` resource — needs reconciling, not two write paths).
- `src/lib/testimonials.ts` — RPC `get_public_testimonials()`.
- Legacy admin components (`ClientManager.tsx`, `ClientMessagesManager.tsx`, `WorkUpdatesManager.tsx`) still query Supabase directly.

### 2.4 Row Level Security (the authorization logic that must be reimplemented in app code)
Two authorization shapes exist, both keyed off `auth.uid()` via `public.is_admin(auth.uid())`:
- **Admin-or-owner pattern** (projects, client_updates, feedback, messages): admins see everything; a regular user sees only rows where `client_user_id = auth.uid()` (or `client_email = auth.email()` for feedback).
- **Admin-only, no tenant scoping** (clients, contact_submissions, quote_requests, newsletter_subscriptions, invoices, invoice_line_items, admin_settings, and **all 16 B2B growth-engine tables**): a single blanket `USING (is_admin(auth.uid()))` — there is currently no per-organization/per-workspace boundary anywhere in the B2B schema. This matches the prior planning docs' own finding ("zero `organization_id` exists anywhere in shipped code").
- Storage-object policies on `storage.objects` (bucket `client-updates`): admin full access; client can only see files under their own `auth.uid()` prefix or files linked to their own projects via `client_updates`.
- Two RLS incidents on record (`SECURITY_FIX_REPORT.md`, `docs/security-fix-*.md`): a too-broad public SELECT policy on `feedback` leaked `client_email`/`client_id`, fixed via a SECURITY DEFINER function returning an allowlisted column set; a follow-up fix removed an implicit-SECURITY-DEFINER view (Supabase linter anti-pattern). **The equivalent app-layer bug to avoid**: any unauthenticated/public Express endpoint touching `feedback`/`contact_submissions`/`quote_requests`/`newsletter_subscriptions` must field-allowlist its response server-side.

### 2.5 Storage
- Bucket `client-updates` (private) — tracked via migration, has RLS policies. Upload site: `ClientManager.tsx`. Signed-URL read: `ClientPortal/Updates.tsx`.
- Bucket `documents` — **not tracked in any migration** (created manually via dashboard, so its policies are not in git). Upload: `WorkUpdatesManager.tsx`. Download: `ClientPortal/FilesDocuments.tsx`.
- No storage usage anywhere in `server/` or `worker/`.

### 2.6 Realtime
- Two `postgres_changes` subscriptions on the `messages` table (`ClientPortal/Messages.tsx`, `AdminPanel/ClientMessagesManager.tsx`), both wildcard `event: "*"` triggering a full reload. Only realtime usage in the repo.

### 2.7 Edge Functions (Deno, on Supabase's function runtime)
- `notify-new-message`, `notify-client-reply`, `notify-client-update` — all three are thin Resend email senders (`RESEND_API_KEY` as a Supabase project secret), invoked directly from the frontend via `supabase.functions.invoke(...)` (found in `ClientPortal/Messages.tsx` and `AdminPanel/ClientManager.tsx` — `notify-new-message`'s caller wasn't traced but follows the same pattern). Not triggered by DB webhooks. `notify-client-update` has a dead/unused `createClient` import. No business logic beyond formatting and sending an email — straightforward to port to server/worker.

### 2.8 B2B Growth Engine schema (the big one)
17 tables (`lead_sources, companies, contacts, strategies, strategy_versions, leads, research, lead_scores, campaigns, campaign_leads, outreach_messages, outreach_message_events, replies, meetings, agent_tasks, agent_runs, analytics_events`) exist **only** in `supabase/migrations/20260813120*.sql`, applied via Supabase's own tooling. `worker/` already talks to this schema via plain `pg`, so the *code* has no Supabase dependency — but the schema itself has never been expressed as a `server/db/migrations` file, so "run migrations from empty → get full schema" (the user's Definition of Done) currently fails for everything the worker touches.

---

## 3. Replacement Architecture

```
React/Vite (src/)
      │  fetch/axios, JWT bearer
      ▼
Express API (server/)  ──────────────┐
      │                              │
      ▼                              ▼
Self-hosted PostgreSQL          Outbox events table
      │                              │
      ▼                              ▼
Workers (worker/, generalized)  Event dispatcher (email via Resend, etc.)
      │
      ▼
AIProvider abstraction (Mock / Claude / +Ollama / +OpenAI)

StorageProvider abstraction: LocalStorage (dev) / S3-compatible (prod)
Auth: Express JWT + session store (extend existing server/src/auth/*)
RBAC: permissions-as-data, replacing is_admin boolean + all RLS policies
```

Nothing here is net-new invention — `server/` and `worker/` already are this shape. The work is: (a) pull the B2B + client-portal schema into `server/db/migrations`, (b) extend auth/RBAC to cover org-scoping and client-role users, (c) build the storage abstraction, (d) move the 3 edge functions' logic into server/worker behind an outbox, (e) extend the AI provider abstraction, (f) migrate the remaining Supabase-direct frontend code to call the Express API.

---

## 4. Database Migration Plan

1. **Consolidate schema ownership.** Everything moves to `server/db/migrations/*.sql`, applied by the existing hand-rolled runner (`server/src/db/migrate.ts`) — no new migration library needed, it already does advisory-lock + `schema_migrations` tracking correctly.
2. **Port the B2B schema** (currently `supabase/migrations/20260813120*.sql`) into new `server/db/migrations/000X_*.sql` files, stripped of `auth.uid()`/RLS (that logic moves to Express middleware — see §5/§6 below) but keeping every table, FK, constraint, and index as-is.
3. **Port the client-portal schema** (`profiles`, `clients`, `client_updates`, `messages`, and the storage-bucket-adjacent columns) the same way. Reconcile `profiles` vs `server`'s existing `users` table — decide whether they merge (likely: `users` gains the columns `profiles` has, since both represent "an authenticated person").
4. **Multi-tenancy tables**, only as required by the current milestone (per YAGNI — do not build workspaces/roles/permissions tables until an actual feature needs them beyond what's already decided in the existing unmerged design docs): `organizations`, `memberships` (the existing `2026-08-16-multi-tenancy-design.md` already specifies this — flat org=workspace model, owner/admin/member roles — that design can be reused almost as-is, just retargeted from Supabase migrations to `server/db/migrations`).
5. **Data migration**: `pg_dump` the Supabase Postgres instance (schema + data for the tables being ported), transform as needed (drop RLS/auth schema objects, remap `auth.users.id` → `users.id` if `profiles` merges into `users`), `pg_restore`/`psql` into the self-hosted instance. Existing `server/db/migrations/0001_core_schema.sql` data (already self-hosted) is untouched. Identity rows referenced by `leads.owner_id`/`campaigns.created_by` etc. that don't already exist in `users` get matched by email or created fresh with a random unusable password hash (B2B-only actors don't need to log in via password until the org-invite flow exists).
6. **Outbox table** (new, replaces the 3 Supabase Edge Functions): `outbox_events(id, aggregate_type, aggregate_id, event_type, payload jsonb, organization_id nullable, status enum('pending','processing','sent','failed'), attempts, created_at, processed_at)`. Written in the same transaction as the state change that triggers a notification (client reply, client update, new message); a small worker-side poller uses the same `FOR UPDATE SKIP LOCKED` claiming pattern as `agent_tasks`, just a different `task_type` — no new infrastructure.
7. **Verification loop** (per user's Definition of Done): empty DB → run migrations → full schema → tests pass; existing DB → run migrations → data preserved → tests pass.

---

## 5. Authentication Migration Plan

Current `server/src/auth/*` is a solid foundation but has two gaps versus the user's spec, independent of Supabase:
- **No session invalidation** — JWTs aren't tracked server-side, so `logout` is a no-op `204`. The spec requires "Sessions must be securely stored and invalidatable." Needs a `sessions` table (or a JWT-blocklist) — this is new work, not a Supabase replacement per se.
- **No email verification, no password reset** — not present anywhere yet.

Plan:
1. Add `sessions` table + refresh-token or session-id model so logout/invalidation is real.
2. Add email verification + password-reset flows (token table + email send via the ported Resend integration).
3. Extend the existing `is_admin` boolean model toward the RBAC model in §6 (roles: Owner/Admin/Manager/Marketing/Sales/Viewer) — but only once a feature needs more than admin/non-admin; the client portal itself may only need "admin vs. client" for a while.
4. Migrate `Portal.tsx`/`ClientPortal.tsx` off `@supabase/auth-ui-react` onto the Express `/api/auth` endpoints — decide which of the two duplicate portal routes survives.
5. Remove the legacy `supabase.auth.signOut()` cleanup call in `AdminSidebar.tsx` once Supabase auth is fully decommissioned.

---

## 6. RBAC / Tenant Isolation Plan

- Replace every `USING (is_admin(auth.uid()))` RLS policy with Express middleware equivalents: `requireAuth` (exists) → `requireOrgMember(orgId)` (new) → `requirePermission('resource.action')` (new, data-driven per the user's spec, not scattered `if` checks). The permission map itself lives as static data in `server/src/auth/permissions.ts` (`{ owner: [...], admin: [...], member: [...] }`), not a database table — it grows only as real routes need new permissions (YAGNI).
- Replace the admin-or-owner pattern (`client_user_id = auth.uid()`) with an explicit `WHERE client_user_id = $currentUserId` clause in the resource handler (the `projects.ts` resource already does this for non-admins — same pattern extends to `client_updates`, `messages`, `feedback`).
- For the B2B tables: add `organization_id` to all 17 tables (already fully designed in the unmerged `2026-08-18-multi-tenancy-tenant-isolation.md` plan) and enforce it via a query-builder helper that always injects `WHERE organization_id = $orgId`, never trusting a client-supplied org id — derive it from session/membership as the user's spec requires.
- Mandatory automated tests: Org A cannot read Org B's leads/campaigns/messages/research/agent_tasks — this is explicitly called out in the existing tenant-isolation plan; carry it over.

---

## 7. Storage Migration Plan

1. Define `StorageProvider` interface (`server/src/storage/StorageProvider.ts`): `upload(key, buffer, contentType): Promise<{ url }>`, `getUrl(key): Promise<string>`, `delete(key): Promise<void>`.
2. `LocalStorage` implementation (filesystem, dev default) and `S3CompatibleStorage` (works with S3/R2/MinIO via the same S3 API).
3. Add Express endpoints (e.g. `/api/files`) wrapping the provider, enforcing the same auth/RBAC as any other resource — this is what replaces the two Supabase storage buckets' RLS policies.
4. Migrate `client-updates` and `documents` bucket contents to the new storage backend (download from Supabase Storage, re-upload via the new provider, keeping stable keys/URLs where possible).
5. Update `ClientManager.tsx`, `WorkUpdatesManager.tsx`, `FilesDocuments.tsx`, `Updates.tsx` to call the new endpoints instead of `supabase.storage.*`.
6. Formalize the untracked `documents` bucket's access rules (currently only living in the Supabase dashboard, not git) as explicit RBAC checks in the new endpoint.

---

## 8. Risk Assessment

| Risk | Notes |
|---|---|
| **Existing production data** in Supabase (profiles, clients, client_updates, messages, feedback, contact_submissions, quote_requests, invoices, B2B leads/companies/etc.) | Must be exported/imported without loss. Two independent write paths for `contact_submissions` today (Express resource + direct Supabase insert from `PrivacyPolicy.tsx`) need reconciling before cutover or duplicate rows compound. |
| **RLS is currently the *only* enforcement** for B2B tenant/admin boundaries and client-portal ownership | Removing Supabase before the equivalent app-level checks exist would open access entirely. Sequencing matters: build the RBAC/tenant-isolation layer *before* decommissioning RLS, not after. |
| **Duplicate portal routes** (`Portal.tsx` @ `/portal`, `ClientPortal.tsx` @ `/client`) | Needs a product decision (which one survives) before auth migration — otherwise double the migration work for a redundant surface. |
| **Untracked `documents` storage bucket** | Its access rules exist only in the Supabase dashboard, not git — must be reverse-engineered/confirmed with the user before replicating in the new StorageProvider. |
| **Realtime replacement** | Polling or SSE needed for the `messages` table; low complexity but a real behavior change (no longer instant push unless SSE is chosen). |
| **Resend email sending** currently lives in Supabase Edge Functions (Deno) with `RESEND_API_KEY` as a Supabase secret | Needs its own secret management once ported to server/worker; straightforward since the functions have no other Supabase dependency. |
| **Stray worktrees** (`drickly-backend`, `multi-tenancy-organizations` — fully merged, safe to prune; `multi-tenancy-outreach` — 1 unmerged commit, just a test-harness scaffold) | Should be reconciled/pruned before new work starts so effort isn't duplicated or a stale branch is mistaken for progress. |
| **Existing JWT logout is a no-op** | Pre-existing gap, not caused by Supabase removal, but the spec's "invalidatable sessions" requirement means it must be fixed as part of the auth work regardless. |
| **Hardcoded Supabase URL/anon key** in the generated `client.ts` | Not a security issue on its own (anon key is public by design) but means nothing today reads Supabase config from env — full removal is a clean deletion, not an env-var cleanup. |

---

## 9. Implementation Phases

Work one subsystem at a time, per the user's process (tests + code review + security review + migration test + tenant-isolation test + docs update + remaining-risk report after each):

0. **Reconcile worktrees** — prune the two stale merged worktrees; decide whether to keep or discard the `multi-tenancy-outreach` test-harness scaffold commit.
1. **Schema consolidation** — port B2B + client-portal tables into `server/db/migrations`; add `organizations`/`memberships` (reusing the existing design doc); data migration + verification loop (empty-DB and existing-DB test paths).
2. **Auth hardening** — session invalidation, email verification, password reset; migrate client portal off `@supabase/auth-ui-react`.
3. **RBAC + tenant isolation** — permission-as-data model, `organization_id` enforcement on B2B tables, cross-tenant-access automated tests.
4. **Storage abstraction** — LocalStorage/S3-compatible provider, migrate both buckets' call sites and data.
5. **Realtime replacement** — polling or SSE for `messages`.
6. **Notifications/outbox** — move the 3 Resend email senders into server/worker behind a transactional outbox table + dispatcher.
7. **AI provider abstraction extension** — add Ollama and OpenAI providers alongside existing Mock/Claude.
8. **Worker generalization** — generalize `claimResearchTasks` into a generic `claimTasks(pool, workerId, taskType, batchSize)` (already scoped in the unmerged omnichannel-outreach-domain plan).
9. **Docker Compose local dev** — frontend/backend/postgres/worker/ollama services, complete `.env.example`.
10. **Decommission Supabase** — remove `@supabase/*` deps, delete `supabase/` directory, delete the hardcoded client, confirm zero remaining references.

Each phase above will get its own detailed task-by-task implementation plan (via the writing-plans process) immediately before that phase starts — not now, to avoid planning far ahead of ground truth that may shift once earlier phases land.
