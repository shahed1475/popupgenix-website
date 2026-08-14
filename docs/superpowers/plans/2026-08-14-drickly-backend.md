# Drickly Backend (Schema + Auth + Core CRUD API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase (auth, database, and the `get_public_testimonials` RPC) with a self-hosted Postgres database and a small Node/Express/TypeScript API, deployed on the VPS in complete isolation from Coolify — without touching the frontend's Supabase calls yet.

**Architecture:** A new `server/` package exposes a REST API (JWT auth + one router per resource) backed by a dedicated Postgres container. Both are deployed via Docker Compose alongside a containerized build of the existing (still Supabase-based) frontend, all on a new `drickly` Docker network, reverse-proxied through the frontend's nginx on host port 8081. Nothing here changes frontend behavior — it's the plumbing Phase 2 (a separate plan) will wire the frontend into.

**Tech Stack:** Node 20, TypeScript (strict, ESM/NodeNext), Express 4, `pg` (node-postgres), zod, jsonwebtoken, bcryptjs, vitest + supertest, postgres:15-alpine, Docker Compose, nginx:alpine.

## Global Constraints

- ESM + NodeNext module resolution: every relative import in `server/src` must include the `.js` extension (even though the source file is `.ts`) — e.g. `import { loadEnv } from '../config/env.js'`.
- Use `pg` parameterized queries (`$1, $2, ...`) everywhere. Never string-interpolate request data into SQL.
- API JSON field names stay **snake_case**, matching the original Supabase/Postgres column names exactly (e.g. `client_user_id`, `completion_percentage`), to minimize rework when the frontend is migrated in a later plan.
- Password hashing: bcryptjs, 12 salt rounds. Auth: JWT bearer tokens (`Authorization: Bearer <token>`), no cookies/sessions in this plan.
- Tests use a **real** Postgres, never a mock/in-memory engine. Start one locally before running `npm test`:
  ```bash
  docker run --rm -d --name drickly-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=drickly_test -p 55432:5432 postgres:15-alpine
  ```
  Then export `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test` in the shell running `npm test`.
- Do not create the `clients`, `blog_posts`, or `newsletter_subscriptions` tables — confirmed unused by the current frontend (verified via grep across `src/`), so porting them now would be dead weight (YAGNI).
- Do not create the `messages`, `client_updates`, or `documents` tables, and do not build file storage or WebSocket/realtime support — those are storage- and realtime-coupled features explicitly deferred to a later plan.
- All new infrastructure (Postgres container, network, volume) must be fully isolated from Coolify: its own Docker network (`drickly`), its own named volume, its own database role, no host port published for Postgres, nothing added to the `coolify` network.
- Never commit a real `.env` file or real secrets — only `.env.example` files with placeholder values. Real secrets go directly into a `.env` created on the VPS via SSH.
- **Checkpoint before remote/shared-state actions:** pause for explicit user confirmation before (a) `git push` to the GitHub repo and (b) running any command on the VPS (SSH, `docker compose up`, etc.). Everything else (local file edits, local test runs, local commits) can proceed without pausing.

## File Structure

```
popupgenix-website/
  Dockerfile                     # frontend build (Vite -> nginx), created in Task 13
  nginx.conf                     # frontend nginx: static SPA + /api/ reverse proxy, Task 13
  docker-compose.yml             # drickly-db + drickly-api + drickly-frontend, Task 13
  server/
    package.json
    tsconfig.json
    vitest.config.ts
    .env.example
    Dockerfile
    .dockerignore
    db/
      migrations/
        0001_core_schema.sql
    scripts/
      create-admin.ts
    src/
      config/
        env.ts
        env.test.ts
      db/
        pool.ts
        migrate.ts
        migrate.test.ts
        migrate-cli.ts
      lib/
        asyncHandler.ts
        httpError.ts
        httpError.test.ts
      auth/
        password.ts
        password.test.ts
        tokens.ts
        tokens.test.ts
        middleware.ts
        middleware.test.ts
        authRoutes.ts
        authRoutes.test.ts
      resources/
        projects.ts
        projects.test.ts
        services.ts
        services.test.ts
        homepageContent.ts
        homepageContent.test.ts
        contactSubmissions.ts
        contactSubmissions.test.ts
        quoteRequests.ts
        quoteRequests.test.ts
        invoices.ts
        invoices.test.ts
        feedback.ts
        feedback.test.ts
      test/
        setupTestDb.ts
      app.ts
      app.test.ts
      index.ts
```

---

### Task 1: Server scaffold, env config, health check

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/.env.example`
- Create: `server/.dockerignore`
- Create: `server/src/config/env.ts`
- Test: `server/src/config/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?: NodeJS.ProcessEnv): Env` where `Env = { DATABASE_URL: string; JWT_SECRET: string; JWT_EXPIRES_IN: string; PORT: number; NODE_ENV: 'development' | 'test' | 'production' }`. Throws on invalid/missing required fields.

- [ ] **Step 1: Create the package scaffold**

`server/package.json`:
```json
{
  "name": "drickly-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "db:migrate": "tsx src/db/migrate-cli.ts",
    "create-admin": "tsx scripts/create-admin.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.21.2",
    "pg": "^8.13.1",
    "zod": "^3.25.76",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.16.5",
    "@types/pg": "^8.11.10",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/bcryptjs": "^2.4.6",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "typescript": "^5.8.3",
    "tsx": "^4.19.2",
    "vitest": "^2.1.9"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
});
```

`server/.env.example`:
```
DATABASE_URL=postgresql://drickly_app:changeme@localhost:5432/drickly
JWT_SECRET=changeme-generate-a-long-random-string-min-32-chars
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=development
```

`server/.dockerignore`:
```
node_modules
dist
.env
*.test.ts
```

Run: `cd server && npm install`
Expected: installs cleanly, creates `server/package-lock.json`.

- [ ] **Step 2: Write the failing test for env loading**

```ts
// server/src/config/env.test.ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/drickly',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadEnv', () => {
  it('parses a valid environment', () => {
    const env = loadEnv(validEnv);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.PORT).toBe(4000);
    expect(env.JWT_EXPIRES_IN).toBe('7d');
    expect(env.NODE_ENV).toBe('development');
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow();
  });

  it('throws when JWT_SECRET is too short', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/config/env.test.ts`
Expected: FAIL — `env.ts` does not exist yet (module not found).

- [ ] **Step 4: Implement env.ts**

```ts
// server/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/config/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts server/.env.example server/.dockerignore server/src/config/env.ts server/src/config/env.test.ts
git commit -m "feat(server): scaffold drickly-api package with env config"
```

---

### Task 2: Password hashing + JWT token utilities

**Files:**
- Create: `server/src/auth/password.ts`
- Test: `server/src/auth/password.test.ts`
- Create: `server/src/auth/tokens.ts`
- Test: `server/src/auth/tokens.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`
- Produces: `interface AuthTokenPayload { sub: string; email: string; isAdmin: boolean }`, `signAuthToken(payload: AuthTokenPayload, secret: string, expiresIn: string): string`, `verifyAuthToken(token: string, secret: string): AuthTokenPayload`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/auth/password.test.ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('produces a hash different from the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });
});
```

```ts
// server/src/auth/tokens.test.ts
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAuthToken, verifyAuthToken } from './tokens.js';

const SECRET = 'test-secret-value-that-is-long-enough';

describe('auth tokens', () => {
  it('round-trips a signed payload', () => {
    const token = signAuthToken({ sub: 'user-1', email: 'a@b.com', isAdmin: true }, SECRET, '1h');
    const payload = verifyAuthToken(token, SECRET);
    expect(payload).toMatchObject({ sub: 'user-1', email: 'a@b.com', isAdmin: true });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAuthToken(
      { sub: 'user-1', email: 'a@b.com', isAdmin: false },
      'other-secret-value-that-is-long-enough',
      '1h'
    );
    expect(() => verifyAuthToken(token, SECRET)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1', email: 'a@b.com', isAdmin: false }, SECRET, { expiresIn: -10 });
    expect(() => verifyAuthToken(expired, SECRET)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/auth/password.test.ts src/auth/tokens.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement password.ts and tokens.ts**

```ts
// server/src/auth/password.ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

```ts
// server/src/auth/tokens.ts
import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
}

export function signAuthToken(payload: AuthTokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAuthToken(token: string, secret: string): AuthTokenPayload {
  return jwt.verify(token, secret) as AuthTokenPayload;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/auth/password.test.ts src/auth/tokens.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/password.ts server/src/auth/password.test.ts server/src/auth/tokens.ts server/src/auth/tokens.test.ts
git commit -m "feat(server): add password hashing and JWT token utilities"
```

---

### Task 3: Auth middleware

**Files:**
- Create: `server/src/lib/asyncHandler.ts`
- Create: `server/src/lib/httpError.ts`
- Test: `server/src/lib/httpError.test.ts`
- Create: `server/src/auth/middleware.ts`
- Test: `server/src/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `AuthTokenPayload`, `verifyAuthToken`, `signAuthToken` from Task 2.
- Produces: `class HttpError extends Error { status: number }`, `errorHandler(err, req, res, next): void`, `asyncHandler(fn): RequestHandler`
- Produces: `interface AuthMiddleware { optionalAuth: RequestHandler; requireAuth: RequestHandler; requireAdmin: RequestHandler }`, `createAuthMiddleware(secret: string): AuthMiddleware`. Sets `req.user: AuthTokenPayload` when a valid token is present.

- [ ] **Step 1: Write lib/asyncHandler.ts and lib/httpError.ts (no test needed for asyncHandler — thin wrapper, exercised indirectly by every resource test later)**

```ts
// server/src/lib/asyncHandler.ts
import type { NextFunction, Request, Response } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
```

```ts
// server/src/lib/httpError.ts
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

- [ ] **Step 2: Write the failing test for httpError.ts**

```ts
// server/src/lib/httpError.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import type { Request, Response } from 'express';
import { HttpError, errorHandler } from './httpError.js';

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('handles HttpError with its status and message', () => {
    const res = mockRes();
    errorHandler(new HttpError(404, 'Not found'), {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('handles ZodError as a 400', () => {
    const res = mockRes();
    let zodError: ZodError | undefined;
    try {
      z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
    } catch (err) {
      zodError = err as ZodError;
    }
    errorHandler(zodError, {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles unknown errors as a 500', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `cd server && npx vitest run src/lib/httpError.test.ts`
Expected: fails first because `httpError.ts`/`asyncHandler.ts` weren't written yet in your working copy — since Step 1 already wrote them, running now should PASS (3 tests). If you're following strict red-green-refactor, write the test first, confirm it fails against an empty file, then paste in the Step 1 implementation.

- [ ] **Step 4: Write the failing test for auth middleware**

```ts
// server/src/auth/middleware.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createAuthMiddleware } from './middleware.js';
import { signAuthToken } from './tokens.js';

const SECRET = 'test-secret-value-that-is-long-enough';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('auth middleware', () => {
  it('requireAuth rejects a missing token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const next = vi.fn();
    requireAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('requireAuth attaches user for a valid token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const token = signAuthToken({ sub: 'user-1', email: 'a@b.com', isAdmin: false }, SECRET, '1h');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ sub: 'user-1', email: 'a@b.com', isAdmin: false });
  });

  it('requireAuth rejects an invalid token', () => {
    const { requireAuth } = createAuthMiddleware(SECRET);
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const next = vi.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('optionalAuth continues without a token', () => {
    const { optionalAuth } = createAuthMiddleware(SECRET);
    const req = mockReq();
    const next = vi.fn();
    optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('requireAdmin rejects a non-admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: false };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('requireAdmin allows an admin user', () => {
    const { requireAdmin } = createAuthMiddleware(SECRET);
    const req = mockReq();
    req.user = { sub: 'user-1', email: 'a@b.com', isAdmin: true };
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd server && npx vitest run src/auth/middleware.test.ts`
Expected: FAIL — `middleware.ts` does not exist yet.

- [ ] **Step 6: Implement middleware.ts**

```ts
// server/src/auth/middleware.ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';
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

export function createAuthMiddleware(secret: string): AuthMiddleware {
  function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (token) {
      try {
        req.user = verifyAuthToken(token, secret);
      } catch {
        // invalid token on an optional route just means "not authenticated"
      }
    }
    next();
  }

  function requireAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = extractToken(req);
    if (!token) {
      next(new HttpError(401, 'Authentication required'));
      return;
    }
    try {
      req.user = verifyAuthToken(token, secret);
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
      return;
    }
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

- [ ] **Step 7: Run test to verify it passes**

Run: `cd server && npx vitest run src/auth/middleware.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/asyncHandler.ts server/src/lib/httpError.ts server/src/lib/httpError.test.ts server/src/auth/middleware.ts server/src/auth/middleware.test.ts
git commit -m "feat(server): add error handling and auth middleware"
```

---

### Task 4: Database schema + migration runner

**Files:**
- Create: `server/db/migrations/0001_core_schema.sql`
- Create: `server/src/db/pool.ts`
- Create: `server/src/db/migrate.ts`
- Test: `server/src/db/migrate.test.ts`
- Create: `server/src/db/migrate-cli.ts`
- Create: `server/src/test/setupTestDb.ts`

**Interfaces:**
- Produces: `createPool(connectionString: string): Pool` (re-exported `pg.Pool`)
- Produces: `runMigrations(pool: Pool, migrationsDir: string): Promise<string[]>` — returns filenames newly applied; idempotent.
- Produces (test helper, consumed by every resource test from Task 6 onward): `createTestPool(): Promise<Pool>`, `truncateAll(pool: Pool): Promise<void>`

- [ ] **Step 1: Write the core schema migration**

```sql
-- server/db/migrations/0001_core_schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  completion_percentage integer NOT NULL DEFAULT 0,
  technologies text[] NOT NULL DEFAULT '{}',
  image_url text,
  project_url text,
  client_name text,
  client_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  next_milestone text,
  eta_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_client_user_id_idx ON projects(client_user_id);
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'star',
  features text[] NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  subject text,
  message text NOT NULL,
  budget_range text,
  preferred_contact text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER contact_submissions_set_updated_at BEFORE UPDATE ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  project_type text NOT NULL,
  project_description text NOT NULL,
  budget_range text NOT NULL,
  timeline text,
  additional_requirements text,
  estimated_cost numeric,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER quote_requests_set_updated_at BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_company text,
  client_phone text,
  client_address text,
  issue_date timestamptz NOT NULL DEFAULT now(),
  due_date timestamptz NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  payment_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_line_items_invoice_id_idx ON invoice_line_items(invoice_id);

CREATE TABLE homepage_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title text NOT NULL DEFAULT '',
  hero_subtitle text NOT NULL DEFAULT '',
  hero_cta_primary text NOT NULL DEFAULT '',
  hero_cta_secondary text NOT NULL DEFAULT '',
  about_title text NOT NULL DEFAULT '',
  about_description text NOT NULL DEFAULT '',
  clients_count integer NOT NULL DEFAULT 0,
  projects_count integer NOT NULL DEFAULT 0,
  satisfaction_rate integer NOT NULL DEFAULT 0,
  team_size integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER homepage_content_set_updated_at BEFORE UPDATE ON homepage_content
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_company text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  testimonial text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  featured boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_project_id_idx ON feedback(project_id);
CREATE TRIGGER feedback_set_updated_at BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER admin_settings_set_updated_at BEFORE UPDATE ON admin_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO admin_settings (setting_key, setting_value, description)
VALUES ('admin_signup_enabled', 'false', 'Controls whether new accounts can be created via the signup form');
```

This mirrors `supabase/migrations/*.sql` and `src/integrations/supabase/types.ts` for every table the frontend actually reads (`profiles`+`auth.users` are consolidated into one `users` table — see Global Constraints), minus `clients`, `blog_posts`, `newsletter_subscriptions` (unused), and minus `messages`/`client_updates`/`documents` (storage/realtime, deferred).

- [ ] **Step 2: Implement db/pool.ts**

```ts
// server/src/db/pool.ts
import { Pool } from 'pg';

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
```

- [ ] **Step 3: Write the failing test for the migration runner**

```ts
// server/src/db/migrate.test.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set to run this test — see Global Constraints in the plan.');
}
const pool = new Pool({ connectionString });

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS migration_test_widgets');
  await pool.query('DROP TABLE IF EXISTS schema_migrations');
  await pool.end();
});

describe('runMigrations', () => {
  it('applies pending sql files and records them, then is a no-op on rerun', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'drickly-migrations-'));
    await writeFile(
      path.join(dir, '0001_create_widgets.sql'),
      'CREATE TABLE migration_test_widgets (id serial PRIMARY KEY, name text NOT NULL);'
    );

    const applied = await runMigrations(pool, dir);
    expect(applied).toEqual(['0001_create_widgets.sql']);

    const check = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'migration_test_widgets'`
    );
    expect(check.rows).toHaveLength(1);

    const secondRun = await runMigrations(pool, dir);
    expect(secondRun).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/db/migrate.test.ts`
Expected: FAIL — `migrate.ts` doesn't exist yet. (Make sure the test Postgres container from Global Constraints is running first.)

- [ ] **Step 5: Implement migrate.ts**

```ts
// server/src/db/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return newlyApplied;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/db/migrate.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Add the CLI entrypoint and the shared test-DB helper**

```ts
// server/src/db/migrate-cli.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';
import { loadEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const applied = await runMigrations(pool, path.resolve(__dirname, '../../db/migrations'));
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

```ts
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
      invoice_line_items, invoices, feedback, quote_requests, contact_submissions,
      homepage_content, services, projects, users
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `UPDATE admin_settings SET setting_value = 'false' WHERE setting_key = 'admin_signup_enabled'`
  );
}
```

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/db/migrate.test.ts`
Expected: still PASS (confirms `setupTestDb.ts` compiles and doesn't break the migration test — it's exercised for real starting in Task 6).

- [ ] **Step 8: Commit**

```bash
git add server/db/migrations/0001_core_schema.sql server/src/db/pool.ts server/src/db/migrate.ts server/src/db/migrate.test.ts server/src/db/migrate-cli.ts server/src/test/setupTestDb.ts
git commit -m "feat(server): add core Postgres schema and migration runner"
```

---

### Task 5: Auth & user-management routes + admin bootstrap script

**Files:**
- Create: `server/src/auth/authRoutes.ts`
- Test: `server/src/auth/authRoutes.test.ts`
- Create: `server/scripts/create-admin.ts`

**Interfaces:**
- Consumes: `AuthMiddleware` (Task 3), `hashPassword`/`verifyPassword` (Task 2), `signAuthToken` (Task 2), `createTestPool`/`truncateAll` (Task 4).
- Produces: `createAuthRoutes(pool: Pool, auth: AuthMiddleware, jwtSecret: string, jwtExpiresIn: string): Router` mounted at `/api/auth`, exposing `GET /signup-enabled`, `POST /signup`, `POST /login`, `POST /logout`, `GET /me`, `GET /users` (admin), `POST /users` (admin).

- [ ] **Step 1: Write the failing integration test**

```ts
// server/src/auth/authRoutes.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './middleware.js';
import { createAuthRoutes } from './authRoutes.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(pool, createAuthMiddleware(SECRET), SECRET, '1h'));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/auth/signup', () => {
  it('rejects signup while disabled', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(res.status).toBe(403);
  });

  it('creates a non-admin user once enabled, and rejects duplicate emails', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    const first = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(first.status).toBe(201);
    expect(first.body.is_admin).toBe(false);
    expect(first.body.password_hash).toBeUndefined();

    const dup = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    expect(dup.status).toBe(409);
  });
});

describe('login + me', () => {
  it('logs in and returns a usable token', async () => {
    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const app = buildApp();
    await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });

    const badLogin = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrong' });
    expect(badLogin.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'longenough1' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@b.com');
  });
});

describe('admin user management', () => {
  it('lets an admin list and create client users, and blocks non-admins', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id, email, is_admin`,
      [passwordHash]
    );
    const client = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

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

    const app = buildApp();
    const forbidden = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${clientToken}`);
    expect(forbidden.status).toBe(403);

    const list = await request(app).get('/api/auth/users').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const created = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'newclient@drickly.test', password: 'longenough1', full_name: 'New Client' });
    expect(created.status).toBe(201);
    expect(created.body.is_admin).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/auth/authRoutes.test.ts`
Expected: FAIL — `authRoutes.ts` doesn't exist yet.

- [ ] **Step 3: Implement authRoutes.ts**

```ts
// server/src/auth/authRoutes.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAuthToken } from './tokens.js';
import type { AuthMiddleware } from './middleware.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().nullable().optional(),
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

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

export function createAuthRoutes(
  pool: Pool,
  auth: AuthMiddleware,
  jwtSecret: string,
  jwtExpiresIn: string
): Router {
  const router = Router();

  router.get(
    '/signup-enabled',
    asyncHandler(async (_req, res) => {
      const result = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_signup_enabled'`
      );
      res.json({ enabled: result.rows[0]?.setting_value === 'true' });
    })
  );

  router.post(
    '/signup',
    asyncHandler(async (req, res) => {
      const flag = await pool.query(
        `SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_signup_enabled'`
      );
      if (flag.rows[0]?.setting_value !== 'true') {
        throw new HttpError(403, 'Signup is currently disabled');
      }
      const body = signupSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
      if (existing.rows[0]) {
        throw new HttpError(409, 'An account with this email already exists');
      }
      const passwordHash = await hashPassword(body.password);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, full_name, is_admin)
         VALUES ($1, $2, $3, false) RETURNING *`,
        [body.email, passwordHash, body.full_name ?? null]
      );
      res.status(201).json(toPublicUser(result.rows[0]));
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const result = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
      const user = result.rows[0];
      if (!user || !(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(401, 'Invalid email or password');
      }
      const token = signAuthToken(
        { sub: user.id, email: user.email, isAdmin: user.is_admin },
        jwtSecret,
        jwtExpiresIn
      );
      res.json({ token, user: toPublicUser(user) });
    })
  );

  router.post('/logout', (_req, res) => {
    res.status(204).send();
  });

  router.get(
    '/me',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.sub]);
      const user = result.rows[0];
      if (!user) throw new HttpError(404, 'User not found');
      res.json(toPublicUser(user));
    })
  );

  router.get(
    '/users',
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query<UserRow>(
        `SELECT * FROM users WHERE is_admin = false ORDER BY created_at DESC`
      );
      res.json(result.rows.map(toPublicUser));
    })
  );

  router.post(
    '/users',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = signupSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
      if (existing.rows[0]) {
        throw new HttpError(409, 'An account with this email already exists');
      }
      const passwordHash = await hashPassword(body.password);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, full_name, is_admin)
         VALUES ($1, $2, $3, false) RETURNING *`,
        [body.email, passwordHash, body.full_name ?? null]
      );
      res.status(201).json(toPublicUser(result.rows[0]));
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/auth/authRoutes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the create-admin bootstrap script (no automated test — it's a one-off ops script; verify manually against the local test DB)**

```ts
// server/scripts/create-admin.ts
import { loadEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

async function main(): Promise<void> {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    process.exitCode = 1;
    return;
  }
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      await pool.query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
      console.log(`Promoted existing user ${email} to admin.`);
      return;
    }
    const passwordHash = await hashPassword(password);
    await pool.query('INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, true)', [
      email,
      passwordHash,
    ]);
    console.log(`Created admin user ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

Run manually to verify (against the local test DB, using its connection string as `DATABASE_URL`):
```bash
cd server
DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test JWT_SECRET=$(node -e "console.log('a'.repeat(32))") npx tsx scripts/create-admin.ts owner@drickly.test "a-real-password-1"
```
Expected: prints `Created admin user owner@drickly.test.` Run it a second time with the same email: expected `Promoted existing user owner@drickly.test to admin.`

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/authRoutes.ts server/src/auth/authRoutes.test.ts server/scripts/create-admin.ts
git commit -m "feat(server): add auth routes, admin user management, and admin bootstrap script"
```

---

### Task 6: Projects resource

**Files:**
- Create: `server/src/resources/projects.ts`
- Test: `server/src/resources/projects.test.ts`

**Interfaces:**
- Consumes: `AuthMiddleware`, `createTestPool`/`truncateAll`, `HttpError`, `asyncHandler`.
- Produces: `createProjectsRouter(pool: Pool, auth: AuthMiddleware): Router` mounted at `/api/projects`. Admins see/manage all rows; authenticated non-admins see only rows where `client_user_id` matches their own id.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/resources/projects.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createProjectsRouter } from './projects.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectsRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('projects resource', () => {
  it('lets an admin create a project and a client only see their own', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const clientA = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('a@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );
    const clientB = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('b@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );

    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const clientAToken = signAuthToken({ sub: clientA.rows[0].id, email: 'a@drickly.test', isAdmin: false }, SECRET, '1h');

    const app = buildApp();

    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Site Redesign', description: 'Full redesign', category: 'web', client_user_id: clientA.rows[0].id });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const forbiddenCreate = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({ title: 'Not allowed', description: 'x', category: 'web' });
    expect(forbiddenCreate.status).toBe(403);

    const clientAList = await request(app).get('/api/projects').set('Authorization', `Bearer ${clientAToken}`);
    expect(clientAList.status).toBe(200);
    expect(clientAList.body).toHaveLength(1);
    expect(clientAList.body[0].id).toBe(projectId);

    const clientBToken = signAuthToken({ sub: clientB.rows[0].id, email: 'b@drickly.test', isAdmin: false }, SECRET, '1h');
    const clientBGet = await request(app).get(`/api/projects/${projectId}`).set('Authorization', `Bearer ${clientBToken}`);
    expect(clientBGet.status).toBe(404);

    const patched = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ completion_percentage: 50 });
    expect(patched.status).toBe(200);
    expect(patched.body.completion_percentage).toBe(50);

    const deleted = await request(app).delete(`/api/projects/${projectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/projects.test.ts`
Expected: FAIL — `projects.ts` doesn't exist yet.

- [ ] **Step 3: Implement projects.ts**

```ts
// server/src/resources/projects.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  status: z.string().default('active'),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  completion_percentage: z.number().int().min(0).max(100).default(0),
  technologies: z.array(z.string()).default([]),
  image_url: z.string().nullable().optional(),
  project_url: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  client_user_id: z.string().uuid().nullable().optional(),
  next_milestone: z.string().nullable().optional(),
  eta_date: z.string().nullable().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

export function createProjectsRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = req.user!.isAdmin
        ? await pool.query('SELECT * FROM projects ORDER BY created_at DESC')
        : await pool.query('SELECT * FROM projects WHERE client_user_id = $1 ORDER BY created_at DESC', [
            req.user!.sub,
          ]);
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
      const project = result.rows[0];
      if (!project) throw new HttpError(404, 'Project not found');
      if (!req.user!.isAdmin && project.client_user_id !== req.user!.sub) {
        throw new HttpError(404, 'Project not found');
      }
      res.json(project);
    })
  );

  router.post(
    '/',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = createProjectSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO projects
          (title, description, category, status, active, featured, completion_percentage,
           technologies, image_url, project_url, client_name, client_user_id, next_milestone, eta_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          body.title,
          body.description,
          body.category,
          body.status,
          body.active,
          body.featured,
          body.completion_percentage,
          body.technologies,
          body.image_url ?? null,
          body.project_url ?? null,
          body.client_name ?? null,
          body.client_user_id ?? null,
          body.next_milestone ?? null,
          body.eta_date ?? null,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateProjectSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE projects SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Project not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Project not found');
      res.status(204).send();
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/projects.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/projects.ts server/src/resources/projects.test.ts
git commit -m "feat(server): add projects resource with admin/client authorization"
```

---

### Task 7: Services resource

**Files:**
- Create: `server/src/resources/services.ts`
- Test: `server/src/resources/services.test.ts`

**Interfaces:**
- Produces: `createServicesRouter(pool: Pool, auth: AuthMiddleware): Router` mounted at `/api/services`. Public `GET /` returns only `active = true` rows; an authenticated admin (via `optionalAuth`) gets all rows. Writes are admin-only.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/resources/services.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createServicesRouter } from './services.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/services', createServicesRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('services resource', () => {
  it('hides inactive services from the public but shows them to admins, and blocks writes from non-admins', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const active = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Web Design', description: 'We build sites' });
    expect(active.status).toBe(201);

    const inactive = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Legacy Service', description: 'Retired', active: false });
    expect(inactive.status).toBe(201);

    const publicList = await request(app).get('/api/services');
    expect(publicList.body).toHaveLength(1);
    expect(publicList.body[0].title).toBe('Web Design');

    const adminList = await request(app).get('/api/services').set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body).toHaveLength(2);

    const forbiddenWrite = await request(app).post('/api/services').send({ title: 'x', description: 'y' });
    expect(forbiddenWrite.status).toBe(401);

    const deleted = await request(app)
      .delete(`/api/services/${inactive.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/services.test.ts`
Expected: FAIL — `services.ts` doesn't exist yet.

- [ ] **Step 3: Implement services.ts**

```ts
// server/src/resources/services.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createServiceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().default('star'),
  features: z.array(z.string()).default([]),
  order_index: z.number().int().default(0),
  active: z.boolean().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

export function createServicesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.optionalAuth,
    asyncHandler(async (req, res) => {
      const result = req.user?.isAdmin
        ? await pool.query('SELECT * FROM services ORDER BY order_index ASC')
        : await pool.query('SELECT * FROM services WHERE active = true ORDER BY order_index ASC');
      res.json(result.rows);
    })
  );

  router.post(
    '/',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = createServiceSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO services (title, description, icon, features, order_index, active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [body.title, body.description, body.icon, body.features, body.order_index, body.active]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateServiceSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE services SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Service not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Service not found');
      res.status(204).send();
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/services.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/services.ts server/src/resources/services.test.ts
git commit -m "feat(server): add services resource with public/admin visibility split"
```

---

### Task 8: Homepage content resource

**Files:**
- Create: `server/src/resources/homepageContent.ts`
- Test: `server/src/resources/homepageContent.test.ts`

**Interfaces:**
- Produces: `createHomepageContentRouter(pool: Pool, auth: AuthMiddleware): Router` mounted at `/api/homepage-content`. `GET /` is public and returns the single row (or `null`). `PUT /` is admin-only and upserts the singleton.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/resources/homepageContent.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createHomepageContentRouter } from './homepageContent.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/homepage-content', createHomepageContentRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('homepage content resource', () => {
  it('returns null before any content exists, then upserts on PUT', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const before = await request(app).get('/api/homepage-content');
    expect(before.body).toBeNull();

    const forbidden = await request(app).put('/api/homepage-content').send({ hero_title: 'nope' });
    expect(forbidden.status).toBe(401);

    const created = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hero_title: 'Build faster', clients_count: 12 });
    expect(created.status).toBe(201);
    expect(created.body.hero_title).toBe('Build faster');

    const updated = await request(app)
      .put('/api/homepage-content')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hero_title: 'Build even faster', clients_count: 20 });
    expect(updated.status).toBe(200);
    expect(updated.body.hero_title).toBe('Build even faster');

    const all = await pool.query('SELECT * FROM homepage_content');
    expect(all.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/homepageContent.test.ts`
Expected: FAIL — `homepageContent.ts` doesn't exist yet.

- [ ] **Step 3: Implement homepageContent.ts**

```ts
// server/src/resources/homepageContent.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const contentSchema = z.object({
  hero_title: z.string().default(''),
  hero_subtitle: z.string().default(''),
  hero_cta_primary: z.string().default(''),
  hero_cta_secondary: z.string().default(''),
  about_title: z.string().default(''),
  about_description: z.string().default(''),
  clients_count: z.number().int().default(0),
  projects_count: z.number().int().default(0),
  satisfaction_rate: z.number().int().default(0),
  team_size: z.number().int().default(0),
});

export function createHomepageContentRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM homepage_content ORDER BY created_at ASC LIMIT 1');
      res.json(result.rows[0] ?? null);
    })
  );

  router.put(
    '/',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = contentSchema.parse(req.body);
      const existing = await pool.query('SELECT id FROM homepage_content ORDER BY created_at ASC LIMIT 1');

      if (existing.rows[0]) {
        const result = await pool.query(
          `UPDATE homepage_content SET
             hero_title=$1, hero_subtitle=$2, hero_cta_primary=$3, hero_cta_secondary=$4,
             about_title=$5, about_description=$6, clients_count=$7, projects_count=$8,
             satisfaction_rate=$9, team_size=$10, updated_at = now()
           WHERE id = $11 RETURNING *`,
          [
            body.hero_title,
            body.hero_subtitle,
            body.hero_cta_primary,
            body.hero_cta_secondary,
            body.about_title,
            body.about_description,
            body.clients_count,
            body.projects_count,
            body.satisfaction_rate,
            body.team_size,
            existing.rows[0].id,
          ]
        );
        res.json(result.rows[0]);
        return;
      }

      const result = await pool.query(
        `INSERT INTO homepage_content
          (hero_title, hero_subtitle, hero_cta_primary, hero_cta_secondary, about_title,
           about_description, clients_count, projects_count, satisfaction_rate, team_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          body.hero_title,
          body.hero_subtitle,
          body.hero_cta_primary,
          body.hero_cta_secondary,
          body.about_title,
          body.about_description,
          body.clients_count,
          body.projects_count,
          body.satisfaction_rate,
          body.team_size,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/homepageContent.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/homepageContent.ts server/src/resources/homepageContent.test.ts
git commit -m "feat(server): add homepage content singleton resource"
```

---

### Task 9: Contact submissions & quote requests resources

**Files:**
- Create: `server/src/resources/contactSubmissions.ts`
- Test: `server/src/resources/contactSubmissions.test.ts`
- Create: `server/src/resources/quoteRequests.ts`
- Test: `server/src/resources/quoteRequests.test.ts`

**Interfaces:**
- Produces: `createContactSubmissionsRouter(pool, auth): Router` at `/api/contact-submissions` — `POST /` public, `GET /` and `PATCH /:id` admin-only.
- Produces: `createQuoteRequestsRouter(pool, auth): Router` at `/api/quote-requests` — `POST /` public, `GET /` and `PATCH /:id` admin-only.

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/resources/contactSubmissions.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createContactSubmissionsRouter } from './contactSubmissions.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/contact-submissions', createContactSubmissionsRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('contact submissions resource', () => {
  it('accepts public submissions but restricts reading/updating to admins', async () => {
    const app = buildApp();

    const submitted = await request(app)
      .post('/api/contact-submissions')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello there' });
    expect(submitted.status).toBe(201);

    const forbiddenList = await request(app).get('/api/contact-submissions');
    expect(forbiddenList.status).toBe(401);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');

    const list = await request(app).get('/api/contact-submissions').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/contact-submissions/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('resolved');
  });
});
```

```ts
// server/src/resources/quoteRequests.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createQuoteRequestsRouter } from './quoteRequests.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/quote-requests', createQuoteRequestsRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('quote requests resource', () => {
  it('accepts public submissions but restricts reading/updating to admins', async () => {
    const app = buildApp();

    const submitted = await request(app).post('/api/quote-requests').send({
      name: 'Jane',
      email: 'jane@example.com',
      project_type: 'website',
      project_description: 'A marketing site',
      budget_range: '5k-10k',
    });
    expect(submitted.status).toBe(201);

    const forbiddenList = await request(app).get('/api/quote-requests');
    expect(forbiddenList.status).toBe(401);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');

    const patched = await request(app)
      .patch(`/api/quote-requests/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'quoted', estimated_cost: 7500 });
    expect(patched.status).toBe(200);
    expect(Number(patched.body.estimated_cost)).toBe(7500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/contactSubmissions.test.ts src/resources/quoteRequests.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement contactSubmissions.ts and quoteRequests.ts**

```ts
// server/src/resources/contactSubmissions.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  message: z.string().min(1),
  budget_range: z.string().nullable().optional(),
  preferred_contact: z.string().nullable().optional(),
});

const updateSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
});

export function createContactSubmissionsRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO contact_submissions
          (name, email, phone, company, subject, message, budget_range, preferred_contact)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          body.name,
          body.email,
          body.phone ?? null,
          body.company ?? null,
          body.subject ?? null,
          body.message,
          body.budget_range ?? null,
          body.preferred_contact ?? null,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    '/',
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM contact_submissions ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE contact_submissions SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Contact submission not found');
      res.json(result.rows[0]);
    })
  );

  return router;
}
```

```ts
// server/src/resources/quoteRequests.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  project_type: z.string().min(1),
  project_description: z.string().min(1),
  budget_range: z.string().min(1),
  timeline: z.string().nullable().optional(),
  additional_requirements: z.string().nullable().optional(),
});

const updateSchema = z.object({
  status: z.string().optional(),
  estimated_cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export function createQuoteRequestsRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = createSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO quote_requests
          (name, email, phone, company, project_type, project_description, budget_range,
           timeline, additional_requirements)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          body.name,
          body.email,
          body.phone ?? null,
          body.company ?? null,
          body.project_type,
          body.project_description,
          body.budget_range,
          body.timeline ?? null,
          body.additional_requirements ?? null,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    '/',
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM quote_requests ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE quote_requests SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Quote request not found');
      res.json(result.rows[0]);
    })
  );

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/contactSubmissions.test.ts src/resources/quoteRequests.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/contactSubmissions.ts server/src/resources/contactSubmissions.test.ts server/src/resources/quoteRequests.ts server/src/resources/quoteRequests.test.ts
git commit -m "feat(server): add public-intake resources for contact and quote requests"
```

---

### Task 10: Invoices + invoice line items resource

**Files:**
- Create: `server/src/resources/invoices.ts`
- Test: `server/src/resources/invoices.test.ts`

**Interfaces:**
- Produces: `createInvoicesRouter(pool: Pool, auth: AuthMiddleware): Router` mounted at `/api/invoices`. Fully admin-only. `POST`/`PATCH` accept a `line_items` array and replace all line items for that invoice transactionally; `GET /:id` returns the invoice joined with its line items.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/resources/invoices.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createInvoicesRouter } from './invoices.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;
let adminToken: string;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', createInvoicesRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
  const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
  const admin = await pool.query(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
    [passwordHash]
  );
  adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
});

afterAll(async () => {
  await pool.end();
});

describe('invoices resource', () => {
  it('creates an invoice with line items and replaces them on update', async () => {
    const app = buildApp();

    const created = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        invoice_number: 'INV-0001',
        client_name: 'Acme Co',
        client_email: 'billing@acme.test',
        due_date: '2026-09-01',
        line_items: [{ service_name: 'Design', quantity: 1, rate: 500, amount: 500 }],
      });
    expect(created.status).toBe(201);
    expect(created.body.line_items).toHaveLength(1);
    const invoiceId = created.body.id as string;

    const fetched = await request(app).get(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.line_items).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'sent',
        line_items: [
          { service_name: 'Design', quantity: 1, rate: 500, amount: 500 },
          { service_name: 'Development', quantity: 10, rate: 100, amount: 1000 },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('sent');
    expect(updated.body.line_items).toHaveLength(2);

    const deleted = await request(app).delete(`/api/invoices/${invoiceId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);

    const lineItemsAfterDelete = await pool.query('SELECT * FROM invoice_line_items WHERE invoice_id = $1', [invoiceId]);
    expect(lineItemsAfterDelete.rows).toHaveLength(0);
  });

  it('blocks non-admins', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/invoices.test.ts`
Expected: FAIL — `invoices.ts` doesn't exist yet.

- [ ] **Step 3: Implement invoices.ts**

```ts
// server/src/resources/invoices.ts
import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const lineItemSchema = z.object({
  service_name: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().default(1),
  rate: z.number().default(0),
  amount: z.number().default(0),
});

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_company: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  client_address: z.string().nullable().optional(),
  due_date: z.string(),
  subtotal: z.number().default(0),
  discount: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  status: z.string().default('draft'),
  payment_instructions: z.string().nullable().optional(),
  line_items: z.array(lineItemSchema).default([]),
});

async function insertLineItems(
  client: PoolClient,
  invoiceId: string,
  items: z.infer<typeof lineItemSchema>[]
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO invoice_line_items (invoice_id, service_name, description, quantity, rate, amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [invoiceId, item.service_name, item.description ?? null, item.quantity, item.rate, item.amount]
    );
  }
}

export function createInvoicesRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.get(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const invoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
      if (!invoice.rows[0]) throw new HttpError(404, 'Invoice not found');
      const lineItems = await pool.query(
        'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at ASC',
        [req.params.id]
      );
      res.json({ ...invoice.rows[0], line_items: lineItems.rows });
    })
  );

  router.post(
    '/',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = invoiceSchema.parse(req.body);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO invoices
            (invoice_number, client_name, client_email, client_company, client_phone, client_address,
             due_date, subtotal, discount, tax, total, status, payment_instructions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            body.invoice_number,
            body.client_name,
            body.client_email,
            body.client_company ?? null,
            body.client_phone ?? null,
            body.client_address ?? null,
            body.due_date,
            body.subtotal,
            body.discount,
            body.tax,
            body.total,
            body.status,
            body.payment_instructions ?? null,
          ]
        );
        const invoice = result.rows[0];
        await insertLineItems(client, invoice.id, body.line_items);
        await client.query('COMMIT');
        res.status(201).json({ ...invoice, line_items: body.line_items });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = invoiceSchema.partial().parse(req.body);
      const { line_items, ...fields } = body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const keys = Object.keys(fields);
        if (keys.length > 0) {
          const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
          const values = keys.map((key) => (fields as Record<string, unknown>)[key]);
          const updateResult = await client.query(
            `UPDATE invoices SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING id`,
            [req.params.id, ...values]
          );
          if (!updateResult.rows[0]) throw new HttpError(404, 'Invoice not found');
        }
        if (line_items) {
          await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [req.params.id]);
          await insertLineItems(client, req.params.id, line_items);
        }
        const invoice = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
        if (!invoice.rows[0]) throw new HttpError(404, 'Invoice not found');
        const lineItemsResult = await client.query(
          'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at ASC',
          [req.params.id]
        );
        await client.query('COMMIT');
        res.json({ ...invoice.rows[0], line_items: lineItemsResult.rows });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  router.delete(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) throw new HttpError(404, 'Invoice not found');
      res.status(204).send();
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/invoices.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/invoices.ts server/src/resources/invoices.test.ts
git commit -m "feat(server): add invoices resource with transactional line-item replacement"
```

---

### Task 11: Feedback / testimonials resource

**Files:**
- Create: `server/src/resources/feedback.ts`
- Test: `server/src/resources/feedback.test.ts`

**Interfaces:**
- Produces: `createFeedbackRouter(pool: Pool, auth: AuthMiddleware): Router` mounted at `/api/testimonials`. `GET /` is public and replaces the old `get_public_testimonials()` RPC exactly (`status = 'approved' AND deleted_at IS NULL`, ordered by `featured DESC, created_at DESC`, and excludes `client_email`). `GET /mine` returns the authenticated user's own submissions (matched by email, mirroring the original RLS policy). `GET /admin`, `PATCH /:id` are admin-only; `DELETE /:id` is a soft delete (`deleted_at`).

- [ ] **Step 1: Write the failing test**

```ts
// server/src/resources/feedback.test.ts
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuthMiddleware } from '../auth/middleware.js';
import { signAuthToken } from '../auth/tokens.js';
import { errorHandler } from '../lib/httpError.js';
import { createTestPool, truncateAll } from '../test/setupTestDb.js';
import { createFeedbackRouter } from './feedback.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/testimonials', createFeedbackRouter(pool, createAuthMiddleware(SECRET)));
  app.use(errorHandler);
  return app;
}

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('feedback / testimonials resource', () => {
  it('only shows approved, non-deleted testimonials publicly, without client_email', async () => {
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const client = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('client@drickly.test', $1, false) RETURNING id`,
      [passwordHash]
    );
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const clientToken = signAuthToken({ sub: client.rows[0].id, email: 'client@drickly.test', isAdmin: false }, SECRET, '1h');
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin@drickly.test', isAdmin: true }, SECRET, '1h');
    const app = buildApp();

    const submitted = await request(app)
      .post('/api/testimonials')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ client_name: 'Client', client_email: 'client@drickly.test', rating: 5, testimonial: 'Great work!' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe('pending');

    const publicBeforeApproval = await request(app).get('/api/testimonials');
    expect(publicBeforeApproval.body).toHaveLength(0);

    const approved = await request(app)
      .patch(`/api/testimonials/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', featured: true });
    expect(approved.status).toBe(200);

    const publicAfterApproval = await request(app).get('/api/testimonials');
    expect(publicAfterApproval.body).toHaveLength(1);
    expect(publicAfterApproval.body[0].client_email).toBeUndefined();

    const mine = await request(app).get('/api/testimonials/mine').set('Authorization', `Bearer ${clientToken}`);
    expect(mine.body).toHaveLength(1);

    const softDeleted = await request(app)
      .delete(`/api/testimonials/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(softDeleted.status).toBe(204);

    const publicAfterDelete = await request(app).get('/api/testimonials');
    expect(publicAfterDelete.body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/feedback.test.ts`
Expected: FAIL — `feedback.ts` doesn't exist yet.

- [ ] **Step 3: Implement feedback.ts**

```ts
// server/src/resources/feedback.ts
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpError.js';
import type { AuthMiddleware } from '../auth/middleware.js';

const createFeedbackSchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_company: z.string().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  rating: z.number().int().min(1).max(5),
  testimonial: z.string().min(1),
});

const updateFeedbackSchema = z.object({
  status: z.string().optional(),
  featured: z.boolean().optional(),
});

export function createFeedbackRouter(pool: Pool, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const result = await pool.query(
        `SELECT id, testimonial, rating, created_at, client_name, client_company, featured
         FROM feedback
         WHERE status = 'approved' AND deleted_at IS NULL
         ORDER BY featured DESC, created_at DESC`
      );
      res.json(result.rows);
    })
  );

  router.get(
    '/mine',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const result = await pool.query(
        'SELECT * FROM feedback WHERE client_email = $1 ORDER BY created_at DESC',
        [req.user!.email]
      );
      res.json(result.rows);
    })
  );

  router.get(
    '/admin',
    auth.requireAdmin,
    asyncHandler(async (_req, res) => {
      const result = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC');
      res.json(result.rows);
    })
  );

  router.post(
    '/',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const body = createFeedbackSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO feedback (client_name, client_email, client_company, project_id, rating, testimonial)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          body.client_name,
          body.client_email,
          body.client_company ?? null,
          body.project_id ?? null,
          body.rating,
          body.testimonial,
        ]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.patch(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const body = updateFeedbackSchema.parse(req.body);
      const keys = Object.keys(body);
      if (keys.length === 0) throw new HttpError(400, 'No fields to update');
      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      const values = keys.map((key) => (body as Record<string, unknown>)[key]);
      const result = await pool.query(
        `UPDATE feedback SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Feedback not found');
      res.json(result.rows[0]);
    })
  );

  router.delete(
    '/:id',
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('UPDATE feedback SET deleted_at = now() WHERE id = $1 RETURNING id', [
        req.params.id,
      ]);
      if (!result.rows[0]) throw new HttpError(404, 'Feedback not found');
      res.status(204).send();
    })
  );

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/resources/feedback.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/feedback.ts server/src/resources/feedback.test.ts
git commit -m "feat(server): add feedback/testimonials resource matching prior RLS behavior"
```

---

### Task 12: App wiring, Dockerfile, and end-to-end smoke test

**Files:**
- Create: `server/src/app.ts`
- Test: `server/src/app.test.ts`
- Create: `server/src/index.ts`
- Create: `server/Dockerfile`

**Interfaces:**
- Consumes: every router factory from Tasks 5–11.
- Produces: `createApp(pool: Pool, jwtSecret: string, jwtExpiresIn: string): Express`

- [ ] **Step 1: Write the failing end-to-end test**

```ts
// server/src/app.test.ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from './app.js';
import { createTestPool, truncateAll } from './test/setupTestDb.js';

const SECRET = 'test-secret-value-that-is-long-enough';
let pool: Pool;

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp(pool, SECRET, '1h');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('end-to-end: signup -> promote -> login -> manage a service -> public read', () => {
  it('works across the whole wired app', async () => {
    const app = createApp(pool, SECRET, '1h');

    await pool.query(`UPDATE admin_settings SET setting_value = 'true' WHERE setting_key = 'admin_signup_enabled'`);
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'admin@drickly.test', password: 'supersecret1' });
    expect(signup.status).toBe(201);

    await pool.query('UPDATE users SET is_admin = true WHERE email = $1', ['admin@drickly.test']);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drickly.test', password: 'supersecret1' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const created = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Web Design', description: 'We build sites' });
    expect(created.status).toBe(201);

    const publicList = await request(app).get('/api/services');
    expect(publicList.status).toBe(200);
    expect(publicList.body).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/app.test.ts`
Expected: FAIL — `app.ts` does not exist yet.

- [ ] **Step 3: Implement app.ts and index.ts**

```ts
// server/src/app.ts
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { createAuthMiddleware } from './auth/middleware.js';
import { createAuthRoutes } from './auth/authRoutes.js';
import { createProjectsRouter } from './resources/projects.js';
import { createServicesRouter } from './resources/services.js';
import { createHomepageContentRouter } from './resources/homepageContent.js';
import { createContactSubmissionsRouter } from './resources/contactSubmissions.js';
import { createQuoteRequestsRouter } from './resources/quoteRequests.js';
import { createInvoicesRouter } from './resources/invoices.js';
import { createFeedbackRouter } from './resources/feedback.js';
import { errorHandler } from './lib/httpError.js';

export function createApp(pool: Pool, jwtSecret: string, jwtExpiresIn: string): Express {
  const auth = createAuthMiddleware(jwtSecret);
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRoutes(pool, auth, jwtSecret, jwtExpiresIn));
  app.use('/api/projects', createProjectsRouter(pool, auth));
  app.use('/api/services', createServicesRouter(pool, auth));
  app.use('/api/homepage-content', createHomepageContentRouter(pool, auth));
  app.use('/api/contact-submissions', createContactSubmissionsRouter(pool, auth));
  app.use('/api/quote-requests', createQuoteRequestsRouter(pool, auth));
  app.use('/api/invoices', createInvoicesRouter(pool, auth));
  app.use('/api/testimonials', createFeedbackRouter(pool, auth));

  app.use(errorHandler);
  return app;
}
```

```ts
// server/src/index.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  await runMigrations(pool, path.resolve(__dirname, '../db/migrations'));
  const app = createApp(pool, env.JWT_SECRET, env.JWT_EXPIRES_IN);
  app.listen(env.PORT, () => {
    console.log(`Drickly API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npx vitest run src/app.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/drickly_test npm test`
Expected: PASS — every test file from Tasks 1–12.

- [ ] **Step 6: Write the API Dockerfile**

```dockerfile
# server/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

Run: `docker build -t drickly-api ./server`
Expected: image builds successfully with no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/app.test.ts server/src/index.ts server/Dockerfile
git commit -m "feat(server): wire full Express app and add API Dockerfile"
```

---

### Task 13: Docker Compose stack and VPS deployment

**Files:**
- Create: `Dockerfile` (repo root — frontend build)
- Create: `nginx.conf` (repo root)
- Create: `docker-compose.yml` (repo root)
- Create: `.env.example` (repo root, for compose-level secrets — separate from `server/.env.example`)

This task stands up the full stack (`drickly-db`, `drickly-api`, `drickly-frontend`) on the VPS, isolated from Coolify, with the **current, unmodified, Supabase-based** frontend build serving traffic on port 8081. The API is live and independently testable via `curl`, but nothing in the frontend calls it yet — that's the next plan.

- [ ] **Step 1: Write the frontend Dockerfile**

```dockerfile
# Dockerfile (repo root)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 2: Write nginx.conf (SPA static serving + /api reverse proxy)**

```nginx
# nginx.conf (repo root)
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://drickly-api:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
# docker-compose.yml (repo root)
services:
  drickly-db:
    image: postgres:15-alpine
    container_name: drickly-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: drickly
      POSTGRES_USER: drickly_app
      POSTGRES_PASSWORD: ${DRICKLY_DB_PASSWORD}
    volumes:
      - drickly-db-data:/var/lib/postgresql/data
    networks:
      - drickly

  drickly-api:
    build: ./server
    container_name: drickly-api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://drickly_app:${DRICKLY_DB_PASSWORD}@drickly-db:5432/drickly
      JWT_SECRET: ${DRICKLY_JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      PORT: 4000
      NODE_ENV: production
    depends_on:
      - drickly-db
    networks:
      - drickly

  drickly-frontend:
    build: .
    container_name: drickly-frontend
    restart: unless-stopped
    ports:
      - "8081:80"
    depends_on:
      - drickly-api
    networks:
      - drickly

networks:
  drickly:
    name: drickly
    driver: bridge

volumes:
  drickly-db-data:
    name: drickly-db-data
```

`.env.example` (repo root — placeholders only):
```
DRICKLY_DB_PASSWORD=changeme
DRICKLY_JWT_SECRET=changeme-generate-a-long-random-string-min-32-chars
```

- [ ] **Step 4: Commit the compose stack**

```bash
git add Dockerfile nginx.conf docker-compose.yml .env.example
git commit -m "feat: add Docker Compose stack for isolated drickly deployment"
```

- [ ] **Step 5: CHECKPOINT — confirm before remote actions**

Stop here and confirm with the user before proceeding to Steps 6–9: they involve `git push` to the shared GitHub repo and running commands on the production VPS.

- [ ] **Step 6: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 7: Deploy to the VPS**

```bash
ssh drickly "mkdir -p ~/apps && cd ~/apps && git clone https://github.com/shahed1475/popupgenix-website.git drickly"
```
(If `~/apps/drickly` already exists from a prior run, use `cd ~/apps/drickly && git pull` instead of `git clone`.)

Create the real `.env` directly on the VPS (never committed) with freshly generated secrets:
```bash
ssh drickly "cd ~/apps/drickly && cat > .env <<'EOF'
DRICKLY_DB_PASSWORD=$(openssl rand -base64 24)
DRICKLY_JWT_SECRET=$(openssl rand -base64 48)
EOF"
```

- [ ] **Step 8: Bring up the stack and run the smoke test**

```bash
ssh drickly "cd ~/apps/drickly && sudo docker compose up -d --build"
```
Wait for the build to finish, then verify:
```bash
ssh drickly "curl -s http://localhost:8081/ | head -5"
ssh drickly "curl -s http://localhost:8081/api/health"
ssh drickly "curl -s http://localhost:8081/api/services"
ssh drickly "sudo docker network inspect drickly --format '{{json .Containers}}'"
ssh drickly "sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E 'coolify|rajshahi'"
```
Expected: the frontend HTML loads, `/api/health` returns `{"status":"ok"}`, `/api/services` returns `[]` (empty, no data yet), the `drickly` network shows exactly the three new containers, and the last command confirms every pre-existing Coolify/rajshahi container is still `Up` and untouched.

- [ ] **Step 9: Bootstrap the first admin account on the VPS**

```bash
ssh drickly "cd ~/apps/drickly && sudo docker compose exec -e DATABASE_URL=postgresql://drickly_app:\$(grep DRICKLY_DB_PASSWORD .env | cut -d= -f2)@drickly-db:5432/drickly drickly-api node -e \"
const { createPool } = require('./dist/db/pool.js');
\""
```
This one-liner is awkward inside a running container without `tsx`; simpler in practice — run it as a one-off container using the already-built image:
```bash
ssh drickly "cd ~/apps/drickly && sudo docker compose run --rm -e DATABASE_URL=postgresql://drickly_app:\$(grep DRICKLY_DB_PASSWORD .env | cut -d= -f2)@drickly-db:5432/drickly drickly-api node dist/../scripts/create-admin.js owner@popupgenix.com 'REPLACE_WITH_A_REAL_PASSWORD'"
```
Note: `scripts/create-admin.ts` is TypeScript and isn't compiled by the current Dockerfile (only `src/` is). Before running this step, add a `"build:scripts": "tsc -p tsconfig.json --outDir dist-scripts scripts"`-style step, or simplest: run it with `tsx` directly against the deployed database from your local machine (which already has `tsx` via `npm install` in `server/`) pointed at the VPS through an SSH tunnel:
```bash
ssh -L 15432:localhost:5432 -N drickly &
cd server
DATABASE_URL="postgresql://drickly_app:<password-from-VPS-.env>@localhost:15432/drickly" JWT_SECRET="a-placeholder-32-char-secret-value" npx tsx scripts/create-admin.ts owner@popupgenix.com "REPLACE_WITH_A_REAL_PASSWORD"
```
Wait — `drickly-db` has no host port published (by design, see Global Constraints), so there's nothing on the VPS's `localhost:5432` to tunnel to directly. Instead, tunnel through a one-off container attached to the `drickly` network, or simplest: run the script inside a throwaway container on that network:
```bash
ssh drickly "cd ~/apps/drickly && sudo docker compose run --rm drickly-api sh -c 'apk add --no-cache nodejs npm >/dev/null 2>&1; true'"
```
The cleanest approach: add `scripts/create-admin.ts` to the API image's build output by extending the Dockerfile's build stage to also compile `scripts/`, OR simply run it via `npx tsx` inside a one-off container that mounts the source:
```bash
ssh drickly "cd ~/apps/drickly/server && sudo docker run --rm --network drickly \
  -e DATABASE_URL=postgresql://drickly_app:\$(grep DRICKLY_DB_PASSWORD ../.env | cut -d= -f2)@drickly-db:5432/drickly \
  -e JWT_SECRET=placeholder-at-least-32-characters-long \
  -v \$(pwd):/app -w /app node:20-alpine \
  sh -c 'npm ci && npx tsx scripts/create-admin.ts owner@popupgenix.com REPLACE_WITH_A_REAL_PASSWORD'"
```
Expected: prints `Created admin user owner@popupgenix.com.` Verify:
```bash
ssh drickly "sudo docker exec drickly-db psql -U drickly_app -d drickly -c \"SELECT email, is_admin FROM users;\""
```

- [ ] **Step 10: Final confirmation**

Report back to the user: the stack is live at `http://51.161.34.169:8081` (frontend, still Supabase-backed, unchanged), the API is live internally and reachable at `http://51.161.34.169:8081/api/*`, a first admin account exists, and nothing on the VPS outside the new `drickly` network/containers was touched. Frontend integration (swapping the Supabase calls for this API) is the next, separate plan.

---

## Self-Review Notes

- **Spec coverage:** schema (Task 4) ✓, auth (Tasks 2–3, 5) ✓, core CRUD for every table with a live frontend consumer except storage/realtime-coupled ones (Tasks 6–11) ✓, isolated Postgres+API+frontend deployment on the VPS (Task 13) ✓, confirmation checkpoint before remote actions ✓. Storage, realtime chat, and the B2B/worker schema are explicitly out of scope per the user's own confirmed decisions.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact shell command. Step 9 of Task 13 is intentionally the messiest step (bootstrapping the very first admin against a DB with no exposed host port) — it's left as a real, if inelegant, working command rather than glossed over, and flagged for the executor to sanity-check on the actual VPS shell before relying on it.
- **Type consistency:** `AuthTokenPayload { sub, email, isAdmin }` is used identically across `tokens.ts`, `middleware.ts`, and every resource file. `AuthMiddleware { optionalAuth, requireAuth, requireAdmin }` is defined once in `middleware.ts` and imported everywhere else. `createApp(pool, jwtSecret, jwtExpiresIn)` signature matches its `index.ts` call site and its `app.test.ts` usage.
