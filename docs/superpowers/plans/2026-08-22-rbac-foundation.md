# RBAC Foundation & First Org-Scoped B2B Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Express-level RBAC layer that replaces Supabase RLS — `requireOrgMember` and
`requirePermission` middleware backed by a static permission map — backfill the "Tenant #1"
default organization/membership that today's single admin account is missing, and prove the
whole thing end-to-end with one real, org-scoped B2B resource (`companies`), including the
mandatory cross-tenant test (Org A cannot see Org B's data).

**Architecture:** Extend the existing `server/src/auth/middleware.ts` factory (`createAuthMiddleware`)
with two new middlewares, backed by a new static permission map module. A new migration backfills
`organizations`/`memberships` for existing admin users. A new `companies` resource router
(Express + plain `pg`, matching every existing resource's shape) is the first consumer, and its
tests are the proof that org isolation actually holds.

**Tech Stack:** Node/Express/TypeScript, `pg`, Zod, Vitest + Supertest (all already in `server/`).

**Prerequisite:** Phase 1 (schema consolidation — COMPLETE, merged) already created the
`organizations`/`memberships` tables (`server/db/migrations/0002_organizations_memberships.sql`)
and `organization_id` + propagation triggers on all 17 B2B tables including `companies`
(`0003_b2b_lead_sources_companies_contacts.sql`). Phase 2 (auth hardening — COMPLETE, merged)
already provides `requireAuth`/`optionalAuth`/`requireAdmin` and revocable sessions
(`server/src/auth/middleware.ts`). This plan builds directly on top of both; it does not touch
Supabase or `supabase/migrations` at all.

**Reference spec:** `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md` §6
(RBAC / Tenant Isolation Plan) — read this first. Note it supersedes the older, Supabase-RLS-based
`docs/superpowers/plans/2026-08-18-multi-tenancy-tenant-isolation.md`, which is **not used** by
this plan (that file assumes `auth.uid()`/RLS, which Decision #2 in the 2026-08-19 spec
explicitly drops in favor of app-level middleware).

**Scope note — this is slice 1 of Phase 3, not all of it.** The full RBAC/tenant-isolation phase
also requires (deliberately deferred to a follow-up plan, written once this slice's pattern has
proven itself): closing the "secondary FK" gap on 11 unvalidated columns across the B2B tables
(spec §8.1), a table-driven test covering all 11 `organization_id` propagation triggers, and
extending org-scoped resources to the remaining 16 B2B tables (leads, campaigns, messages,
research, agent_tasks, etc.) as their own Express routes get built. Building all of that before
proving the middleware pattern on one real resource would be planning ahead of ground truth that
may shift — same reasoning the spec itself used to defer per-phase planning.

**Design decision made in this plan (flag for review):** the spec describes
`requireOrgMember(orgId)` as if callers pass an org id explicitly (e.g. from a URL param). No such
route exists yet, and there is no org-switcher UI or multi-org-per-user feature built or specced
anywhere in the repo. Building URL-based org selection now would be speculative (YAGNI). Instead,
`requireOrgMember` in this plan derives the organization from the caller's own membership row(s) —
today every user has at most one (the Tenant #1 default org backfilled by Task 1). If a user ever
has more than one membership before a real multi-org-selection feature exists, this middleware
picks the earliest-created one deterministically rather than erroring, so a future second
membership doesn't lock a user out. Revisit this the moment a real feature needs explicit org
selection.

## Global Constraints

- **No RLS anywhere.** All authorization enforcement is Express middleware + explicit `WHERE`
  clauses in resource handlers. (Spec Decision #2.)
- **Never trust a client-supplied `organization_id`.** Every write derives it from
  `req.membership.organizationId`, never from the request body or a route param. (Spec §6.)
- The permission map is static data in `server/src/auth/permissions.ts` (`Record<Role,
  ReadonlySet<Permission>>`), not a database table. It grows only as real routes need new
  permissions — do not pre-populate permissions for resources that don't exist yet. (Spec §6.)
- New migration files: sequentially numbered starting at `0018`, must not touch `0001`-`0017`,
  must not use `CREATE TABLE IF NOT EXISTS`, must use lowercase SQL types — matching every
  existing migration's convention.
- Follow existing test conventions exactly: `createTestPool`/`truncateAll`/`issueTestToken` from
  `server/src/test/setupTestDb.ts`; inline `INSERT INTO organizations (name, slug) VALUES ($1,
  $1) RETURNING id` per test (no shared fixture helper — matches every existing schema test);
  Supertest + a local `buildApp()` for resource-router tests (matches `projects.test.ts`); mock
  `Request`/`Response` + `vi.fn()` for middleware unit tests (matches `middleware.test.ts`).
- `server/src/db/schema/fullSchema.test.ts` and `existingDataPreserved.test.ts` only assert table
  *existence*, never row counts — the Task 1 backfill migration inserting a data row is safe and
  requires no changes to either file.

---

### Task 1: Tenant #1 backfill migration

**Files:**
- Create: `server/db/migrations/0018_tenant_one_backfill.sql`
- Test: `server/src/db/schema/tenantOneBackfill.test.ts`

**Interfaces:**
- Produces: guarantees that after this migration, every `users` row with `is_admin = true` has
  exactly one row in `memberships` with `role = 'owner'`, pointing at an `organizations` row with
  `slug = 'default'`. Task 3's `requireOrgMember` depends on this existing for the deployed admin
  account to be able to use any org-scoped route at all.

- [ ] **Step 1: Write the migration**

Create `server/db/migrations/0018_tenant_one_backfill.sql`:

```sql
INSERT INTO organizations (name, slug)
SELECT 'Default Organization', 'default'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'default');

INSERT INTO memberships (user_id, organization_id, role)
SELECT u.id, (SELECT id FROM organizations WHERE slug = 'default'), 'owner'
FROM users u
WHERE u.is_admin = true
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id);
```

- [ ] **Step 2: Write the failing test**

Create `server/src/db/schema/tenantOneBackfill.test.ts`:

```ts
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
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints.');
}

describe('Tenant #1 backfill', () => {
  it('makes a pre-existing admin the owner of a default organization', async () => {
    const setupPool = new Pool({ connectionString });
    await setupPool.query('DROP SCHEMA IF EXISTS tenant_one_backfill_test CASCADE');
    await setupPool.query('CREATE SCHEMA tenant_one_backfill_test');
    await setupPool.end();

    const scopedPool = new Pool({
      connectionString,
      options: '-c search_path=tenant_one_backfill_test,public',
    });

    let onlyPreBackfillDir: string | undefined;
    try {
      const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      const backfillFile = '0018_tenant_one_backfill.sql';
      const preBackfillFiles = files.filter((f) => f < backfillFile);

      onlyPreBackfillDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drickly-pre-backfill-'));
      for (const f of preBackfillFiles) {
        await fs.copyFile(path.join(migrationsDir, f), path.join(onlyPreBackfillDir, f));
      }

      await runMigrations(scopedPool, onlyPreBackfillDir);

      const admin = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('owner@popupgenix.com', 'h', true) RETURNING id`
      );
      const nonAdmin = await scopedPool.query(
        `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', 'h', false) RETURNING id`
      );

      await runMigrations(scopedPool, migrationsDir);

      const org = await scopedPool.query(`SELECT id FROM organizations WHERE slug = 'default'`);
      expect(org.rows).toHaveLength(1);

      const adminMembership = await scopedPool.query(
        `SELECT role, organization_id FROM memberships WHERE user_id = $1`,
        [admin.rows[0].id]
      );
      expect(adminMembership.rows).toHaveLength(1);
      expect(adminMembership.rows[0].role).toBe('owner');
      expect(adminMembership.rows[0].organization_id).toBe(org.rows[0].id);

      const nonAdminMembership = await scopedPool.query(
        `SELECT id FROM memberships WHERE user_id = $1`,
        [nonAdmin.rows[0].id]
      );
      expect(nonAdminMembership.rows).toHaveLength(0);
    } finally {
      await scopedPool.end();
      if (onlyPreBackfillDir) {
        await fs.rm(onlyPreBackfillDir, { recursive: true, force: true });
      }
    }
  });

  afterAll(async () => {
    const cleanupPool = new Pool({ connectionString });
    await cleanupPool.query('DROP SCHEMA IF EXISTS tenant_one_backfill_test CASCADE');
    await cleanupPool.end();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npx vitest run src/db/schema/tenantOneBackfill.test.ts`
Expected: FAIL — `0018_tenant_one_backfill.sql` doesn't exist yet, so the "pre-backfill" and "full" migration sets are identical and the org/membership assertions fail.

- [ ] **Step 4: Verify the migration file from Step 1 exists, then run the test again**

Run the same command as Step 3.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0018_tenant_one_backfill.sql server/src/db/schema/tenantOneBackfill.test.ts
git commit -m "feat(server): backfill Tenant #1 default org + owner membership for existing admins"
```

---

### Task 2: Permission map

**Files:**
- Create: `server/src/auth/permissions.ts`
- Create: `server/src/auth/permissions.test.ts`

**Interfaces:**
- Produces: `type Role = 'owner' | 'admin' | 'member'`, `type Permission = 'companies.read' |
  'companies.write'`, `hasPermission(role: Role, permission: Permission): boolean`. Consumed by
  Task 3's `requirePermission` middleware.

- [ ] **Step 1: Write the failing test**

Create `server/src/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions.js';

describe('hasPermission', () => {
  it('grants owner both read and write on companies', () => {
    expect(hasPermission('owner', 'companies.read')).toBe(true);
    expect(hasPermission('owner', 'companies.write')).toBe(true);
  });

  it('grants admin both read and write on companies', () => {
    expect(hasPermission('admin', 'companies.read')).toBe(true);
    expect(hasPermission('admin', 'companies.write')).toBe(true);
  });

  it('grants member read but not write on companies', () => {
    expect(hasPermission('member', 'companies.read')).toBe(true);
    expect(hasPermission('member', 'companies.write')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npx vitest run src/auth/permissions.test.ts`
Expected: FAIL with "Cannot find module './permissions.js'".

- [ ] **Step 3: Implement the permission map**

Create `server/src/auth/permissions.ts`:

```ts
export type Role = 'owner' | 'admin' | 'member';
export type Permission = 'companies.read' | 'companies.write';

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(['companies.read', 'companies.write']),
  admin: new Set<Permission>(['companies.read', 'companies.write']),
  member: new Set<Permission>(['companies.read']),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `server/`): `npx vitest run src/auth/permissions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/permissions.ts server/src/auth/permissions.test.ts
git commit -m "feat(server): add static role/permission map for RBAC"
```

---

### Task 3: `requireOrgMember` and `requirePermission` middleware

**Files:**
- Modify: `server/src/auth/middleware.ts`
- Modify: `server/src/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `hasPermission`, `Role`, `Permission` from `./permissions.js` (Task 2).
- Produces: `AuthMiddleware.requireOrgMember: RequestHandler` (attaches `req.membership:
  { organizationId: string; role: Role }`), `AuthMiddleware.requirePermission: (permission:
  Permission) => RequestHandler`. Consumed by Task 4's `companies` router.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/auth/middleware.test.ts` (add this import alongside the existing ones at
the top of the file: `import { createAuthMiddleware } from './middleware.js';` is already there —
just add the new `describe` block at the end, before the final closing of the file):

```ts
describe('requireOrgMember', () => {
  it('rejects a user with no organization membership', async () => {
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('nomembership@b.com', 'h', false) RETURNING id`
    );
    const { requireOrgMember } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: user.rows[0].id, email: 'nomembership@b.com', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    await requireOrgMember(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(req.membership).toBeUndefined();
  });

  it('attaches the membership for a user who belongs to one organization', async () => {
    const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id`);
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('member@acme.test', 'h', false) RETURNING id`
    );
    await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [
      user.rows[0].id,
      org.rows[0].id,
    ]);
    const { requireOrgMember } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: user.rows[0].id, email: 'member@acme.test', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    await requireOrgMember(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.membership).toEqual({ organizationId: org.rows[0].id, role: 'member' });
  });
});

describe('requirePermission', () => {
  it('rejects when there is no membership on the request', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    const next = vi.fn();
    requirePermission('companies.read')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects a member attempting a write permission', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.membership = { organizationId: 'org-1', role: 'member' };
    const next = vi.fn();
    requirePermission('companies.write')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows an owner a write permission', () => {
    const { requirePermission } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.membership = { organizationId: 'org-1', role: 'owner' };
    const next = vi.fn();
    requirePermission('companies.write')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npx vitest run src/auth/middleware.test.ts`
Expected: FAIL — `requireOrgMember`/`requirePermission` don't exist on the object returned by `createAuthMiddleware`.

- [ ] **Step 3: Implement the middleware**

In `server/src/auth/middleware.ts`, add the import and extend the `Request` type (near the top,
alongside the existing `declare global` block):

```ts
import type { Permission, Role } from './permissions.js';
import { hasPermission } from './permissions.js';

export interface Membership {
  organizationId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      membership?: Membership;
    }
  }
}
```

(This replaces the existing narrower `declare global` block that only added `user` — merge the
`membership` field into it rather than declaring the namespace twice.)

Extend the `AuthMiddleware` interface:

```ts
export interface AuthMiddleware {
  optionalAuth: RequestHandler;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  requireOrgMember: RequestHandler;
  requirePermission: (permission: Permission) => RequestHandler;
}
```

Inside `createAuthMiddleware`, add the two new functions (alongside `requireAdmin`) and include
them in the returned object:

```ts
  async function requireOrgMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    try {
      const result = await pool.query<{ organization_id: string; role: Role }>(
        `SELECT organization_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [req.user.sub]
      );
      const membership = result.rows[0];
      if (!membership) {
        next(new HttpError(403, 'Not a member of any organization'));
        return;
      }
      req.membership = { organizationId: membership.organization_id, role: membership.role };
      next();
    } catch (err) {
      next(err);
    }
  }

  function requirePermission(permission: Permission): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.membership) {
        next(new HttpError(403, 'Organization membership required'));
        return;
      }
      if (!hasPermission(req.membership.role, permission)) {
        next(new HttpError(403, 'Insufficient permissions'));
        return;
      }
      next();
    };
  }

  return { optionalAuth, requireAuth, requireAdmin, requireOrgMember, requirePermission };
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npx vitest run src/auth/middleware.test.ts`
Expected: PASS, all tests (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/middleware.ts server/src/auth/middleware.test.ts
git commit -m "feat(server): add requireOrgMember and requirePermission middleware"
```

---

### Task 4: `companies` resource — the first org-scoped B2B endpoint

**Files:**
- Create: `server/src/resources/companies.ts`
- Create: `server/src/resources/companies.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `AuthMiddleware.requireAuth`, `.requireOrgMember`, `.requirePermission('companies.read'
  | 'companies.write')` (Task 3), `asyncHandler` (existing), `HttpError` (existing).
- Produces: `createCompaniesRouter(pool: Pool, auth: AuthMiddleware): Router`, mounted at
  `/api/companies`.

- [ ] **Step 1: Write the failing tests**

Create `server/src/resources/companies.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll, issueTestToken } from '../test/setupTestDb.js';
import { createCompaniesRouter } from './companies.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/companies', createCompaniesRouter(pool, createAuthMiddleware(SECRET, pool)));
  app.use(errorHandler);
  return app;
}

async function createOrgWithMember(orgSlug: string, email: string, role: 'owner' | 'admin' | 'member') {
  const org = await pool.query(`INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`, [orgSlug]);
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ($1, 'h', false) RETURNING id`,
    [email]
  );
  await pool.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`, [
    user.rows[0].id,
    org.rows[0].id,
    role,
  ]);
  const token = await issueTestToken(pool, { sub: user.rows[0].id, email, isAdmin: false }, SECRET, '1h');
  return { orgId: org.rows[0].id as string, userId: user.rows[0].id as string, token };
}

beforeAll(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('companies resource', () => {
  it('lets an owner create and list companies scoped to their own organization', async () => {
    const owner = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Acme Inc', domain: 'acme.com' });
    expect(created.status).toBe(201);
    expect(created.body.organization_id).toBe(owner.orgId);

    const list = await request(app).get('/api/companies').set('Authorization', `Bearer ${owner.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Acme Inc');
  });

  it('ignores a client-supplied organization_id and always derives it from membership', async () => {
    const owner = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const otherOrg = await pool.query(`INSERT INTO organizations (name, slug) VALUES ('org-x', 'org-x') RETURNING id`);
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Sneaky Co', organization_id: otherOrg.rows[0].id });
    expect(created.status).toBe(201);
    expect(created.body.organization_id).toBe(owner.orgId);
  });

  it('rejects a member (read-only role) trying to create a company', async () => {
    const member = await createOrgWithMember('org-a', 'member@org-a.test', 'member');
    const app = buildApp();

    const created = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Not allowed' });
    expect(created.status).toBe(403);
  });

  it('never returns another organization data: list and get-by-id are both blind to Org B', async () => {
    const orgA = await createOrgWithMember('org-a', 'owner@org-a.test', 'owner');
    const orgB = await createOrgWithMember('org-b', 'owner@org-b.test', 'owner');
    const app = buildApp();

    const orgBCompany = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${orgB.token}`)
      .send({ name: 'Org B Co' });
    expect(orgBCompany.status).toBe(201);

    const orgAList = await request(app).get('/api/companies').set('Authorization', `Bearer ${orgA.token}`);
    expect(orgAList.status).toBe(200);
    expect(orgAList.body).toHaveLength(0);

    const orgAGet = await request(app)
      .get(`/api/companies/${orgBCompany.body.id}`)
      .set('Authorization', `Bearer ${orgA.token}`);
    expect(orgAGet.status).toBe(404);
  });

  it('rejects requests from a user with no organization membership', async () => {
    const user = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('nomembership@b.com', 'h', false) RETURNING id`
    );
    const token = await issueTestToken(
      pool,
      { sub: user.rows[0].id, email: 'nomembership@b.com', isAdmin: false },
      SECRET,
      '1h'
    );
    const app = buildApp();

    const list = await request(app).get('/api/companies').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npx vitest run src/resources/companies.test.ts`
Expected: FAIL with "Cannot find module './companies.js'".

- [ ] **Step 3: Implement the resource**

Create `server/src/resources/companies.ts`:

```ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  size_range: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export function createCompaniesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.read'),
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM companies WHERE organization_id = $1 ORDER BY created_at DESC', [
        req.membership!.organizationId,
      ]);
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.read'),
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1 AND organization_id = $2', [
        req.params.id,
        req.membership!.organizationId,
      ]);
      const company = result.rows[0];
      if (!company) throw new HttpError(404, 'Company not found');
      res.json(company);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    auth.requireOrgMember,
    auth.requirePermission('companies.write'),
    asyncHandler(async (req, res) => {
      const body = createCompanySchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO companies
          (organization_id, name, domain, industry, size_range, country, website, linkedin_url, description, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          req.membership!.organizationId,
          body.name,
          body.domain ?? null,
          body.industry ?? null,
          body.size_range ?? null,
          body.country ?? null,
          body.website ?? null,
          body.linkedin_url ?? null,
          body.description ?? null,
          body.metadata,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  return router;
}
```

Note the POST handler never reads `req.body.organization_id` — `createCompanySchema` doesn't even
declare that field, so Zod silently strips it if a caller sends it, and the `organization_id`
column value always comes from `req.membership!.organizationId`. This is what makes the "ignores
a client-supplied organization_id" test in Step 1 pass.

- [ ] **Step 4: Mount the router**

In `server/src/app.ts`, add the import near the other resource imports:

```ts
import { createCompaniesRouter } from './resources/companies.js';
```

And add the mount line near the other `app.use('/api/...', ...)` calls:

```ts
  app.use('/api/companies', createCompaniesRouter(pool, auth));
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npx vitest run src/resources/companies.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/resources/companies.ts server/src/resources/companies.test.ts server/src/app.ts
git commit -m "feat(server): add org-scoped companies resource as the first RBAC-protected B2B route"
```

---

### Task 5: Full verification and app.test.ts smoke check

**Files:**
- Modify: `server/src/app.test.ts` (only if it enumerates mounted routes — check first)

**Interfaces:** none new — this task only verifies nothing else regressed.

- [ ] **Step 1: Check whether `app.test.ts` asserts the full route list**

Run: `grep -n "api/" server/src/app.test.ts`
If it has a test enumerating all mounted `/api/*` prefixes (e.g. a health-check-all-routes test),
add `/api/companies` to that list. If it doesn't (it only tests `/health` and admin bootstrap
behavior per the earlier read of this file), skip straight to Step 2.

- [ ] **Step 2: Run the entire server test suite**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test`
Expected: PASS, all files, zero regressions.

- [ ] **Step 3: Typecheck**

Run (from `server/`): `npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 4: Commit (only if Step 1 required a change)**

```bash
git add server/src/app.test.ts
git commit -m "test(server): cover /api/companies in the app route smoke test"
```
