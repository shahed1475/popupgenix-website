# Frontend Integration (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 7 backend-ready Admin Panel sub-pages (login, dashboard, homepage, services, testimonials, contact messages, quote requests, invoices) to the new Drickly Postgres+Express API, replacing their direct Supabase calls.

**Architecture:** A new `src/lib/api/` layer (a thin `fetch` wrapper plus one typed module per backend resource) replaces `src/integrations/supabase/client` calls inside the 8 in-scope components. Three admin sub-pages (Work Updates, Client Messages, Clients) and the entire Client Portal stay on Supabase, untouched — their data model was explicitly deferred when the backend was built.

**Tech Stack:** React + TypeScript + Vite (frontend), Express + Postgres + zod (backend, already built), vitest (both packages).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-frontend-integration-design.md` — every requirement below traces back to it.
- New frontend API modules live under `src/lib/api/`. Base URL is the relative path `/api` (works through nginx in production and a Vite dev proxy locally — never hardcode a host).
- Auth token is stored under the `localStorage` key `drickly_admin_token`. No refresh-token flow exists server-side (7-day fixed expiry) — do not build one.
- Any `401` response from any API call clears the token and does a full-page redirect to `/admin` (`window.location.href = '/admin'`). This is the only cross-component "logged out" signal — no context/event-bus abstraction.
- Backend error responses are always `{ error: string }` (plus `details` on 400 validation errors) — see `server/src/lib/httpError.ts`. `ApiError` in the client must carry `status`, `message`, and optional `details`.
- Out of scope, do not touch: `WorkUpdatesManager.tsx`, `ClientMessagesManager.tsx`, `ClientManager.tsx`, `ClientPortal.tsx`, `Portal.tsx` and their child components, all public marketing pages, `AdminSignup.tsx` (already dead/unrouted).
- Frontend tests run in vitest's Node environment (`vitest.config.ts` has `environment: "node"`, `include: ["src/**/*.test.ts"]` — no jsdom, no React Testing Library, `.tsx` files are not render-tested). Do not add jsdom/RTL as part of this plan.
- Backend tests use the existing `server/` vitest + supertest + `createTestPool`/`truncateAll` convention (see any `server/src/resources/*.test.ts`) — a real Postgres test database via `TEST_DATABASE_URL` must be reachable (Global Constraints of the original backend plan: `docker run` a `postgres:15-alpine` test container first if one isn't already running).
- Work happens in a dedicated git worktree, not directly on `main` — create one via the `superpowers:using-git-worktrees` skill before Task 1.
- **Checkpoint before remote/shared-state actions:** pause for explicit user confirmation before `git push` to the shared GitHub repo and before running any command on the VPS. Everything else (local file edits, local test runs, local commits) proceeds without pausing.

---

## Task 1: Backend — add DELETE routes to contact-submissions and quote-requests

**Files:**
- Modify: `server/src/resources/contactSubmissions.ts`
- Modify: `server/src/resources/contactSubmissions.test.ts`
- Modify: `server/src/resources/quoteRequests.ts`
- Modify: `server/src/resources/quoteRequests.test.ts`

**Interfaces:**
- Produces: `DELETE /api/contact-submissions/:id` → `204` on success, `404 { error: 'Contact submission not found' }` if missing, `401`/`403` per existing admin-gating convention.
- Produces: `DELETE /api/quote-requests/:id` → `204` on success, `404 { error: 'Quote request not found' }` if missing, `401`/`403` per existing admin-gating convention.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/resources/contactSubmissions.test.ts` (inside the existing `describe` block, as a new `it`):

```ts
  it('allows admins to delete a submission and returns 404 for a missing one', async () => {
    const app = buildApp();

    const submitted = await request(app)
      .post('/api/contact-submissions')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello there' });
    expect(submitted.status).toBe(201);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin2@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin2@drickly.test', isAdmin: true }, SECRET, '1h');

    const deleted = await request(app)
      .delete(`/api/contact-submissions/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);

    const missing = await request(app)
      .delete(`/api/contact-submissions/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });
```

Append to `server/src/resources/quoteRequests.test.ts` (inside the existing `describe` block):

```ts
  it('allows admins to delete a quote request and returns 404 for a missing one', async () => {
    const app = buildApp();

    const submitted = await request(app).post('/api/quote-requests').send({
      name: 'Jane',
      email: 'jane@example.com',
      project_type: 'Website',
      project_description: 'A marketing site',
      budget_range: '$5k-$10k',
    });
    expect(submitted.status).toBe(201);

    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin2@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin2@drickly.test', isAdmin: true }, SECRET, '1h');

    const deleted = await request(app)
      .delete(`/api/quote-requests/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleted.status).toBe(204);

    const missing = await request(app)
      .delete(`/api/quote-requests/${submitted.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test -- contactSubmissions quoteRequests`
Expected: both new tests FAIL — `DELETE /api/contact-submissions/:id` and `DELETE /api/quote-requests/:id` currently return 404 for "no matching route" behavior (Express falls through with no route registered), not the specific "not found" JSON shape asserted.

- [ ] **Step 3: Implement the DELETE routes**

In `server/src/resources/contactSubmissions.ts`, add after the existing `router.patch(...)` block, before `return router;`:

```ts
  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM contact_submissions WHERE id = $1 RETURNING id', [
        req.params.id,
      ]);
      if (!result.rows[0]) throw new HttpError(404, 'Contact submission not found');
      res.status(204).send();
    })
  );
```

In `server/src/resources/quoteRequests.ts`, add after the existing `router.patch(...)` block, before `return router;`:

```ts
  router.delete(
    '/:id',
    auth.requireAuth,
    auth.requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await pool.query('DELETE FROM quote_requests WHERE id = $1 RETURNING id', [
        req.params.id,
      ]);
      if (!result.rows[0]) throw new HttpError(404, 'Quote request not found');
      res.status(204).send();
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `server/`): `npm test -- contactSubmissions quoteRequests`
Expected: PASS (all tests in both files, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/contactSubmissions.ts server/src/resources/contactSubmissions.test.ts server/src/resources/quoteRequests.ts server/src/resources/quoteRequests.test.ts
git commit -m "feat(server): add DELETE routes for contact submissions and quote requests"
```

---

## Task 2: Backend — accept issue_date on invoice creation

**Files:**
- Modify: `server/src/resources/invoices.ts`
- Modify: `server/src/resources/invoices.test.ts`

**Interfaces:**
- Produces: `POST /api/invoices` now accepts an optional `issue_date` (ISO date string) in the body; when supplied it's stored instead of the column default (`now()`).

- [ ] **Step 1: Write the failing test**

Append to `server/src/resources/invoices.test.ts` (inside the existing `describe` block — check the file for the exact admin-token setup pattern already used there and reuse it; the shape below matches the convention seen in `contactSubmissions.test.ts`/`quoteRequests.test.ts`):

```ts
  it('stores a custom issue_date when provided on creation', async () => {
    const app = buildApp();
    const passwordHash = '$2a$12$abcdefghijklmnopqrstuv';
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, is_admin) VALUES ('admin3@drickly.test', $1, true) RETURNING id`,
      [passwordHash]
    );
    const adminToken = signAuthToken({ sub: admin.rows[0].id, email: 'admin3@drickly.test', isAdmin: true }, SECRET, '1h');

    const created = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        invoice_number: 'INV-BACKDATED-1',
        client_name: 'Jane',
        client_email: 'jane@example.com',
        due_date: '2026-09-01',
        issue_date: '2026-01-15',
        line_items: [],
      });

    expect(created.status).toBe(201);
    expect(new Date(created.body.issue_date).toISOString().slice(0, 10)).toBe('2026-01-15');
  });
```

(If `invoices.test.ts` doesn't already import `signAuthToken`/`request`/`buildApp`/`pool` at the top the way `contactSubmissions.test.ts` does, check the top of the file first — it's an existing test file, so those imports and helpers already exist there.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test -- invoices`
Expected: FAIL — the stored `issue_date` is `now()` (today), not `2026-01-15`, because the zod schema silently drops the unrecognized `issue_date` field.

- [ ] **Step 3: Implement**

In `server/src/resources/invoices.ts`, add `issue_date` to `invoiceSchema` (after `client_address`, before `due_date`):

```ts
const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_company: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  client_address: z.string().nullable().optional(),
  issue_date: z.string().optional(),
  due_date: z.string(),
  subtotal: z.number().default(0),
  discount: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  status: z.string().default('draft'),
  payment_instructions: z.string().nullable().optional(),
  line_items: z.array(lineItemSchema).default([]),
});
```

Update the `POST /` handler's INSERT to include `issue_date`, falling back to the column default when omitted. Replace the insert block inside `router.post('/', ...)`:

```ts
        const result = await client.query(
          `INSERT INTO invoices
            (invoice_number, client_name, client_email, client_company, client_phone, client_address,
             issue_date, due_date, subtotal, discount, tax, total, status, payment_instructions)
           VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()), $8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [
            body.invoice_number,
            body.client_name,
            body.client_email,
            body.client_company ?? null,
            body.client_phone ?? null,
            body.client_address ?? null,
            body.issue_date ?? null,
            body.due_date,
            body.subtotal,
            body.discount,
            body.tax,
            body.total,
            body.status,
            body.payment_instructions ?? null,
          ]
        );
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `server/`): `npm test -- invoices`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add server/src/resources/invoices.ts server/src/resources/invoices.test.ts
git commit -m "feat(server): accept issue_date on invoice creation"
```

---

## Task 3: Frontend — API client core + Vite dev proxy

**Files:**
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/client.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: `ApiError` class (`status: number`, `message: string`, `details?: unknown`).
- Produces: `getToken(): string | null`, `setToken(token: string): void`, `clearToken(): void`.
- Produces: `apiClient.get<T>(path)`, `apiClient.post<T>(path, body?)`, `apiClient.patch<T>(path, body?)`, `apiClient.put<T>(path, body?)`, `apiClient.delete<T>(path)` — all return `Promise<T>`, all prefix `path` with `/api`.
- Consumed by: every module in Tasks 4–7.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError, clearToken, getToken, setToken } from './client';

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

describe('token storage', () => {
  it('round-trips a token through localStorage', () => {
    expect(getToken()).toBeNull();
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('apiClient', () => {
  it('GETs a relative /api path and attaches the Bearer token when present', async () => {
    setToken('my-token');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiClient.get<{ hello: string }>('/services');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('GET');
    expect(init.headers.get('Authorization')).toBe('Bearer my-token');
    expect(result).toEqual({ hello: 'world' });
  });

  it('omits the Authorization header when no token is stored', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await apiClient.get('/testimonials');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBeNull();
  });

  it('POSTs a JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await apiClient.post('/services', { title: 'Web Dev' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Web Dev' }));
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for a 204 No Content response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiClient.delete('/services/abc');

    expect(result).toBeUndefined();
  });

  it('throws ApiError with the backend error message on a non-2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Service not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiClient.get('/services/missing')).rejects.toMatchObject(
      new ApiError(404, 'Service not found')
    );
  });

  it('includes zod validation details on a 400 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Validation failed', details: [{ path: ['title'], message: 'Required' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await apiClient.post('/services', {});
      throw new Error('expected apiClient.post to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).details).toEqual([{ path: ['title'], message: 'Required' }]);
    }
  });

  it('on a 401, clears the token and redirects to /admin', async () => {
    setToken('stale-token');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const win = { location: { href: '' } };
    vi.stubGlobal('window', win);

    await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBeNull();
    expect(win.location.href).toBe('/admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/api/client.test.ts`
Expected: FAIL with "Cannot find module './client'" (the file doesn't exist yet).

- [ ] **Step 3: Implement the client**

Create `src/lib/api/client.ts`:

```ts
const TOKEN_KEY = 'drickly_admin_token';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ErrorBody {
  error?: string;
  details?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/admin';
    throw new ApiError(401, 'Session expired');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'Request failed', body.details);
  }

  return (await response.json()) as T;
}

function withBody(method: string, body?: unknown): RequestInit {
  return { method, body: body !== undefined ? JSON.stringify(body) : undefined };
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('POST', body)),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('PATCH', body)),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('PUT', body)),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Add the Vite dev proxy**

Modify `vite.config.ts` — add a `proxy` block inside `server`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/api/client.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/client.ts src/lib/api/client.test.ts vite.config.ts
git commit -m "feat: add Drickly API client with Bearer auth and Vite dev proxy"
```

---

## Task 4: Frontend — auth module

**Files:**
- Create: `src/lib/api/auth.ts`
- Create: `src/lib/api/auth.test.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client` (Task 3).
- Produces: `AdminUser` interface (`id`, `email`, `full_name`, `is_admin`, `created_at`, `updated_at`), `login(email, password): Promise<AdminUser>`, `getCurrentUser(): Promise<AdminUser | null>`, `logout(): void`.
- Consumed by: Task 8 (`AdminPanel.tsx`, `AdminSidebar.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, setToken } from './client';
import { getCurrentUser, login, logout } from './auth';

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

const USER = {
  id: 'u1',
  email: 'owner@popupgenix.com',
  full_name: null,
  is_admin: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  stubStorage();
  vi.stubGlobal('window', { location: { href: '' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('stores the returned token and resolves the user', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-token', user: USER }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = await login('owner@popupgenix.com', 'correct-password');

    expect(user).toEqual(USER);
    expect(getToken()).toBe('jwt-token');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.body).toBe(JSON.stringify({ email: 'owner@popupgenix.com', password: 'correct-password' }));
  });
});

describe('getCurrentUser', () => {
  it('returns null immediately when no token is stored, without calling fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the user when the stored token is valid', async () => {
    setToken('valid-token');
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => USER });
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toEqual(USER);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/me');
  });

  it('returns null when the stored token is rejected (401)', async () => {
    setToken('stale-token');
    const win = { location: { href: '' } };
    vi.stubGlobal('window', win);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(getToken()).toBeNull();
  });
});

describe('logout', () => {
  it('clears the stored token', () => {
    setToken('some-token');
    logout();
    expect(getToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/api/auth.test.ts`
Expected: FAIL with "Cannot find module './auth'".

- [ ] **Step 3: Implement**

Create `src/lib/api/auth.ts`:

```ts
import { apiClient, clearToken, getToken, setToken } from './client';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface LoginResponse {
  token: string;
  user: AdminUser;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const { token, user } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  setToken(token);
  return user;
}

export async function getCurrentUser(): Promise<AdminUser | null> {
  if (!getToken()) return null;
  try {
    return await apiClient.get<AdminUser>('/auth/me');
  } catch {
    return null;
  }
}

export function logout(): void {
  clearToken();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/api/auth.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/auth.ts src/lib/api/auth.test.ts
git commit -m "feat: add auth module for the Drickly API (login/me/logout)"
```

---

## Task 5: Frontend — projects, services, and homepage-content modules

**Files:**
- Create: `src/lib/api/projects.ts`
- Create: `src/lib/api/services.ts`
- Create: `src/lib/api/services.test.ts`
- Create: `src/lib/api/homepageContent.ts`
- Create: `src/lib/api/homepageContent.test.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client`.
- Produces: `listProjects(): Promise<Project[]>`.
- Produces: `Service`, `ServiceInput`, `listServices()`, `createService(input)`, `updateService(id, input)`, `deleteService(id)`.
- Produces: `HomepageContent`, `HomepageContentInput`, `getHomepageContent(): Promise<HomepageContent | null>`, `saveHomepageContent(input): Promise<HomepageContent>`.
- Consumed by: Task 9 (`AdminDashboard.tsx` uses `listProjects`), Task 10 (`HomepageManager.tsx`), Task 11 (`ServicesManager.tsx`).

`projects.ts` has no test file — it's a single one-line wrapper with no branching logic, and its only caller (Task 9) exercises it directly against a real local server during manual verification.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/api/services.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createService, deleteService, listServices, updateService } from './services';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('services API module', () => {
  it('listServices GETs /api/services', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listServices();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('GET');
  });

  it('createService POSTs to /api/services', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await createService({ title: 'Web Dev', description: 'x', icon: 'code', features: [], order_index: 0, active: true });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services');
    expect(init.method).toBe('POST');
  });

  it('updateService PATCHes /api/services/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await updateService('1', { active: false });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ active: false }));
  });

  it('deleteService DELETEs /api/services/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteService('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/services/1');
    expect(init.method).toBe('DELETE');
  });
});
```

Create `src/lib/api/homepageContent.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomepageContent, saveHomepageContent } from './homepageContent';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('homepageContent API module', () => {
  it('getHomepageContent GETs /api/homepage-content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getHomepageContent();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/homepage-content');
    expect(init.method).toBe('GET');
    expect(result).toBeNull();
  });

  it('saveHomepageContent PUTs /api/homepage-content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await saveHomepageContent({
      hero_title: 'Hi',
      hero_subtitle: 'Sub',
      hero_cta_primary: 'Go',
      hero_cta_secondary: 'See',
      about_title: 'About',
      about_description: 'Desc',
      clients_count: 1,
      projects_count: 2,
      satisfaction_rate: 99,
      team_size: 5,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/homepage-content');
    expect(init.method).toBe('PUT');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/api/services.test.ts src/lib/api/homepageContent.test.ts`
Expected: FAIL with "Cannot find module './services'" / "Cannot find module './homepageContent'".

- [ ] **Step 3: Implement**

Create `src/lib/api/projects.ts`:

```ts
import { apiClient } from './client';

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  active: boolean;
  featured: boolean;
  completion_percentage: number;
  technologies: string[];
  image_url: string | null;
  project_url: string | null;
  client_name: string | null;
  client_user_id: string | null;
  next_milestone: string | null;
  eta_date: string | null;
  created_at: string;
  updated_at: string;
}

export function listProjects(): Promise<Project[]> {
  return apiClient.get<Project[]>('/projects');
}
```

Create `src/lib/api/services.ts`:

```ts
import { apiClient } from './client';

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
  order_index: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>;

export function listServices(): Promise<Service[]> {
  return apiClient.get<Service[]>('/services');
}

export function createService(input: Partial<ServiceInput>): Promise<Service> {
  return apiClient.post<Service>('/services', input);
}

export function updateService(id: string, input: Partial<ServiceInput>): Promise<Service> {
  return apiClient.patch<Service>(`/services/${id}`, input);
}

export function deleteService(id: string): Promise<void> {
  return apiClient.delete<void>(`/services/${id}`);
}
```

Create `src/lib/api/homepageContent.ts`:

```ts
import { apiClient } from './client';

export interface HomepageContent {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  about_title: string;
  about_description: string;
  clients_count: number;
  projects_count: number;
  satisfaction_rate: number;
  team_size: number;
  created_at: string;
  updated_at: string;
}

export type HomepageContentInput = Omit<HomepageContent, 'id' | 'created_at' | 'updated_at'>;

export function getHomepageContent(): Promise<HomepageContent | null> {
  return apiClient.get<HomepageContent | null>('/homepage-content');
}

export function saveHomepageContent(input: HomepageContentInput): Promise<HomepageContent> {
  return apiClient.put<HomepageContent>('/homepage-content', input);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/api/services.test.ts src/lib/api/homepageContent.test.ts`
Expected: PASS (4 tests in services.test.ts, 2 in homepageContent.test.ts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/projects.ts src/lib/api/services.ts src/lib/api/services.test.ts src/lib/api/homepageContent.ts src/lib/api/homepageContent.test.ts
git commit -m "feat: add projects, services, and homepage-content API modules"
```

---

## Task 6: Frontend — contact-submissions, quote-requests, and feedback modules

**Files:**
- Create: `src/lib/api/contactSubmissions.ts`
- Create: `src/lib/api/contactSubmissions.test.ts`
- Create: `src/lib/api/quoteRequests.ts`
- Create: `src/lib/api/quoteRequests.test.ts`
- Create: `src/lib/api/feedback.ts`
- Create: `src/lib/api/feedback.test.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client`; `Task 1`'s new DELETE routes.
- Produces: `ContactSubmission`, `listContactSubmissions()`, `deleteContactSubmission(id)`.
- Produces: `QuoteRequest`, `listQuoteRequests()`, `deleteQuoteRequest(id)`.
- Produces: `Feedback`, `listAdminFeedback()`, `updateFeedback(id, input)`, `deleteFeedback(id)`.
- Consumed by: Task 9 (dashboard), Task 12 (`TestimonialManager.tsx`), Task 13 (`MessagesManager.tsx`), Task 14 (`QuoteRequestsManager.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/api/contactSubmissions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteContactSubmission, listContactSubmissions } from './contactSubmissions';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contactSubmissions API module', () => {
  it('listContactSubmissions GETs /api/contact-submissions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listContactSubmissions();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/contact-submissions');
    expect(init.method).toBe('GET');
  });

  it('deleteContactSubmission DELETEs /api/contact-submissions/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteContactSubmission('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/contact-submissions/1');
    expect(init.method).toBe('DELETE');
  });
});
```

Create `src/lib/api/quoteRequests.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteQuoteRequest, listQuoteRequests } from './quoteRequests';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quoteRequests API module', () => {
  it('listQuoteRequests GETs /api/quote-requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listQuoteRequests();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/quote-requests');
    expect(init.method).toBe('GET');
  });

  it('deleteQuoteRequest DELETEs /api/quote-requests/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteQuoteRequest('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/quote-requests/1');
    expect(init.method).toBe('DELETE');
  });
});
```

Create `src/lib/api/feedback.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFeedback, listAdminFeedback, updateFeedback } from './feedback';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback API module', () => {
  it('listAdminFeedback GETs /api/testimonials/admin', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listAdminFeedback();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/admin');
    expect(init.method).toBe('GET');
  });

  it('updateFeedback PATCHes /api/testimonials/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) });
    vi.stubGlobal('fetch', mockFetch);

    await updateFeedback('1', { status: 'approved' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ status: 'approved' }));
  });

  it('deleteFeedback DELETEs /api/testimonials/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteFeedback('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/testimonials/1');
    expect(init.method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/api/contactSubmissions.test.ts src/lib/api/quoteRequests.test.ts src/lib/api/feedback.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/api/contactSubmissions.ts`:

```ts
import { apiClient } from './client';

export interface ContactSubmission {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string;
  budget_range: string | null;
  preferred_contact: string | null;
  status: string;
  priority: string;
}

export function listContactSubmissions(): Promise<ContactSubmission[]> {
  return apiClient.get<ContactSubmission[]>('/contact-submissions');
}

export function deleteContactSubmission(id: string): Promise<void> {
  return apiClient.delete<void>(`/contact-submissions/${id}`);
}
```

Create `src/lib/api/quoteRequests.ts`:

```ts
import { apiClient } from './client';

export interface QuoteRequest {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  project_type: string;
  project_description: string;
  budget_range: string;
  timeline: string | null;
  additional_requirements: string | null;
  status: string;
  estimated_cost: number | null;
  notes: string | null;
}

export function listQuoteRequests(): Promise<QuoteRequest[]> {
  return apiClient.get<QuoteRequest[]>('/quote-requests');
}

export function deleteQuoteRequest(id: string): Promise<void> {
  return apiClient.delete<void>(`/quote-requests/${id}`);
}
```

Create `src/lib/api/feedback.ts`:

```ts
import { apiClient } from './client';

export interface Feedback {
  id: string;
  client_id: string | null;
  client_name: string;
  client_email: string;
  client_company: string | null;
  project_id: string | null;
  rating: number;
  testimonial: string;
  status: string;
  featured: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function listAdminFeedback(): Promise<Feedback[]> {
  return apiClient.get<Feedback[]>('/testimonials/admin');
}

export function updateFeedback(id: string, input: { status?: string; featured?: boolean }): Promise<Feedback> {
  return apiClient.patch<Feedback>(`/testimonials/${id}`, input);
}

export function deleteFeedback(id: string): Promise<void> {
  return apiClient.delete<void>(`/testimonials/${id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/api/contactSubmissions.test.ts src/lib/api/quoteRequests.test.ts src/lib/api/feedback.test.ts`
Expected: PASS (2 tests each, 6 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/contactSubmissions.ts src/lib/api/contactSubmissions.test.ts src/lib/api/quoteRequests.ts src/lib/api/quoteRequests.test.ts src/lib/api/feedback.ts src/lib/api/feedback.test.ts
git commit -m "feat: add contact-submissions, quote-requests, and feedback API modules"
```

---

## Task 7: Frontend — invoices module

**Files:**
- Create: `src/lib/api/invoices.ts`
- Create: `src/lib/api/invoices.test.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client`; `Task 2`'s `issue_date` support.
- Produces: `Invoice`, `InvoiceLineItem`, `InvoiceWithLineItems`, `InvoiceInput`, `InvoiceLineItemInput`, `listInvoices()`, `createInvoice(input)`, `deleteInvoice(id)`.
- Consumed by: Task 15 (`InvoiceManager.tsx` + `InvoiceForm.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/invoices.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvoice, deleteInvoice, listInvoices } from './invoices';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invoices API module', () => {
  it('listInvoices GETs /api/invoices', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    await listInvoices();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices');
    expect(init.method).toBe('GET');
  });

  it('createInvoice POSTs the invoice with line items to /api/invoices', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: '1', line_items: [] }) });
    vi.stubGlobal('fetch', mockFetch);

    await createInvoice({
      invoice_number: 'INV-1',
      client_name: 'Jane',
      client_email: 'jane@example.com',
      due_date: '2026-09-01',
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      status: 'pending',
      line_items: [{ service_name: 'Design', quantity: 1, rate: 100, amount: 100 }],
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.line_items).toHaveLength(1);
  });

  it('deleteInvoice DELETEs /api/invoices/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    vi.stubGlobal('fetch', mockFetch);

    await deleteInvoice('1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/invoices/1');
    expect(init.method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/api/invoices.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/api/invoices.ts`:

```ts
import { apiClient } from './client';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  service_name: string;
  description: string | null;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  payment_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithLineItems extends Invoice {
  line_items: InvoiceLineItem[];
}

export interface InvoiceLineItemInput {
  service_name: string;
  description?: string | null;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceInput {
  invoice_number: string;
  client_name: string;
  client_email: string;
  client_company?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  issue_date?: string;
  due_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  payment_instructions?: string | null;
  line_items: InvoiceLineItemInput[];
}

export function listInvoices(): Promise<Invoice[]> {
  return apiClient.get<Invoice[]>('/invoices');
}

export function createInvoice(input: InvoiceInput): Promise<InvoiceWithLineItems> {
  return apiClient.post<InvoiceWithLineItems>('/invoices', input);
}

export function deleteInvoice(id: string): Promise<void> {
  return apiClient.delete<void>(`/invoices/${id}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/api/invoices.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/invoices.ts src/lib/api/invoices.test.ts
git commit -m "feat: add invoices API module"
```

---

## Task 8: Migrate admin login/session and sign-out

**Files:**
- Modify: `src/pages/AdminPanel.tsx`
- Modify: `src/pages/AdminPanel.test.ts` (the guard added in the security-fix session — keep it passing, it still applies)
- Modify: `src/components/AdminPanel/AdminSidebar.tsx`

**Interfaces:**
- Consumes: `login`, `getCurrentUser`, `logout`, `AdminUser` from `src/lib/api/auth` (Task 4).

- [ ] **Step 1: Replace AdminPanel.tsx's session logic**

Replace the Supabase import and the `useEffect`/`handleLogin` block in `src/pages/AdminPanel.tsx`. First, replace the import line:

```ts
import { AdminUser, getCurrentUser, login } from "@/lib/api/auth";
```

(remove `import { supabase } from "@/integrations/supabase/client";`)

Replace the component's state/effect/login handler (from `const [user, setUser] = useState<any>(null);` through the end of `handleLogin`) with:

```ts
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      if (currentUser?.email === ADMIN_EMAIL) {
        setUser(currentUser);
        setIsAdmin(true);
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoggingIn(true);
    try {
      const loggedInUser = await login(email, password);

      if (loggedInUser.email !== ADMIN_EMAIL) {
        throw new Error("This account is not authorized for admin access.");
      }

      setUser(loggedInUser);
      setIsAdmin(true);

      toast({
        title: "Success",
        description: "Logged in successfully",
      });
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
```

(Everything below this — the loading spinner, the login form JSX, the dashboard `Routes` — is unchanged.)

- [ ] **Step 2: Replace AdminSidebar.tsx's sign-out**

In `src/components/AdminPanel/AdminSidebar.tsx`, replace the import:

```ts
import { logout } from "@/lib/api/auth";
```

(remove `import { supabase } from "@/integrations/supabase/client";`)

Replace `handleSignOut`:

```ts
  const handleSignOut = () => {
    logout();
    toast({
      title: "Signed out successfully",
      description: "You have been logged out of the admin panel.",
    });
    window.location.href = "/admin";
  };
```

(No `try/catch` needed — `logout()` is synchronous and can't fail.)

- [ ] **Step 3: Run the existing regression test and the frontend build**

Run: `npm test -- src/pages/AdminPanel.test.ts`
Expected: PASS — `AdminPanel.tsx` still has no hardcoded `ADMIN_PASSWORD` and no local password comparison (that guard predates this task and must keep passing).

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 4: Manually verify in browser**

Prerequisite (only needs doing once, keep it running for all remaining tasks): in `server/`, create a local `.env` from `server/.env.example` pointed at a local Postgres, run `npm run db:migrate` then `npm run create-admin -- owner@popupgenix.com some-local-password`, then `npm run dev` (leaves the API on `http://localhost:4000`). In the frontend root, run `npm run dev` (Vite proxies `/api` to it per Task 3).

- Visit `http://localhost:8080/admin`.
- Try logging in with the wrong password → toast shows "Login Failed", stays on the login form.
- Log in with `owner@popupgenix.com` / the password you set with `create-admin` → lands on the dashboard (it will show loading/error states until Task 9, that's expected).
- Reload the page → still logged in (token persisted in `localStorage`, `/api/auth/me` validated it).
- Click "Sign Out" in the sidebar → returns to the login form; reloading stays logged out.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminPanel.tsx src/components/AdminPanel/AdminSidebar.tsx
git commit -m "feat: migrate admin login/session/sign-out to the Drickly API"
```

---

## Task 9: Migrate AdminDashboard.tsx

**Files:**
- Modify: `src/components/AdminPanel/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `listProjects` (Task 5), `listServices` (Task 5), `listAdminFeedback` (Task 6), `listContactSubmissions` (Task 6), and `GET /api/auth/users` (new — add a one-line helper inline, no dedicated module needed for a single admin-only endpoint used in exactly one place).

- [ ] **Step 1: Replace the data loading**

In `src/components/AdminPanel/AdminDashboard.tsx`, replace the Supabase import:

```ts
import { apiClient } from "@/lib/api/client";
import { listContactSubmissions } from "@/lib/api/contactSubmissions";
import { listAdminFeedback } from "@/lib/api/feedback";
import { listProjects } from "@/lib/api/projects";
import { listServices } from "@/lib/api/services";
```

(remove `import { supabase } from "@/integrations/supabase/client";`)

Replace `loadDashboardData`:

```ts
  const loadDashboardData = async () => {
    try {
      const [clients, projects, testimonials, services, submissions] = await Promise.all([
        apiClient.get<{ id: string }[]>('/auth/users'),
        listProjects(),
        listAdminFeedback(),
        listServices(),
        listContactSubmissions(),
      ]);

      const recentActivity = [...submissions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      setStats({
        totalClients: clients.length,
        activeProjects: projects.length,
        pendingTestimonials: testimonials.filter((t) => t.status === 'pending').length,
        totalServices: services.filter((s) => s.active).length,
        recentMessages: submissions.length,
        recentActivity,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };
```

Everything else in the file (interfaces, JSX) is unchanged — `submissions` items already carry `name`, `email`, `message`, `created_at`, `status`, matching what the `recentActivity` rendering expects.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Log in at `/admin`. The dashboard should load without console errors.
- Confirm the four stat tiles show real numbers matching what's in your local test Postgres (0s are fine on a fresh DB).
- Submit a test message via `POST http://localhost:4000/api/contact-submissions` (e.g. with `curl`) and reload — "Recent Client Messages" should show it.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/AdminDashboard.tsx
git commit -m "feat: migrate AdminDashboard to the Drickly API"
```

---

## Task 10: Migrate HomepageManager.tsx

**Files:**
- Modify: `src/components/AdminPanel/HomepageManager.tsx`

**Interfaces:**
- Consumes: `getHomepageContent`, `saveHomepageContent`, `HomepageContent` from `src/lib/api/homepageContent` (Task 5).

- [ ] **Step 1: Replace load/save**

Replace the Supabase import:

```ts
import { getHomepageContent, saveHomepageContent } from "@/lib/api/homepageContent";
```

Replace `loadHomepageContent`:

```ts
  const loadHomepageContent = async () => {
    setLoading(true);
    try {
      const data = await getHomepageContent();
      if (data) {
        setContent(data);
      }
    } catch (error) {
      console.error('Error loading homepage content:', error);
      toast({
        title: "Error",
        description: "Failed to load homepage content.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
```

Replace `saveContent` — the backend's `PUT /api/homepage-content` is a single upsert, so the insert-vs-update branch collapses:

```ts
  const saveContent = async () => {
    setSaving(true);
    try {
      const { id, ...input } = content;
      const saved = await saveHomepageContent(input);
      setContent(saved);

      toast({
        title: "Success",
        description: "Homepage content updated successfully!",
      });
    } catch (error) {
      console.error('Error saving content:', error);
      toast({
        title: "Error",
        description: "Failed to save content. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
```

`resetToDefaults` and the JSX are unchanged.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Go to `/admin/homepage`. Fields show either the defaults (fresh DB) or previously-saved content.
- Change the hero title, click "Save Changes" → success toast, reload the page → the new title persists.
- Click "Reset to Defaults" then "Save Changes" → confirm the reset values persist too.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/HomepageManager.tsx
git commit -m "feat: migrate HomepageManager to the Drickly API"
```

---

## Task 11: Migrate ServicesManager.tsx

**Files:**
- Modify: `src/components/AdminPanel/ServicesManager.tsx`

**Interfaces:**
- Consumes: `listServices`, `createService`, `updateService`, `deleteService`, `Service` from `src/lib/api/services` (Task 5).

- [ ] **Step 1: Replace the four Supabase calls**

Replace the Supabase import:

```ts
import { createService, deleteService, listServices, updateService } from "@/lib/api/services";
```

Keep the component's own local `interface Service {...}` block exactly as-is — do **not** import the `Service` type from `@/lib/api/services`. The API's `Service` type requires `created_at`/`updated_at` (it describes a row that already exists in the database), but `openEditDialog`'s "new service" literal further down this file has neither field — importing the API type here would make that literal fail to type-check. The local interface is a structural subset of the API type, so values from `listServices()` assign into it without friction; only the four functions are needed from the module.

Replace `loadServices`:

```ts
  const loadServices = async () => {
    try {
      const data = await listServices();
      setServices([...data].sort((a, b) => a.order_index - b.order_index));
    } catch (error) {
      console.error('Error loading services:', error);
      toast({
        title: "Error",
        description: "Failed to load services",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
```

Replace `saveService`:

```ts
  const saveService = async () => {
    if (!editingService) return;

    setSaving(true);
    try {
      const { id, ...fields } = editingService;
      const serviceData = {
        ...fields,
        features: fields.features.filter(f => f.trim() !== '')
      };

      if (id) {
        await updateService(id, serviceData);
      } else {
        await createService({ ...serviceData, order_index: services.length });
      }

      await loadServices();
      setIsDialogOpen(false);
      setEditingService(null);

      toast({
        title: "Success",
        description: `Service ${id ? 'updated' : 'created'} successfully!`,
      });
    } catch (error) {
      console.error('Error saving service:', error);
      toast({
        title: "Error",
        description: "Failed to save service. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
```

Replace `deleteService` (the local handler — rename to avoid shadowing the imported `deleteService`):

```ts
  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      await deleteService(id);
      await loadServices();
      toast({
        title: "Success",
        description: "Service deleted successfully!",
      });
    } catch (error) {
      console.error('Error deleting service:', error);
      toast({
        title: "Error",
        description: "Failed to delete service. Please try again.",
        variant: "destructive"
      });
    }
  };
```

Update the JSX's delete button `onClick` from `() => deleteService(service.id)` to `() => handleDeleteService(service.id)`.

Replace `toggleServiceStatus`:

```ts
  const toggleServiceStatus = async (service: Service) => {
    try {
      await updateService(service.id, { active: !service.active });
      await loadServices();
    } catch (error) {
      console.error('Error updating service status:', error);
      toast({
        title: "Error",
        description: "Failed to update service status",
        variant: "destructive"
      });
    }
  };
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Go to `/admin/services`. List loads (empty on a fresh DB).
- Click "Add Service", fill in title/description/features, save → appears in the grid, ordered last.
- Edit it, change the title, save → grid reflects the change.
- Click "Deactivate" → badge flips to "Inactive"; click "Activate" → flips back.
- Click delete, confirm the browser `confirm()` dialog → row disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/ServicesManager.tsx
git commit -m "feat: migrate ServicesManager to the Drickly API"
```

---

## Task 12: Migrate TestimonialManager.tsx

**Files:**
- Modify: `src/components/AdminPanel/TestimonialManager.tsx`

**Interfaces:**
- Consumes: `listAdminFeedback`, `updateFeedback`, `deleteFeedback` from `src/lib/api/feedback` (Task 6).

- [ ] **Step 1: Replace load/status-update/delete**

Replace the Supabase import:

```ts
import { deleteFeedback, listAdminFeedback, updateFeedback } from "@/lib/api/feedback";
```

Replace `loadTestimonials`:

```ts
  const loadTestimonials = async () => {
    try {
      const data = await listAdminFeedback();

      const formattedData: Testimonial[] = data
        .filter((item) => item.deleted_at === null)
        .map((item) => ({
          id: item.id,
          content: item.testimonial,
          rating: item.rating,
          status: item.status as Testimonial['status'],
          created_at: item.created_at,
          project_id: item.project_id || '',
          client_name: item.client_name || item.client_company || 'Anonymous',
          project_name: item.project_id ? 'Linked Project' : 'N/A',
        }));

      setTestimonials(formattedData);
    } catch (error) {
      console.error('Error loading testimonials:', error);
      toast({
        title: "Error",
        description: "Failed to load testimonials",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
```

Replace `updateTestimonialStatus`:

```ts
  const updateTestimonialStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateFeedback(id, { status });
      await loadTestimonials();
      toast({
        title: "Success",
        description: `Testimonial ${status} successfully!`,
      });
    } catch (error) {
      console.error('Error updating testimonial:', error);
      toast({
        title: "Error",
        description: "Failed to update testimonial status",
        variant: "destructive"
      });
    }
  };
```

Replace `deleteTestimonial` — the backend's `DELETE /api/testimonials/:id` already sets `deleted_at` server-side, so this becomes a real DELETE call instead of a manual `PATCH`:

```ts
  const deleteTestimonial = async (id: string) => {
    try {
      await deleteFeedback(id);
      await loadTestimonials();
      toast({
        title: "Success",
        description: "Testimonial moved to trash!",
      });
    } catch (error) {
      console.error('Error deleting testimonial:', error);
      toast({
        title: "Error",
        description: "Failed to delete testimonial",
        variant: "destructive"
      });
    }
  };
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Seed a testimonial: `curl -X POST http://localhost:4000/api/testimonials -H "Authorization: Bearer <a valid non-admin or admin token>" -H "Content-Type: application/json" -d '{"client_name":"Jane","client_email":"jane@example.com","rating":5,"testimonial":"Great work!"}'`
- Go to `/admin/testimonials` → the seeded testimonial shows under "Pending".
- Click "Approve" → moves to "Approved", stats update.
- Click "Delete" on it → disappears from the list (soft-deleted).

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/TestimonialManager.tsx
git commit -m "feat: migrate TestimonialManager to the Drickly API"
```

---

## Task 13: Migrate MessagesManager.tsx

**Files:**
- Modify: `src/components/AdminPanel/MessagesManager.tsx`

**Interfaces:**
- Consumes: `listContactSubmissions`, `deleteContactSubmission`, `ContactSubmission` from `src/lib/api/contactSubmissions` (Task 6); `Task 1`'s DELETE route.

- [ ] **Step 1: Replace load/bulk-delete**

Replace the Supabase import:

```ts
import { deleteContactSubmission, listContactSubmissions } from "@/lib/api/contactSubmissions";
```

Replace `loadMessages`:

```ts
  const loadMessages = async () => {
    try {
      const data = await listContactSubmissions();
      setMessages(data);
    } catch (err) {
      console.error("Error loading messages:", err);
      toast({
        title: "Failed to load messages",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
```

Replace `deleteSelected` — the backend only has a single-id DELETE, so the bulk action becomes parallel individual deletes:

```ts
  const deleteSelected = async () => {
    if (selected.length === 0) return;
    try {
      await Promise.all(selected.map((id) => deleteContactSubmission(id)));
      toast({ title: "Deleted", description: "Selected messages were deleted." });
      setSelected([]);
      await loadMessages();
    } catch (err) {
      console.error("Error deleting messages:", err);
      toast({ title: "Delete failed", description: "Please try again.", variant: "destructive" });
    }
  };
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Submit two test contact messages via `curl -X POST http://localhost:4000/api/contact-submissions -H "Content-Type: application/json" -d '{"name":"A","email":"a@example.com","message":"Hi"}'` (twice, different names).
- Go to `/admin/messages` → both rows show.
- Select both checkboxes, click "Delete selected" → both rows disappear, toast confirms.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/MessagesManager.tsx
git commit -m "feat: migrate MessagesManager to the Drickly API"
```

---

## Task 14: Migrate QuoteRequestsManager.tsx

**Files:**
- Modify: `src/components/AdminPanel/QuoteRequestsManager.tsx`

**Interfaces:**
- Consumes: `listQuoteRequests`, `deleteQuoteRequest`, `QuoteRequest` from `src/lib/api/quoteRequests` (Task 6); `Task 1`'s DELETE route.

- [ ] **Step 1: Replace load/bulk-delete**

Replace the Supabase import:

```ts
import { deleteQuoteRequest, listQuoteRequests } from "@/lib/api/quoteRequests";
```

Replace `loadQuotes`:

```ts
  const loadQuotes = async () => {
    try {
      const data = await listQuoteRequests();
      setQuotes(data);
    } catch (err) {
      console.error("Error loading quotes:", err);
      toast({ title: "Failed to load quotes", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
```

Replace `deleteSelected`:

```ts
  const deleteSelected = async () => {
    if (!selected.length) return;
    try {
      await Promise.all(selected.map((id) => deleteQuoteRequest(id)));
      toast({ title: "Deleted", description: "Selected quote requests were deleted." });
      setSelected([]);
      await loadQuotes();
    } catch (err) {
      console.error("Error deleting quotes:", err);
      toast({ title: "Delete failed", description: "Please try again.", variant: "destructive" });
    }
  };
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 3: Manually verify in browser**

- Submit a test quote via `curl -X POST http://localhost:4000/api/quote-requests -H "Content-Type: application/json" -d '{"name":"A","email":"a@example.com","project_type":"Website","project_description":"A site","budget_range":"$5k-$10k"}'`.
- Go to `/admin/quotes` → the row shows.
- Select it, click "Delete selected" → row disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminPanel/QuoteRequestsManager.tsx
git commit -m "feat: migrate QuoteRequestsManager to the Drickly API"
```

---

## Task 15: Migrate InvoiceManager.tsx and InvoiceForm.tsx

**Files:**
- Modify: `src/components/AdminPanel/InvoiceManager.tsx`
- Modify: `src/components/AdminPanel/InvoiceForm.tsx`

**Interfaces:**
- Consumes: `listInvoices`, `createInvoice`, `deleteInvoice`, `Invoice` from `src/lib/api/invoices` (Task 7); `Task 2`'s `issue_date` support.

- [ ] **Step 1: Replace InvoiceManager.tsx's load/delete**

Replace the Supabase import:

```ts
import { deleteInvoice, listInvoices } from "@/lib/api/invoices";
```

(the local `interface Invoice {...}` can stay — it's a display-only subset of fields, structurally compatible with the imported `Invoice` type, so no import needed there; but note the backend's client-side filter for `statusFilter` needs to move from a Supabase query builder to a plain array filter.)

Replace `loadInvoices` and the two `useEffect`s that call it:

```ts
  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await listInvoices();
      const filtered = statusFilter === "all" ? data : data.filter((inv) => inv.status === statusFilter);
      setInvoices(filtered);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast({
        title: "Error",
        description: "Failed to load invoices.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [statusFilter]);
```

(Delete the earlier standalone `useEffect(() => { loadInvoices(); }, []);` — the `[statusFilter]`-dependent effect above already runs on mount since `statusFilter` starts initialized.)

Replace `handleDelete`:

```ts
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    try {
      await deleteInvoice(id);
      toast({
        title: "Success",
        description: "Invoice deleted successfully.",
      });
      loadInvoices();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast({
        title: "Error",
        description: "Failed to delete invoice.",
        variant: "destructive",
      });
    }
  };
```

- [ ] **Step 2: Replace InvoiceForm.tsx's submit handler**

Replace the Supabase import:

```ts
import { createInvoice } from "@/lib/api/invoices";
```

Replace `handleSubmit`:

```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const subtotal = calculateSubtotal();
      const total = calculateTotal();

      await createInvoice({
        ...formData,
        subtotal,
        total,
        status: "pending",
        line_items: lineItems.map((item) => ({
          service_name: item.service_name,
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })),
      });

      toast({
        title: "Success",
        description: "Invoice created successfully!",
      });

      navigate("/admin/invoices");
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: builds with no new TypeScript errors.

- [ ] **Step 4: Manually verify in browser**

- Go to `/admin/invoices` (empty on a fresh DB).
- Click "Create Invoice", fill in client details, set a custom "Issue Date" in the past, add two line items, save → redirects to `/admin/invoices`, the new invoice shows with the correct total.
- Verify the backdated issue date stuck: `curl http://localhost:4000/api/invoices -H "Authorization: Bearer <admin token>"` and check the `issue_date` field matches what you entered (Task 2's fix).
- Filter by status (e.g. "Paid") → list narrows correctly; back to "All Statuses" → full list returns.
- Delete the invoice, confirm the dialog → disappears from the list.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminPanel/InvoiceManager.tsx src/components/AdminPanel/InvoiceForm.tsx
git commit -m "feat: migrate InvoiceManager and InvoiceForm to the Drickly API"
```

---

## Task 16: Deploy

This task is a checkpoint, not a TDD cycle — it touches the shared GitHub repo and the production VPS. Do not run any step in it without the user's explicit go-ahead, per Global Constraints.

- [ ] **Step 1: Run the full local test suite one more time**

From the repo root: `npm test`
From `server/`: `npm test`
Expected: both suites fully green.

- [ ] **Step 2: CHECKPOINT — confirm with the user before remote actions**

Stop here and get explicit confirmation before Steps 3–5.

- [ ] **Step 3: Push**

```bash
git push origin main
```

(Or open a PR first, if that's what the user prefers at execution time — same choice was offered for the backend plan's deploy.)

- [ ] **Step 4: Redeploy both containers on the VPS**

```bash
ssh drickly "cd ~/apps/drickly && git pull origin main && sudo docker compose up -d --build drickly-api drickly-frontend"
```

- [ ] **Step 5: Smoke test**

```bash
ssh drickly "curl -s http://localhost:8081/api/health"
ssh drickly "curl -s -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"owner@popupgenix.com\",\"password\":\"<current admin password>\"}'"
```

Then in an actual browser: visit `http://51.161.34.169:8081/admin`, log in, and click through all 7 migrated sub-pages once each, confirming each loads without a console error.

Report back to the user: which sub-pages were verified live, and remind them the Work Updates / Client Messages / Clients pages and the entire Client Portal are still on Supabase, unaffected by this phase.
