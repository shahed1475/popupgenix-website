# Phase 2: Auth Hardening & Client Portal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sessions actually invalidatable (real logout, not a no-op), add email verification and password reset, and migrate the parts of the client portal that have no Storage/Realtime dependency off Supabase Auth onto the existing Drickly Express API.

**Architecture:** `server/src/auth/middleware.ts`'s `requireAuth`/`optionalAuth` become session-aware: a JWT alone is no longer sufficient — its `sid` claim must match a non-revoked, non-expired row in a new `sessions` table, looked up via one indexed query per request. Login/signup create that row; logout revokes it; password-reset revokes every session for that user. Email verification and password reset share a `secureToken` utility (random token + stored SHA-256 hash, never the raw token) and a new `EmailSender` abstraction — `ConsoleEmailSender` (logs to stdout) is the only implementation this phase ships, mirroring the existing `AIProvider`/`MockAIProvider` pattern in `worker/`; a real provider (Resend) is Phase 7's job, not this one. On the frontend, `Portal.tsx`, `PortalNavigation.tsx`, `Dashboard.tsx`, and `Feedback.tsx` move onto the same `src/lib/api/` + JWT-in-`localStorage` pattern the 7 already-migrated Admin Panel pages use — these four have zero Storage/Realtime dependency. `Updates.tsx`/`FilesDocuments.tsx`/`Messages.tsx` still depend on Supabase Storage/Realtime respectively and are **not** migrated this phase; their routes are repointed to a new, honest `PortalMigrationPending` page instead of being left silently broken once Supabase auth stops working for the portal.

**Tech Stack:** Node/Express/TypeScript, PostgreSQL, `pg`, `bcryptjs`, `jsonwebtoken`, `zod`, Vitest + `TEST_DATABASE_URL` + `supertest` (server); React + `src/lib/api/*` fetch client (frontend, no new test infrastructure — see Global Constraints).

## Global Constraints

- Backend stays Node/Express/TypeScript — no FastAPI/Python.
- No `organization_id` on any table this phase touches (`sessions`, `email_verification_tokens`, `password_reset_tokens`) — these are Drickly's own single-tenant identity tables, same category as `users`, not B2B growth-engine tables.
- Store only a SHA-256 hash of verification/reset tokens, never the raw token, in the database — matches the existing codebase's care around secrets (bcrypt for passwords, timing-safe dummy-hash comparison in login).
- `EmailSender` gets exactly one implementation this phase: `ConsoleEmailSender` (logs to stdout/console). Do not add a Resend/SMTP implementation — that is explicitly Phase 7 (Notifications/outbox) scope per `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md`.
- React components have **no existing unit-test convention in this repo** — the root `vitest.config.ts` only includes `src/**/*.test.ts` (not `.tsx`), and none of the 7 already-migrated Admin Panel components have component tests. New logic added to `src/lib/api/*.ts` gets `.test.ts` coverage matching the existing `auth.test.ts` mock-`fetch` pattern; the React components themselves (`Portal.tsx`, `Dashboard.tsx`, etc.) are verified by `tsc`/build only, consistent with how the Admin Panel migration was done. Do not introduce `@testing-library/react`, `jsdom`, or any new frontend test tooling in this phase.
- Server-side migration files must not use `CREATE TABLE IF NOT EXISTS`, must use lowercase SQL types, and must not touch any migration file `0001` through `0012` (all pre-existing, already applied) — only new, sequentially-numbered files.
- All new/changed server tests use the existing `TEST_DATABASE_URL` + `createTestPool()`/`truncateAll()` convention.
- `requireAuth`/`optionalAuth` becoming session-aware (DB lookup per request) is a real, deliberate architecture change with a real ripple: `createAuthMiddleware` gains a required `pool` parameter, and every test file that fabricates a JWT via `signAuthToken(...)` directly (bypassing login) must switch to inserting a matching `sessions` row too, via a new shared test helper — otherwise those tests break the moment session validation ships. This ripple is Task 4's entire scope; do not let it bleed into other tasks.

---

### Task 1: `sessions` table

**Files:**
- Create: `server/db/migrations/0013_sessions.sql`
- Test: `server/src/db/schema/sessions.test.ts`

**Interfaces:**
- Produces: `sessions(id, user_id, created_at, expires_at, revoked_at)`.
- Consumes: `users(id)` from `0001_core_schema.sql`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/db/schema/sessions.test.ts
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

describe('sessions schema', () => {
  it('creates a session for a user with a future expiry and no revocation', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@drickly.test', 'h') RETURNING id`);
    const session = await pool.query(
      `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING revoked_at`,
      [user.rows[0].id]
    );
    expect(session.rows[0].revoked_at).toBeNull();
  });

  it('cascades: deleting a user removes their sessions', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('b@drickly.test', 'h') RETURNING id`);
    const session = await pool.query(
      `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
      [user.rows[0].id]
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);
    const remaining = await pool.query(`SELECT id FROM sessions WHERE id = $1`, [session.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- sessions`
Expected: FAIL — `relation "sessions" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0013_sessions.sql
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- sessions`
Expected: PASS (2 tests).

- [ ] **Step 5: Add `sessions` to `truncateAll()`**

Edit `server/src/test/setupTestDb.ts` — add `sessions` to the `TRUNCATE TABLE` list (pre-approved precedent from Phase 1: every task that adds a table also adds it to `truncateAll()`).

- [ ] **Step 6: Commit**

```bash
git add server/db/migrations/0013_sessions.sql server/src/db/schema/sessions.test.ts server/src/test/setupTestDb.ts
git commit -m "feat: add sessions table"
```

---

### Task 2: `secureToken` utility + `EmailSender` abstraction

**Files:**
- Create: `server/src/auth/secureToken.ts`
- Test: `server/src/auth/secureToken.test.ts`
- Create: `server/src/email/EmailSender.ts`
- Create: `server/src/email/ConsoleEmailSender.ts`
- Test: `server/src/email/ConsoleEmailSender.test.ts`

**Interfaces:**
- Produces: `generateSecureToken(): string` (returns a 64-char hex random token), `hashToken(token: string): string` (returns its SHA-256 hex digest). `EmailSender` interface: `send(message: EmailMessage): Promise<void>` where `EmailMessage = { to: string; subject: string; text: string }`. `ConsoleEmailSender` implements it.
- Consumes: Node's built-in `crypto` module only — no new dependencies.

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/auth/secureToken.test.ts
import { describe, expect, it } from 'vitest';
import { generateSecureToken, hashToken } from './secureToken.js';

describe('secureToken', () => {
  it('generates a 64-character hex token, different each call', () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and differently per input', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-a');
    const hash3 = hashToken('token-b');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

```typescript
// server/src/email/ConsoleEmailSender.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ConsoleEmailSender } from './ConsoleEmailSender.js';

describe('ConsoleEmailSender', () => {
  it('logs the message to console.log and resolves', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sender = new ConsoleEmailSender();

    await sender.send({ to: 'a@drickly.test', subject: 'Verify your email', text: 'Click here: ...' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('a@drickly.test')
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Verify your email')
    );
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- secureToken ConsoleEmailSender`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// server/src/auth/secureToken.ts
import { randomBytes, createHash } from 'node:crypto';

export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

```typescript
// server/src/email/EmailSender.ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

```typescript
// server/src/email/ConsoleEmailSender.ts
import type { EmailMessage, EmailSender } from './EmailSender.js';

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[ConsoleEmailSender] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- secureToken ConsoleEmailSender`
Expected: PASS (2 + 1 = 3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/secureToken.ts server/src/auth/secureToken.test.ts server/src/email/EmailSender.ts server/src/email/ConsoleEmailSender.ts server/src/email/ConsoleEmailSender.test.ts
git commit -m "feat: add secureToken utility and EmailSender/ConsoleEmailSender abstraction"
```

---

### Task 3: Session-aware `requireAuth`/`optionalAuth`

**Files:**
- Modify: `server/src/auth/tokens.ts`
- Modify: `server/src/auth/tokens.test.ts`
- Modify: `server/src/auth/middleware.ts`
- Modify: `server/src/auth/middleware.test.ts`
- Modify: `server/src/auth/authRoutes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Produces: `AuthTokenPayload` gains a required `sid: string` field. `createAuthMiddleware(secret: string, pool: Pool): AuthMiddleware` (was `createAuthMiddleware(secret: string)`) — `requireAuth`/`optionalAuth` are now `async`, and reject/skip when `sessions.id = payload.sid` doesn't exist, is revoked, or is expired. Login and signup now create a real `sessions` row and embed its id as `sid`.
- Consumes: `sessions` table (Task 1).
- Note: `middleware.test.ts` inserts `sessions` rows directly to test middleware behavior in isolation; this task also wires real session creation into `authRoutes.ts`'s login/signup handlers (Step 4) — without that, `AuthTokenPayload` requiring `sid` would leave the project not compiling, since those two call sites are the only other production callers of `signAuthToken`. Revoking a session on logout is Task 5, layered on top of the real sessions this task starts creating.

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/auth/tokens.test.ts
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAuthToken, verifyAuthToken } from './tokens.js';

const SECRET = 'test-secret-value-that-is-long-enough';

describe('auth tokens', () => {
  it('round-trips a signed payload including sid', () => {
    const token = signAuthToken({ sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' }, SECRET, '1h');
    const payload = verifyAuthToken(token, SECRET);
    expect(payload).toMatchObject({ sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAuthToken(
      { sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' },
      'other-secret-value-that-is-long-enough',
      '1h'
    );
    expect(() => verifyAuthToken(token, SECRET)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' }, SECRET, { expiresIn: -10 });
    expect(() => verifyAuthToken(expired, SECRET)).toThrow();
  });
});
```

```typescript
// server/src/auth/middleware.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './middleware.js';
import { signAuthToken } from './tokens.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
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

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

async function insertUserAndSession(overrides: { revoked?: boolean; expired?: boolean } = {}) {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ('a@b.com', 'h', false) RETURNING id`
  );
  const expiresAt = overrides.expired ? `now() - interval '1 hour'` : `now() + interval '7 days'`;
  const session = await pool.query(
    `INSERT INTO sessions (user_id, expires_at, revoked_at) VALUES ($1, ${expiresAt}, $2) RETURNING id`,
    [user.rows[0].id, overrides.revoked ? new Date() : null]
  );
  return { userId: user.rows[0].id as string, sessionId: session.rows[0].id as string };
}

describe('auth middleware', () => {
  it('requireAuth rejects a missing token', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const next = vi.fn();
    await requireAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth attaches user for a token with a valid, active session', async () => {
    const { userId, sessionId } = await insertUserAndSession();
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId });
  });

  it('requireAuth rejects an invalid token', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose session has been revoked', async () => {
    const { userId, sessionId } = await insertUserAndSession({ revoked: true });
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose session has expired', async () => {
    const { userId, sessionId } = await insertUserAndSession({ expired: true });
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth rejects a token whose sid matches no session row at all', async () => {
    const { requireAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken(
      { sub: '00000000-0000-0000-0000-000000000000', email: 'a@b.com', isAdmin: false, sid: '00000000-0000-0000-0000-000000000000' },
      SECRET,
      '1h'
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('optionalAuth continues without a token', async () => {
    const { optionalAuth } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    const next = vi.fn();
    await optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('optionalAuth continues without attaching a user when the session is revoked', async () => {
    const { userId, sessionId } = await insertUserAndSession({ revoked: true });
    const { optionalAuth } = createAuthMiddleware(SECRET, pool);
    const token = signAuthToken({ sub: userId, email: 'a@b.com', isAdmin: false, sid: sessionId }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('requireAdmin rejects a non-admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: false, sid: 'session-1' };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('requireAdmin allows an admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET, pool);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: true, sid: 'session-1' };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- tokens middleware`
Expected: FAIL — `sid` missing from type, `createAuthMiddleware` doesn't accept a second argument, `requireAuth`/`optionalAuth` are synchronous.

- [ ] **Step 3: Update `tokens.ts` and `middleware.ts`**

```typescript
// server/src/auth/tokens.ts
import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
  sid: string;
}

export function signAuthToken(payload: AuthTokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAuthToken(token: string, secret: string): AuthTokenPayload {
  return jwt.verify(token, secret) as AuthTokenPayload;
}
```

```typescript
// server/src/auth/middleware.ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { HttpError } from '../lib/httpError.js';
import { verifyAuthToken, type AuthTokenPayload } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export interface AuthMiddleware {
  optionalAuth: RequestHandler;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

function toAuthTokenPayload(payload: AuthTokenPayload): AuthTokenPayload {
  return { sub: payload.sub, email: payload.email, isAdmin: payload.isAdmin, sid: payload.sid };
}

async function loadActiveSession(pool: Pool, sid: string): Promise<boolean> {
  const result = await pool.query<{ revoked_at: string | null; expires_at: string }>(
    'SELECT revoked_at, expires_at FROM sessions WHERE id = $1',
    [sid]
  );
  const session = result.rows[0];
  if (!session) return false;
  if (session.revoked_at) return false;
  if (new Date(session.expires_at) < new Date()) return false;
  return true;
}

export function createAuthMiddleware(secret: string, pool: Pool): AuthMiddleware {
  async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (token) {
      try {
        const payload = verifyAuthToken(token, secret);
        if (await loadActiveSession(pool, payload.sid)) {
          req.user = toAuthTokenPayload(payload);
        }
      } catch {
        // invalid token or DB error on an optional route just means "not authenticated"
      }
    }
    next();
  }

  async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (!token) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    let payload: AuthTokenPayload;
    try {
      payload = verifyAuthToken(token, secret);
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
    try {
      if (!(await loadActiveSession(pool, payload.sid))) {
        next(new HttpError(401, 'Session has been revoked or expired'));
        return;
      }
    } catch (err) {
      next(err);
      return;
    }
    req.user = toAuthTokenPayload(payload);
    next();
  }

  function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    if (!req.user.isAdmin) {
      next(new HttpError(403, 'Admin access required'));
      return;
    }
    next();
  }

  return { optionalAuth, requireAuth, requireAdmin };
}
```

- [ ] **Step 4: Wire real session creation into login/signup (required for the codebase to compile)**

`AuthTokenPayload` now requires `sid`, but `authRoutes.ts`'s login/signup handlers still call `signAuthToken({ sub, email, isAdmin }, ...)` without one — this step is not optional polish, the project will not typecheck without it. Add to `server/src/auth/authRoutes.ts`, right after the existing `createUser` function:

```typescript
async function createSession(pool: Pool, userId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [userId]
  );
  return result.rows[0].id;
}
```

Change the `/signup` handler's success path from:
```typescript
      const user = await createUser(pool, body.email, body.password, body.full_name, false);
      res.status(201).json(toPublicUser(user));
```
to:
```typescript
      const user = await createUser(pool, body.email, body.password, body.full_name, false);
      const sid = await createSession(pool, user.id);
      const token = signAuthToken({ sub: user.id, email: user.email, isAdmin: user.is_admin, sid }, jwtSecret, jwtExpiresIn);
      res.status(201).json({ token, user: toPublicUser(user) });
```

Change the `/login` handler's success path from:
```typescript
      const token = signAuthToken(
        { sub: user.id, email: user.email, isAdmin: user.is_admin },
        jwtSecret,
        jwtExpiresIn
      );
      res.json({ token, user: toPublicUser(user) });
```
to:
```typescript
      const sid = await createSession(pool, user.id);
      const token = signAuthToken(
        { sub: user.id, email: user.email, isAdmin: user.is_admin, sid },
        jwtSecret,
        jwtExpiresIn
      );
      res.json({ token, user: toPublicUser(user) });
```

No new test is needed for this step: `authRoutes.test.ts`'s existing "login + me" test (`logs in and returns a usable token`) already exercises this end-to-end — before this step it passed because `requireAuth` was stateless; after this step it passes only if login actually creates a matching session row, making it a real regression check rather than a cosmetic one.

- [ ] **Step 5: Update `app.ts` to pass `pool`**

```typescript
// server/src/app.ts — only the changed line
  const auth = createAuthMiddleware(jwtSecret, pool);
```

(This line currently reads `const auth = createAuthMiddleware(jwtSecret);` — add `, pool` as the second argument. No other line in `app.ts` changes.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- tokens middleware authRoutes`
Expected: PASS (3 + 10 = 13 tests in tokens/middleware; authRoutes' existing tests should also still pass, now for real reasons per Step 4's note).

**Do not run the full suite yet** — every other resource test file that calls `createAuthMiddleware(SECRET)` (missing the new `pool` argument) or `signAuthToken({...})` without a `sid` will still fail to compile. That is expected and is Task 4's entire scope, not a regression to fix here.

- [ ] **Step 7: Commit**

```bash
git add server/src/auth/tokens.ts server/src/auth/tokens.test.ts server/src/auth/middleware.ts server/src/auth/middleware.test.ts server/src/auth/authRoutes.ts server/src/app.ts
git commit -m "feat: make requireAuth/optionalAuth session-aware and wire real session creation into login/signup"
```

---

### Task 4: Migrate every existing test to session-aware token issuance

**Files:**
- Modify: `server/src/test/setupTestDb.ts` (add one new export)
- Modify: `server/src/auth/authRoutes.test.ts`
- Modify: `server/src/resources/projects.test.ts`
- Modify: `server/src/resources/feedback.test.ts`
- Modify: `server/src/resources/quoteRequests.test.ts`
- Modify: `server/src/resources/invoices.test.ts`
- Modify: `server/src/resources/contactSubmissions.test.ts`
- Modify: `server/src/resources/services.test.ts`
- Modify: `server/src/resources/homepageContent.test.ts`

**Interfaces:**
- Consumes: `sessions` table (Task 1), session-aware `createAuthMiddleware` (Task 3).
- Produces: `issueTestToken(pool, payload, secret, expiresIn): Promise<string>` in `server/src/test/setupTestDb.ts` — inserts a `sessions` row for `payload.sub`/`payload.sid`-less input (it generates the session first, then signs), and returns a JWT whose `sid` matches that row. Replaces every direct `signAuthToken(...)` call in test files. The *production* code in `authRoutes.ts` already calls `signAuthToken` with a real `sid` from a real session row (wired in Task 3, Step 4) — leave those two call sites alone.

This is a mechanical, uniform transformation applied to every one of the 31 test-side `signAuthToken(...)` call sites across the 8 files above (`server/src/auth/tokens.ts` and `server/src/auth/authRoutes.ts` are production code — do not touch their `signAuthToken` calls). The exact rule and two fully worked examples are given below; apply the identical rule to every remaining call site, then let the full suite prove nothing was missed.

- [ ] **Step 1: Add the shared helper**

```typescript
// server/src/test/setupTestDb.ts — add this export; do not change createTestPool/truncateAll
import { signAuthToken, type AuthTokenPayload } from '../auth/tokens.js';

export async function issueTestToken(
  pool: Pool,
  payload: Omit<AuthTokenPayload, 'sid'>,
  secret: string,
  expiresIn: string
): Promise<string> {
  const session = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '7 days') RETURNING id`,
    [payload.sub]
  );
  return signAuthToken({ ...payload, sid: session.rows[0].id }, secret, expiresIn);
}
```

(Add the `import { signAuthToken, type AuthTokenPayload } from '../auth/tokens.js';` line near the top of `setupTestDb.ts`, alongside its existing imports.)

- [ ] **Step 2: Apply the transformation rule — two worked examples**

**The rule:** every call of the shape
```typescript
const xToken = signAuthToken({ sub: <id>, email: <email>, isAdmin: <bool> }, SECRET, '1h');
```
becomes
```typescript
const xToken = await issueTestToken(pool, { sub: <id>, email: <email>, isAdmin: <bool> }, SECRET, '1h');
```
— add `await`, replace `signAuthToken(` with `issueTestToken(pool, `, keep everything else (including the exact payload object and the `SECRET, '1h'` tail) identical. Remove the now-unused `import { signAuthToken } from './tokens.js';` (or `'../auth/tokens.js'`) from each file once no call sites remain, and add `import { issueTestToken } from '../test/setupTestDb.js';` (adjust the relative path per file location) alongside the existing `createTestPool`/`truncateAll` import — most files already import from that module, so this is usually just adding `issueTestToken` to an existing import line.

**Worked example 1 — `server/src/resources/projects.test.ts`** (6 call sites in this file; here are the first two, apply identically to the rest):

Before:
```typescript
const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
const clientAToken = signAuthToken({ sub: clientA.rows[0].id, email: 'a@drickly.test', isAdmin: false }, SECRET, '1h');
```
After:
```typescript
const adminToken = await issueTestToken(pool, { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
const clientAToken = await issueTestToken(pool, { sub: clientA.rows[0].id, email: 'a@drickly.test', isAdmin: false }, SECRET, '1h');
```
Also update this file's `buildApp()` to pass `pool`: `createAuthMiddleware(SECRET, pool)` (was `createAuthMiddleware(SECRET)`).

**Worked example 2 — `server/src/auth/authRoutes.test.ts`** (2 call sites, in the "admin user management" `it` block):

Before:
```typescript
const { signAuthToken } = await import('./tokens.js');
const adminToken = signAuthToken(
  { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true },
  SECRET,
  '1h'
);
const clientToken = signAuthToken(
  { sub: client.rows[0].id, email: 'client@drickly.test', isAdmin: false },
  SECRET,
  '1h'
);
```
After:
```typescript
const { issueTestToken } = await import('../test/setupTestDb.js');
const adminToken = await issueTestToken(
  pool,
  { sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true },
  SECRET,
  '1h'
);
const clientToken = await issueTestToken(
  pool,
  { sub: client.rows[0].id, email: 'client@drickly.test', isAdmin: false },
  SECRET,
  '1h'
);
```
Also update this file's `buildApp()` to pass `pool` to `createAuthMiddleware(SECRET, pool)`.

- [ ] **Step 3: Apply the identical rule to the remaining 6 files**

`feedback.test.ts` (5 call sites), `quoteRequests.test.ts` (3), `invoices.test.ts` (2), `contactSubmissions.test.ts` (3), `services.test.ts` (3), `homepageContent.test.ts` (3). For each: replace every `signAuthToken(...)` call per the rule above, update the file's `buildApp()`/router-construction call to pass `pool` into `createAuthMiddleware(SECRET, pool)`, fix imports (drop `signAuthToken` import if no longer used in that file, add `issueTestToken` to the existing `setupTestDb.js` import).

- [ ] **Step 4: Run the full server suite**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test` (no filter) from `server/`.
Expected: PASS, all files — this is the acceptance criterion for this task: if any file still fails, it means a `signAuthToken(...)` call site or a `createAuthMiddleware(SECRET)` call was missed. Before this task there were 97 tests across 28 files (Phase 1's final count); this task changes call sites, not test counts, so 97/28 should hold exactly.

- [ ] **Step 5: Commit**

```bash
git add server/src/test/setupTestDb.ts server/src/auth/authRoutes.test.ts server/src/resources/projects.test.ts server/src/resources/feedback.test.ts server/src/resources/quoteRequests.test.ts server/src/resources/invoices.test.ts server/src/resources/contactSubmissions.test.ts server/src/resources/services.test.ts server/src/resources/homepageContent.test.ts
git commit -m "test: migrate all test-side token issuance to session-aware issueTestToken"
```

---

### Task 5: Real revocation on logout

**Files:**
- Modify: `server/src/auth/authRoutes.ts`
- Modify: `server/src/auth/authRoutes.test.ts`

**Interfaces:**
- Consumes: `sessions` table (Task 1), session-aware middleware and real session creation on login/signup (Task 3).
- Produces: `POST /api/auth/logout` now requires `auth.requireAuth` and revokes the caller's session (`UPDATE sessions SET revoked_at = now() WHERE id = $1`), returning `204` — after this, the token used to log out is rejected by `requireAuth` on any subsequent request.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/auth/authRoutes.test.ts — add this new describe block
describe('logout revokes the session', () => {
  it('rejects the token on any request after logout', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    await request(app).post('/api/auth/signup').send({ email: 'logout@drickly.test', password: 'longenough1' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logout@drickly.test', password: 'longenough1' });
    const token = login.body.token as string;

    const meBeforeLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meBeforeLogout.status).toBe(200);

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(204);

    const meAfterLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meAfterLogout.status).toBe(401);
  });

  it('rejects logout without a token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});
```

Also update `buildApp()` in this file (already done in Task 4) to pass `pool` — no further change needed there.

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- authRoutes`
Expected: FAIL — `meAfterLogout.status` is `200`, not `401` (logout is currently a no-op); `logout` without a token currently returns `204`, not `401`.

- [ ] **Step 3: Update `authRoutes.ts`**

Change the `/logout` route from:
```typescript
  router.post('/logout', (_req, res) => {
    res.status(204).send();
  });
```
to:
```typescript
  router.post(
    '/logout',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [req.user!.sid]);
      res.status(204).send();
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- authRoutes`
Expected: PASS. Then run the full suite: `npm test` — expect all files passing, count now 97 + 2 new tests = 99 across 28 files (no new files this task).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/authRoutes.ts server/src/auth/authRoutes.test.ts
git commit -m "feat: create a real session on login/signup, revoke it on logout"
```

---

### Task 6: Email verification

**Files:**
- Create: `server/db/migrations/0014_email_verification.sql`
- Test: `server/src/db/schema/emailVerification.test.ts`
- Modify: `server/src/auth/authRoutes.ts`
- Modify: `server/src/auth/authRoutes.test.ts`
- Modify: `server/src/app.ts` (pass an `EmailSender` into `createAuthRoutes`)

**Interfaces:**
- Produces: `users.email_verified_at timestamptz` (nullable, new column via `ALTER TABLE`), `email_verification_tokens(id, user_id, token_hash, expires_at, used_at, created_at)`. `POST /api/auth/verify-email/request` (requires `auth.requireAuth`; no-ops with `200` if already verified; otherwise creates a token, emails it via the injected `EmailSender`, returns `202`). `POST /api/auth/verify-email/confirm` (public; body `{ token }`; sets `users.email_verified_at`, marks the token used; `400` on invalid/expired/already-used token).
- Consumes: `secureToken`/`EmailSender` (Task 2), `users` table (`0001`).

- [ ] **Step 1: Write the failing schema test**

```typescript
// server/src/db/schema/emailVerification.test.ts
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

describe('email verification schema', () => {
  it('defaults users.email_verified_at to null', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@drickly.test', 'h') RETURNING email_verified_at`);
    expect(user.rows[0].email_verified_at).toBeNull();
  });

  it('enforces a unique token_hash and cascades on user deletion', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('b@drickly.test', 'h') RETURNING id`);
    const token = await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 day') RETURNING id`,
      [user.rows[0].id]
    );
    await expect(
      pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 day')`,
        [user.rows[0].id]
      )
    ).rejects.toThrow();

    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);
    const remaining = await pool.query(`SELECT id FROM email_verification_tokens WHERE id = $1`, [token.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="postgresql://drickly_test:drickly_test@localhost:15432/drickly_test" npm test -- emailVerification`
Expected: FAIL — `column "email_verified_at" does not exist` / `relation "email_verification_tokens" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0014_email_verification.sql
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens(user_id);
```

- [ ] **Step 4: Run test to verify it passes; add table to `truncateAll()`**

Run: `npm test -- emailVerification` → PASS (2 tests). Then add `email_verification_tokens` to `server/src/test/setupTestDb.ts`'s `truncateAll()`.

- [ ] **Step 5: Write the failing route tests**

First, update `buildApp()` in this file to accept and pass an `EmailSender`, so tests can capture the raw token from a stubbed sender instead of the DB (which only ever stores the hash):

```typescript
// server/src/auth/authRoutes.test.ts — replace buildApp() with this version
import type { EmailSender, EmailMessage } from '../email/EmailSender.js';

function buildApp(sender: EmailSender = { send: async () => {} }) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(pool, createAuthMiddleware(SECRET, pool), SECRET, '1h', sender));
  app.use(errorHandler);
  return app;
}
```

Then add this new describe block, which drives the full request+confirm round trip through the stubbed `EmailSender`:

```typescript
describe('email verification', () => {
  it('sends a verification email, then confirms it and marks the user verified', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const sentMessages: EmailMessage[] = [];
    const app = buildApp({ send: async (message) => { sentMessages.push(message); } });
    await request(app).post('/api/auth/signup').send({ email: 'verify@drickly.test', password: 'longenough1' });
    const login = await request(app).post('/api/auth/login').send({ email: 'verify@drickly.test', password: 'longenough1' });
    const token = login.body.token as string;

    const requestRes = await request(app).post('/api/auth/verify-email/request').set('Authorization', `Bearer ${token}`);
    expect(requestRes.status).toBe(202);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].to).toBe('verify@drickly.test');

    const rawToken = sentMessages[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(rawToken).toBeDefined();

    const confirmRes = await request(app).post('/api/auth/verify-email/confirm').send({ token: rawToken });
    expect(confirmRes.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.email_verified_at).not.toBeNull();

    const reuse = await request(app).post('/api/auth/verify-email/confirm').send({ token: rawToken });
    expect(reuse.status).toBe(400);
  });

  it('rejects confirm with an invalid token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/verify-email/confirm').send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- authRoutes`
Expected: FAIL — the two new routes don't exist, `createAuthRoutes` doesn't accept a 5th `sender` argument yet.

- [ ] **Step 7: Update `authRoutes.ts` and `app.ts`**

Add to the top-level imports in `authRoutes.ts`:
```typescript
import { generateSecureToken, hashToken } from './secureToken.js';
import type { EmailSender } from '../email/EmailSender.js';
```

Change `createAuthRoutes`'s signature:
```typescript
export function createAuthRoutes(
  pool: Pool,
  auth: AuthMiddleware,
  jwtSecret: string,
  jwtExpiresIn: string,
  emailSender: EmailSender
): Router {
```

Add `toPublicUser` to include the new column — change:
```typescript
function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    is_admin: row.is_admin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```
to:
```typescript
function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    is_admin: row.is_admin,
    email_verified_at: row.email_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```
and add `email_verified_at: string | null;` to the `UserRow` interface.

Add the two new routes (place after the existing `/logout` route):
```typescript
  router.post(
    '/verify-email/request',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const userResult = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.sub]);
      const user = userResult.rows[0];
      if (!user) throw new HttpError(404, 'User not found');
      if (user.email_verified_at) {
        res.status(200).json({ alreadyVerified: true });
        return;
      }
      const rawToken = generateSecureToken();
      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
        [user.id, hashToken(rawToken)]
      );
      await emailSender.send({
        to: user.email,
        subject: 'Verify your email',
        text: `Confirm your email by visiting: /verify-email?token=${rawToken}`,
      });
      res.status(202).json({ sent: true });
    })
  );

  router.post(
    '/verify-email/confirm',
    asyncHandler(async (req, res) => {
      const body = z.object({ token: z.string().min(1) }).parse(req.body);
      const tokenHash = hashToken(body.token);
      const result = await pool.query<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
        'SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      const record = result.rows[0];
      if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
        throw new HttpError(400, 'Invalid or expired verification token');
      }
      await pool.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [record.id]);
      await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [record.user_id]);
      res.status(200).json({ verified: true });
    })
  );
```

In `server/src/app.ts`, import and construct the email sender, and pass it through:
```typescript
import { ConsoleEmailSender } from './email/ConsoleEmailSender.js';
```
and change:
```typescript
  app.use('/api/auth', createAuthRoutes(pool, auth, jwtSecret, jwtExpiresIn));
```
to:
```typescript
  app.use('/api/auth', createAuthRoutes(pool, auth, jwtSecret, jwtExpiresIn, new ConsoleEmailSender()));
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- authRoutes`, then the full suite `npm test`.
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/db/migrations/0014_email_verification.sql server/src/db/schema/emailVerification.test.ts server/src/test/setupTestDb.ts server/src/auth/authRoutes.ts server/src/auth/authRoutes.test.ts server/src/app.ts
git commit -m "feat: add email verification request/confirm flow"
```

---

### Task 7: Password reset

**Files:**
- Create: `server/db/migrations/0015_password_reset.sql`
- Test: `server/src/db/schema/passwordReset.test.ts`
- Modify: `server/src/auth/authRoutes.ts`
- Modify: `server/src/auth/authRoutes.test.ts`

**Interfaces:**
- Produces: `password_reset_tokens(id, user_id, token_hash, expires_at, used_at, created_at)`. `POST /api/auth/password-reset/request` (public; body `{ email }`; **always** returns `202` regardless of whether the email exists — do not leak account existence; creates a token + emails it only if the account exists). `POST /api/auth/password-reset/confirm` (public; body `{ token, password }`; sets a new `password_hash`, marks the token used, and revokes **every** session for that user — a password reset must force re-login everywhere).
- Consumes: `secureToken`/`EmailSender` (Task 2), `sessions` (Task 1), `users` (`0001`).

- [ ] **Step 1: Write the failing schema test**

```typescript
// server/src/db/schema/passwordReset.test.ts
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

describe('password_reset_tokens schema', () => {
  it('enforces a unique token_hash and cascades on user deletion', async () => {
    const user = await pool.query(`INSERT INTO users (email, password_hash) VALUES ('a@drickly.test', 'h') RETURNING id`);
    const token = await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 hour') RETURNING id`,
      [user.rows[0].id]
    );
    await expect(
      pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, 'hash-1', now() + interval '1 hour')`,
        [user.rows[0].id]
      )
    ).rejects.toThrow();

    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);
    const remaining = await pool.query(`SELECT id FROM password_reset_tokens WHERE id = $1`, [token.rows[0].id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- passwordReset`
Expected: FAIL — table doesn't exist.

- [ ] **Step 3: Write the migration**

```sql
-- server/db/migrations/0015_password_reset.sql
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
```

- [ ] **Step 4: Run test to verify it passes; add table to `truncateAll()`**

Run: `npm test -- passwordReset` → PASS (1 test). Add `password_reset_tokens` to `truncateAll()` in `setupTestDb.ts`.

- [ ] **Step 5: Write the failing route tests**

```typescript
// server/src/auth/authRoutes.test.ts — add this new describe block
describe('password reset', () => {
  it('returns 202 for both an existing and a nonexistent email, without leaking which', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    await request(app).post('/api/auth/signup').send({ email: 'reset@drickly.test', password: 'longenough1' });

    const existing = await request(app).post('/api/auth/password-reset/request').send({ email: 'reset@drickly.test' });
    expect(existing.status).toBe(202);

    const nonexistent = await request(app).post('/api/auth/password-reset/request').send({ email: 'nobody@drickly.test' });
    expect(nonexistent.status).toBe(202);
  });

  it('confirms a reset, allows login with the new password, and revokes the old session', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const sentMessages: { to: string; subject: string; text: string }[] = [];
    const app = buildApp({ send: async (message) => { sentMessages.push(message); } });
    await request(app).post('/api/auth/signup').send({ email: 'reset2@drickly.test', password: 'oldpassword1' });
    const login = await request(app).post('/api/auth/login').send({ email: 'reset2@drickly.test', password: 'oldpassword1' });
    const oldToken = login.body.token as string;

    await request(app).post('/api/auth/password-reset/request').send({ email: 'reset2@drickly.test' });
    expect(sentMessages).toHaveLength(1);
    const rawToken = sentMessages[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(rawToken).toBeDefined();

    const confirm = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, password: 'newpassword1' });
    expect(confirm.status).toBe(200);

    const oldTokenNowRejected = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(oldTokenNowRejected.status).toBe(401);

    const loginOldPassword = await request(app).post('/api/auth/login').send({ email: 'reset2@drickly.test', password: 'oldpassword1' });
    expect(loginOldPassword.status).toBe(401);

    const loginNewPassword = await request(app).post('/api/auth/login').send({ email: 'reset2@drickly.test', password: 'newpassword1' });
    expect(loginNewPassword.status).toBe(200);
  });

  it('rejects confirm with an invalid token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/password-reset/confirm').send({ token: 'not-a-real-token', password: 'newpassword1' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- authRoutes`
Expected: FAIL — routes don't exist.

- [ ] **Step 7: Add the two routes to `authRoutes.ts`**

Add `resetRateLimiter` next to the existing `authRateLimiter` declaration:
```typescript
  const resetRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
```
(`createRateLimiter` is already imported at the top of this file.)

Add the routes (after the email-verification routes):
```typescript
  router.post(
    '/password-reset/request',
    resetRateLimiter,
    asyncHandler(async (req, res) => {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const userResult = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
      const user = userResult.rows[0];
      if (user) {
        const rawToken = generateSecureToken();
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
          [user.id, hashToken(rawToken)]
        );
        await emailSender.send({
          to: user.email,
          subject: 'Reset your password',
          text: `Reset your password by visiting: /reset-password?token=${rawToken}`,
        });
      }
      // Always 202, whether or not the email exists — a differing response would let an attacker
      // enumerate registered accounts.
      res.status(202).json({ sent: true });
    })
  );

  router.post(
    '/password-reset/confirm',
    resetRateLimiter,
    asyncHandler(async (req, res) => {
      const body = z.object({ token: z.string().min(1), password: z.string().min(8) }).parse(req.body);
      const tokenHash = hashToken(body.token);
      const result = await pool.query<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
        'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      const record = result.rows[0];
      if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
        throw new HttpError(400, 'Invalid or expired reset token');
      }
      const newPasswordHash = await hashPassword(body.password);
      await pool.query('BEGIN');
      try {
        await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, record.user_id]);
        await pool.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [record.user_id]);
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
      res.status(200).json({ reset: true });
    })
  );
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- authRoutes`, then the full suite `npm test`.
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/db/migrations/0015_password_reset.sql server/src/db/schema/passwordReset.test.ts server/src/test/setupTestDb.ts server/src/auth/authRoutes.ts server/src/auth/authRoutes.test.ts
git commit -m "feat: add password reset request/confirm flow"
```

---

### Task 8: Frontend feedback API client

**Files:**
- Modify: `src/lib/api/feedback.ts`
- Create: `src/lib/api/feedback.test.ts`

**Interfaces:**
- Produces: `listMyFeedback(): Promise<Feedback[]>` (calls `GET /testimonials/mine`), `submitFeedback(input: { client_name: string; client_email: string; client_company?: string | null; project_id?: string | null; rating: number; testimonial: string }): Promise<Feedback>` (calls `POST /testimonials`).
- Consumes: `apiClient` from `./client` (existing), the already-live `GET /api/testimonials/mine` and `POST /api/testimonials` server routes (`server/src/resources/feedback.ts` — unchanged this task, both routes already exist).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/api/feedback.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listMyFeedback, submitFeedback } from './feedback';

function stubStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
}

beforeEach(() => {
  stubStorage();
  vi.stubGlobal('window', { location: { href: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listMyFeedback', () => {
  it('calls GET /testimonials/mine', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listMyFeedback();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/mine');
    expect(init.method).toBe('GET');
  });
});

describe('submitFeedback', () => {
  it('calls POST /testimonials with the given input', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'f1', testimonial: 'Great work', rating: 5 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const input = { client_name: 'Jane', client_email: 'jane@drickly.test', rating: 5, testimonial: 'Great work' };
    await submitFeedback(input);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npm test -- feedback`
Expected: FAIL — `listMyFeedback`/`submitFeedback` are not exported.

- [ ] **Step 3: Add the two functions to `src/lib/api/feedback.ts`**

```typescript
// src/lib/api/feedback.ts — add below the existing Feedback interface and admin functions
export interface SubmitFeedbackInput {
  client_name: string;
  client_email: string;
  client_company?: string | null;
  project_id?: string | null;
  rating: number;
  testimonial: string;
}

export function listMyFeedback(): Promise<Feedback[]> {
  return apiClient.get<Feedback[]>('/testimonials/mine');
}

export function submitFeedback(input: SubmitFeedbackInput): Promise<Feedback> {
  return apiClient.post<Feedback>('/testimonials', input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- feedback`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/feedback.ts src/lib/api/feedback.test.ts
git commit -m "feat: add client-facing feedback API functions (listMyFeedback, submitFeedback)"
```

---

### Task 9: Migrate `Portal.tsx` off Supabase Auth

**Files:**
- Modify: `src/pages/Portal.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `login`, `AdminUser` from `src/lib/api/auth.ts` (existing, unchanged).
- Produces: `Portal.tsx` renders a login form (matching `AdminPanel.tsx`'s form exactly in structure) when no user is authenticated, and the existing child-route `<Routes>` when one is. No Supabase import remains in this file.

- [ ] **Step 1: Replace the file**

```typescript
// src/pages/Portal.tsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminUser, getCurrentUser, login } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PortalNavigation from "@/components/ClientPortal/PortalNavigation";
import Dashboard from "@/components/ClientPortal/Dashboard";
import PortalMigrationPending from "@/components/ClientPortal/PortalMigrationPending";
import Feedback from "@/components/ClientPortal/Feedback";

export default function Portal() {
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const loggedInUser = await login(email, password);
      setUser(loggedInUser);
      toast({ title: "Success", description: "Logged in successfully" });
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid login credentials. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
        <Loader2 className="h-8 w-8 animate-spin text-neon-purple" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent mb-2">
              Client Portal
            </h1>
            <p className="text-gray-300">Access your project dashboard and files</p>
          </div>

          <Card className="p-8 bg-midnight-light/50 border border-gray-700 backdrop-blur-sm">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-foreground/70">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  className="bg-background text-foreground placeholder:text-muted-foreground border-border"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground/70">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoggingIn}
                  className="bg-background text-foreground placeholder:text-muted-foreground border-border"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-neon-purple to-neon-blue hover:opacity-90"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
      <PortalNavigation />
      <div className="container mx-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/files" element={<PortalMigrationPending featureName="Files & Documents" />} />
          <Route path="/updates" element={<PortalMigrationPending featureName="Work Updates" />} />
          <Route path="/messages" element={<PortalMigrationPending featureName="Messages" />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </div>
    </div>
  );
}
```

Note: this task references `PortalMigrationPending` (Task 13) and the migrated `Dashboard`/`Feedback` (Tasks 11/12) — implement this task last among 9-13, or accept that `tsc` won't be clean until all five land. Recommended order within this group: 13 → 11 → 12 → 10 → 9 (build the leaf pieces first, wire the shell last). If executing tasks strictly in numeric order, treat Tasks 9-13 as one atomic unit for the purposes of "does it typecheck" and only run `tsc`/build at the end of Task 13, not after each of 9-12 individually.

- [ ] **Step 2: Typecheck**

Run (from repo root): `npx tsc --noEmit -p tsconfig.b2b.json` (or the project's standard typecheck script) — expect errors referencing `PortalMigrationPending`/updated `Dashboard`/`Feedback` until Tasks 10-13 land; re-run after Task 13 and expect it clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Portal.tsx
git commit -m "feat: migrate Portal.tsx off Supabase Auth onto the Express API"
```

---

### Task 10: Migrate `PortalNavigation.tsx` sign-out

**Files:**
- Modify: `src/components/ClientPortal/PortalNavigation.tsx`

**Interfaces:**
- Consumes: `logout` from `src/lib/api/auth.ts` (existing — clears the local token; the server-side session revocation happens via a real API call added here, matching `AdminSidebar.tsx`'s pattern of calling logout then redirecting).
- Produces: sign-out button that calls the Express logout endpoint (via `apiClient`) and clears the local token, then redirects to `/portal`.

- [ ] **Step 1: Replace the Supabase import and `handleSignOut`**

Change the top of the file from:
```typescript
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  FolderOpen, 
  MessageSquare, 
  LogOut,
  Home,
  Bell
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PortalNavigation() {
  const location = useLocation();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive"
      });
    }
  };
```
to:
```typescript
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { logout } from "@/lib/api/auth";
import { 
  LayoutDashboard, 
  FolderOpen, 
  MessageSquare, 
  LogOut,
  Home,
  Bell
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PortalNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Error revoking session on the server:', error);
      // Fall through: clearing the local token below still logs the user out of this browser
      // even if the server call failed (e.g. network issue), matching the AdminSidebar precedent
      // of best-effort server cleanup with authoritative local cleanup.
    }
    logout();
    toast({
      title: "Signed out successfully",
      description: "You have been logged out of your account.",
    });
    navigate('/portal');
  };
```

The rest of the file (nav items, JSX) is unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.b2b.json` — no new errors introduced by this file (see Task 9's note on when the whole group typechecks cleanly).

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientPortal/PortalNavigation.tsx
git commit -m "feat: migrate PortalNavigation sign-out to the Express API"
```

---

### Task 11: Migrate `Dashboard.tsx`

**Files:**
- Modify: `src/components/ClientPortal/Dashboard.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `src/lib/api/auth.ts`, `listProjects` from `src/lib/api/projects.ts` (both existing, unchanged — `GET /api/projects` already scopes to the caller's own projects for non-admins per `server/src/resources/projects.ts`).
- Produces: same rendered UI as before, sourced from the Express API instead of Supabase.

- [ ] **Step 1: Replace the data-fetching logic**

Change the top of the file from:
```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar, CheckCircle, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  title: string;
  completion_percentage: number;
  next_milestone: string;
  eta_date: string;
  client_user_id: string;
}

interface User {
  id: string;
  email: string;
  full_name: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getUser();
    getUserProject();
  }, []);

  const getUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();
        
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          full_name: profile?.full_name || authUser.email || 'Client'
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive"
      });
    }
  };

  const getUserProject = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: projects } = await supabase
          .from('projects')
          .select('*')
          .eq('client_user_id', authUser.id)
          .limit(1);
        
        if (projects && projects.length > 0) {
          setProject(projects[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching project:', error);
      toast({
        title: "Error",
        description: "Failed to load project information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
```
to:
```typescript
import { useEffect, useState } from "react";
import { getCurrentUser, type AdminUser } from "@/lib/api/auth";
import { listProjects, type Project } from "@/lib/api/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar, CheckCircle, Clock, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getUser();
    getUserProject();
  }, []);

  const getUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive"
      });
    }
  };

  const getUserProject = async () => {
    try {
      const projects = await listProjects();
      if (projects.length > 0) {
        setProject(projects[0]);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
      toast({
        title: "Error",
        description: "Failed to load project information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
```

The rest of the file (JSX) is unchanged except two references: `Welcome {user?.full_name} 👋` becomes `Welcome {user?.full_name ?? user?.email} 👋` (the Express `AdminUser` type's `full_name` is nullable, matching `src/lib/api/auth.ts`'s existing interface — fall back to email when null, same behavior the original Supabase-backed code had via `profile?.full_name || authUser.email`), and the `<User className=...` icon reference in the "No Active Project" empty state becomes `<UserIcon className=...` (renamed on import to avoid shadowing the removed local `User` interface — purely a rename, same icon).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.b2b.json`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientPortal/Dashboard.tsx
git commit -m "feat: migrate Dashboard.tsx off Supabase onto the Express API"
```

---

### Task 12: Migrate `Feedback.tsx`

**Files:**
- Modify: `src/components/ClientPortal/Feedback.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `src/lib/api/auth.ts`, `listMyFeedback`/`submitFeedback` from `src/lib/api/feedback.ts` (Task 8).
- Produces: same rendered UI, sourced from the Express API. The original component looked up the user's `project_id` before submitting; `POST /api/testimonials` doesn't require one (`project_id` is nullable server-side per `server/src/resources/feedback.ts`'s schema) — this task submits feedback without a project lookup, which is a legitimate simplification since the server route never used `project_id` for anything but storage, and the client-scoping the original code was doing (fetching "my project" first) is now done implicitly server-side via the JWT's email/session.

- [ ] **Step 1: Replace the data-fetching and submit logic**

Change the top of the file from:
```typescript
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, CheckCircle, Clock, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Feedback {
  id: string;
  testimonial: string;
  rating: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  project_id: string;
}

export default function Feedback() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [newFeedback, setNewFeedback] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getFeedbacks();
  }, []);

  const getFeedbacks = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user's project first
            const { data: projects } = await supabase
              .from('projects')
              .select('id')
              .eq('client_user_id', user.id);

          if (projects && projects.length > 0) {
            const { data: feedbackData } = await supabase
              .from('feedback')
              .select('*')
              .eq('project_id', projects[0].id)
              .is('deleted_at', null)
              .order('created_at', { ascending: false });

            setFeedbacks(feedbackData || []);
          }
      }
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: "Error",
        description: "Failed to load feedback history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    if (!newFeedback.trim()) {
      toast({
        title: "Error",
        description: "Please enter your feedback",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user's project
          const { data: projects } = await supabase
            .from('projects')
            .select('id')
            .eq('client_user_id', user.id);

        if (projects && projects.length > 0) {
          const { error } = await supabase
            .from('feedback')
            .insert({
              testimonial: newFeedback,
              rating: rating,
              project_id: projects[0].id,
              status: 'pending',
              client_id: user.id,
              client_name: user.email || 'Anonymous',
              client_email: user.email || ''
            });

          if (error) throw error;

          toast({
            title: "Success",
            description: "Your feedback has been submitted for review!",
          });

          setNewFeedback("");
          setRating(5);
          getFeedbacks(); // Refresh the list
        }
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };
```
to:
```typescript
import { useState, useEffect } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import { listMyFeedback, submitFeedback as submitFeedbackApi, type Feedback } from "@/lib/api/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, CheckCircle, Clock, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [newFeedback, setNewFeedback] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getFeedbacks();
  }, []);

  const getFeedbacks = async () => {
    setLoading(true);
    try {
      const feedbackData = await listMyFeedback();
      setFeedbacks(feedbackData);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: "Error",
        description: "Failed to load feedback history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!newFeedback.trim()) {
      toast({
        title: "Error",
        description: "Please enter your feedback",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      await submitFeedbackApi({
        client_name: user.full_name || user.email,
        client_email: user.email,
        rating,
        testimonial: newFeedback,
      });

      toast({
        title: "Success",
        description: "Your feedback has been submitted for review!",
      });

      setNewFeedback("");
      setRating(5);
      getFeedbacks(); // Refresh the list
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };
```

Two further changes in the JSX below (unrelated lines are unchanged):
1. The default export name changed from `Feedback` to `FeedbackPage` — because the file now imports a type also named `Feedback` from `@/lib/api/feedback`. Update the `onClick={submitFeedback}` button handler reference to `onClick={handleSubmitFeedback}` (was calling the now-renamed local function).
2. Update `Portal.tsx`'s import (Task 9 already imports `Feedback` from this file as its default export — that still works unchanged, since the *file's* default export is still importable as any local name; `Portal.tsx`'s `import Feedback from "@/components/ClientPortal/Feedback";` needs no change since default exports are renamed freely at the import site).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.b2b.json`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientPortal/Feedback.tsx
git commit -m "feat: migrate Feedback.tsx off Supabase onto the Express API"
```

---

### Task 13: `PortalMigrationPending` component, route repointing, and dead-code cleanup

**Files:**
- Create: `src/components/ClientPortal/PortalMigrationPending.tsx`
- Delete: `src/pages/ClientPortal.tsx`
- Delete: `src/pages/AdminSignup.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AdminPanel/AdminSidebar.tsx`

**Interfaces:**
- Produces: `PortalMigrationPending({ featureName }: { featureName: string })` — an honest, working "this feature is being migrated" page (not a broken stub of the real feature), used by `Portal.tsx` (Task 9) for the `/files`, `/updates`, `/messages` routes until Phase 4/5 land.
- Removes: the `/client/*` route and `ClientPortal.tsx` (superseded by `/portal`, per the decision recorded in `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md`), the dead/unrouted `AdminSignup.tsx` (confirmed unrouted in `src/App.tsx` — grep for `AdminSignup` before deleting to be sure nothing else references it), and the legacy `supabase.auth.signOut()` best-effort cleanup call in `AdminSidebar.tsx` (Express logout — already real and authoritative since `server/`'s `POST /api/auth/logout` was already live before this phase, and is now genuinely session-revoking per Task 5).

- [ ] **Step 1: Create `PortalMigrationPending.tsx`**

```typescript
// src/components/ClientPortal/PortalMigrationPending.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Wrench } from "lucide-react";

interface PortalMigrationPendingProps {
  featureName: string;
}

export default function PortalMigrationPending({ featureName }: PortalMigrationPendingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light p-6">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
          <CardContent className="text-center py-16">
            <Wrench className="h-12 w-12 text-neon-purple mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{featureName} is being upgraded</h2>
            <p className="text-gray-300">
              We're moving this feature to our new infrastructure. It will be back shortly — thanks for your
              patience in the meantime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `AdminSignup.tsx` is truly unreferenced, then delete both dead pages**

```bash
grep -rn "AdminSignup" src/ --include="*.tsx" --include="*.ts"
```
Expected: only `src/pages/AdminSignup.tsx` itself (its own file, no importers) — confirming the Phase 1 audit finding that it's dead/unrouted code. If any importer turns up, STOP and report BLOCKED rather than deleting.

```bash
rm src/pages/ClientPortal.tsx src/pages/AdminSignup.tsx
```

- [ ] **Step 3: Update `src/App.tsx`**

Remove the `ClientPortal` import and its route:
```typescript
import ClientPortal from "./pages/ClientPortal";
```
(delete this line)
```typescript
        <Route path="/client/*" element={<ClientPortal />} />
```
(delete this line)

The rest of `App.tsx` is unchanged — `/portal/*` already routes to `Portal` (Task 9 changed what's inside `Portal`, not this routing line).

- [ ] **Step 4: Remove the legacy Supabase sign-out call in `AdminSidebar.tsx`**

Change:
```typescript
import { logout } from "@/lib/api/auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
```
to:
```typescript
import { logout } from "@/lib/api/auth";
import { useToast } from "@/hooks/use-toast";
```
and change:
```typescript
  const handleSignOut = async () => {
    logout();
    try {
      await supabase.auth.signOut();
    } catch {
      // best-effort cleanup of any lingering Supabase session; the new API logout above is authoritative
    }
    toast({
```
to:
```typescript
  const handleSignOut = async () => {
    logout();
    toast({
```

- [ ] **Step 5: Typecheck the whole frontend**

Run: `npx tsc --noEmit -p tsconfig.b2b.json` (or the repo's standard command — check `package.json`'s `typecheck:b2b` script). This is the point where Tasks 9-13's cross-references (Portal → PortalMigrationPending/Dashboard/Feedback) all resolve — expect zero errors now.

Also run: `npm run build` (root) to confirm the production Vite build succeeds with `ClientPortal.tsx`/`AdminSignup.tsx` removed and no dangling imports.

- [ ] **Step 6: Commit**

```bash
git add src/components/ClientPortal/PortalMigrationPending.tsx src/App.tsx src/components/AdminPanel/AdminSidebar.tsx
git rm src/pages/ClientPortal.tsx src/pages/AdminSignup.tsx
git commit -m "feat: add PortalMigrationPending, remove ClientPortal/AdminSignup dead code and legacy Supabase signOut cleanup"
```

---

## Definition of Done for Phase 2

- [ ] Full server suite passes (`npm test` in `server/`, no filter) — expect roughly 97 (Phase 1 baseline) + ~20 new tests across Tasks 1-7.
- [ ] Root frontend suite passes (`npm test` at repo root) — the two new `src/lib/api/feedback.test.ts` tests plus all pre-existing `src/lib/api/*.test.ts` tests.
- [ ] `npx tsc --noEmit -p tsconfig.b2b.json` and `npm run build` both succeed with zero errors.
- [ ] A logged-out JWT is rejected by `requireAuth` on the very next request (proven by `authRoutes.test.ts`'s logout test) — this is the actual "sessions must be invalidatable" requirement being met, not just a schema existing.
- [ ] A password reset revokes every existing session for that user, not just the one used to request the reset.
- [ ] No file under `src/` imports `@/integrations/supabase/client` from `Portal.tsx`, `PortalNavigation.tsx`, `Dashboard.tsx`, or the renamed `Feedback.tsx` (`FeedbackPage`) — `grep -rn "integrations/supabase" src/pages/Portal.tsx src/components/ClientPortal/PortalNavigation.tsx src/components/ClientPortal/Dashboard.tsx src/components/ClientPortal/Feedback.tsx` returns nothing.
- [ ] `ClientPortal.tsx` and `AdminSignup.tsx` no longer exist in the repo; `/client/*` is no longer a route.
- [ ] `docs/superpowers/specs/2026-08-19-postgresql-first-architecture-design.md` is updated to mark Phase 2 complete, noting explicitly that `Updates.tsx`/`FilesDocuments.tsx`/`Messages.tsx` remain Supabase-backed pending Phase 4 (Storage) and Phase 5 (Realtime), and that email verification/password reset currently deliver via `ConsoleEmailSender` (console-log only) pending Phase 7 (a real provider).

**Explicitly out of scope for Phase 2** (do not attempt in this plan's execution): migrating `Updates.tsx`, `FilesDocuments.tsx`, or `Messages.tsx` off Supabase (Storage/Realtime dependency — Phases 4/5), a real `EmailSender` implementation (Phase 7), RBAC/tenant-isolation middleware (Phase 3), and any change to `WorkUpdatesManager.tsx`/`ClientMessagesManager.tsx`/`ClientManager.tsx` in the Admin Panel (same Storage/Realtime dependency, same deferral).
