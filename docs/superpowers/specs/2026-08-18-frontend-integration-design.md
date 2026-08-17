# Frontend Integration (Phase 2): Admin Panel → Drickly API

**Date:** 2026-08-18
**Status:** Approved for planning

## Context

The Drickly backend (self-hosted Postgres + Node/Express/TypeScript API, see
`docs/superpowers/plans/2026-08-14-drickly-backend.md`) replaced Supabase for
auth and data storage, and is live on the VPS. The frontend was explicitly
left untouched by that plan. This spec covers wiring the frontend to the new
API.

## Scope discovery

A full audit of every `supabase.*` call site in `src/` found the actual
surface area is much smaller than "the whole frontend":

- **Public marketing pages are fully static.** `/`, `/pricing`,
  `/services/*` never call Supabase for content. `getPublicTestimonials()` /
  `getFeaturedTestimonials()` in `src/lib/testimonials.ts` have zero callers
  — dead code. `homepage_content` and `services` are read only by the Admin
  Panel, never by the public site.
- **`/contact` has no form** — just `mailto:`/WhatsApp links. The only
  working writer to `contact_submissions` is a small form embedded in
  `/privacy` (`PrivacyPolicy.tsx`). `quote_requests` has no working public
  writer anywhere in the current frontend.
- The two systems that actually talk to Supabase at runtime are the **Admin
  Panel** (`/admin/*`) and the **Client Portal** (`/client/*`, `/portal/*`).

Of the Admin Panel's 10 sub-pages, 7 map cleanly onto resources the new
backend already implements (dashboard, homepage, services, testimonials,
messages/contact, quotes, invoices). Three (Work Updates, Client Messages,
Clients) and part of the dashboard (client-count tile — resolved, see below)
depend on data the backend explicitly deferred when it was built:
`profiles`, `client_updates`, `messages`, `documents`, and Supabase Storage
file uploads. The Client Portal depends on the same deferred data end to
end.

## Decision: scope is Admin Panel only, ready sub-pages only

**In scope for this phase:**
- Admin login/session (`AdminPanel.tsx`, `AdminSidebar.tsx` logout)
- `AdminDashboard.tsx` (all four stat sources, including the client-count
  tile — `GET /api/auth/users` returns non-admin users, so this isn't
  actually blocked)
- `HomepageManager.tsx`, `ServicesManager.tsx`, `TestimonialManager.tsx`,
  `MessagesManager.tsx`, `QuoteRequestsManager.tsx`, `InvoiceManager.tsx` +
  `InvoiceForm.tsx`

**Explicitly out of scope, left on Supabase unchanged:**
- `WorkUpdatesManager.tsx`, `ClientMessagesManager.tsx`,
  `ClientManager.tsx` — still work exactly as today, against Supabase.
  Revisited once a Client Portal backend (storage + messaging) exists.
- The entire Client Portal (`ClientPortal.tsx`, `Portal.tsx`, and their
  child components) — untouched.
- Public marketing pages — untouched (nothing to migrate; they're static).
- `AdminSignup.tsx` — already dead code (no route, no links anywhere in
  `App.tsx` or elsewhere). Left as-is; not worth deleting as part of this
  phase.

This means after this phase, the Admin Panel will run on **two backends
simultaneously** (new API for the 7 ready pages, Supabase for the 3
deferred pages) until a future phase builds Client Portal backend support.

## Architecture

### API client layer

New `src/lib/api/`, parallel to `src/integrations/supabase/`:

- **`client.ts`** — thin `fetch` wrapper. Base URL `/api` (relative — works
  through nginx in production, through a Vite dev proxy locally). Attaches
  `Authorization: Bearer <token>` from storage on every request. Parses
  JSON. Throws a typed `ApiError(status, message)` on any non-2xx response
  — the backend consistently replies `{ error: "..." }`
  (`server/src/lib/httpError.ts`), so this maps 1:1.
- **`auth.ts`** — `login(email, password)`, `logout()`, `getToken()`,
  `getCurrentUser()`, backed by `POST /api/auth/login` and
  `GET /api/auth/me`.
- One module per resource — `projects.ts`, `services.ts`,
  `homepageContent.ts`, `contactSubmissions.ts`, `quoteRequests.ts`,
  `invoices.ts`, `feedback.ts` — typed functions wrapping each REST
  endpoint (list/get/create/update/delete), mirroring the backend routers
  1:1. These are plain CRUD endpoints with no query-param filtering to
  reverse-engineer.

### Auth flow

- `login()` → `POST /api/auth/login` → `{ token, user }`. Token stored in
  `localStorage`.
- The backend has no refresh-token endpoint (fixed 7-day expiry, matching
  what's already built) — no silent refresh. Expiry just means the next
  `/api/auth/me` check or any `401` response sends the user back to the
  login screen.
- On mount: if a stored token exists, call `GET /api/auth/me` to validate
  it and load the current user. `401` → clear token, show login form. This
  replaces Supabase's `getSession()` / `onAuthStateChange` — there's no
  live cross-tab event stream, just a load-time check plus direct state
  updates on login/logout actions.
- After a successful login, still reject non-admin accounts client-side
  (same UX as today's hardcoded-email check) — `POST /api/auth/login` only
  verifies the password; `requireAdmin` middleware is what actually gates
  admin routes server-side.
- Any `401` from any API call anywhere in the admin panel → clear the
  token and send the user back to the login screen. No cross-component
  event bus; a full reload of `/admin` is enough for a single-admin app.

### Local development

`vite.config.ts` currently has no dev proxy, and the API container
publishes no host port in production (only reachable inside the VPS's
`drickly` Docker network) — pointing local dev at production data would
also be unsafe. This phase adds:

- A Vite dev proxy: `/api` → `http://localhost:4000`.
- Local development runs `npm run dev` inside `server/` (already exists,
  `tsx watch`) against a local/dockerized Postgres, fully isolated from
  production data.

### Error handling & loading states

No new UI patterns. Each Manager component already uses `useToast` for
errors and local `isLoading` state around its Supabase calls — the
migration swaps what's inside the `try/catch` from a Supabase call to an
API-client call, keeping the existing UX shape.

### Testing

The frontend's vitest config is Node-environment, `.test.ts`-only (no
jsdom/React Testing Library) — `.tsx` components aren't render-testable
today. This phase:

- Adds focused `.test.ts` unit tests for `src/lib/api/*` (request shape,
  header attachment, error mapping) against a mocked `fetch` — real,
  testable logic.
- Migrated components are verified manually in-browser, page by page,
  matching how this repo already tests UI today (no new test
  infrastructure introduced).

## Out of scope / explicitly deferred

- Client Portal backend (storage, messaging, `client_updates`) — separate
  future phase.
- Wiring the dead public forms (`quote_requests`, real `/contact` form) or
  making marketing pages data-driven — separate decision, not part of this
  phase.
- Rotating/removing the legacy hardcoded Supabase admin email allowlist
  pattern — the admin login UX keeps its current shape (a hardcoded
  `ADMIN_EMAIL` client-side check), just against the new API instead of
  Supabase.
