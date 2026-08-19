# Omnichannel Outreach Engine — Phase 1: Unified Outreach Domain

**Date:** 2026-08-18
**Status:** Approved for planning

## Context

The user requested a full omnichannel outreach engine (Email → LinkedIn →
WhatsApp → SMS → Telegram → Messenger → Instagram → Voice) built as a
unified architecture rather than eight disconnected integrations, to be
delivered in 8 phases, each production-ready before the next starts. This
spec covers **Phase 1 only: the Unified Outreach Domain** — schema, queue,
and interfaces. No real channel provider (Email/SMTP included) is built in
this phase; that starts in Phase 2.

## Scope discovery

A full audit of the existing codebase (`src/b2b/domain/`, `worker/`,
`supabase/migrations/`) found this is **not a greenfield build**:

- A complete B2B domain already exists and is live in Supabase Postgres:
  `companies`, `contacts` (with `opted_out`/`opted_out_at`), `leads`,
  `campaigns`, `campaign_leads` (with a human-approval gate),
  `outreach_messages`, `outreach_message_events`, `replies`, `meetings`,
  `agent_tasks`/`agent_runs`, `strategies`/`strategy_versions`, `research`,
  `lead_scores`, `analytics_events`, `lead_sources` — 17 tables total,
  defined in `supabase/migrations/20260813120*.sql`. `src/b2b/domain/` is
  currently pure Zod-schema TypeScript types mirroring these tables 1:1,
  with no persistence layer or repository code — nothing in `worker/` even
  imports it.
- A working Postgres job queue already exists: `agent_tasks`/`agent_runs`,
  claimed via `SELECT ... FOR UPDATE SKIP LOCKED`
  (`worker/src/tasks/claimResearchTasks.ts`). `task_type` already has an
  `'outreach'` value reserved. It is retryable but **not idempotent** and
  has **no stale-claim recovery** — acceptable for research, not for a
  sending system.
- An AI provider abstraction already exists
  (`worker/src/ai/`, `createAIProvider`, Mock/Claude implementations,
  contract-tested against each other). Its `generateOutreach` method is
  **already channel-parameterized** — no new abstraction needed for
  per-channel AI content generation.
- **Multi-tenancy is not built.** Zero `organization_id` exists anywhere in
  shipped code (confirmed by repo-wide grep). An approved design spec
  exists (`docs/superpowers/specs/2026-08-16-multi-tenancy-design.md`) but
  is barely started — one uncommitted scaffolding task of a four-subsystem
  plan. That approved design is **organization == workspace, one flat
  tenant boundary** — the user's spec asked for a two-level
  `organization_id` + `workspace_id` model, a direct conflict that had to
  be resolved before any schema work could start.

## Decisions (confirmed with the user)

1. **Tenant model: adopt the approved flat design as-is** — one
   `organization_id`, no separate `workspace_id`. Not the full four-subsystem
   multi-tenancy plan; just the slice Phase 1 needs (see below). Invitations
   (email/invite flow) are explicitly deferred — not needed until real
   teammates are being added to an org.
2. **Retrofit scope: all 17 existing b2b tables get `organization_id` now**,
   not just new outreach tables. Rejected the "new tables only" option
   because it would create tenanted/untenanted table joins (a scoped
   `conversation` joining to an unscoped `lead`) that would need
   reconciling later anyway — doing it once, now, is cheaper than doing it
   twice.

## Phase 1 scope boundary

**In scope:** schema (multi-tenancy foundation + outreach domain
extensions), queue generalization, the `ChannelAdapter` TypeScript
interface (contract only), the AI provider's new `selectChannel` method,
and a `MockChannelAdapter` so the whole domain is testable end-to-end
without a real channel existing yet.

**Explicitly out of scope for Phase 1** (each has a stated reason, not just
deferred by default):
- Any real channel provider (Email/SMTP/Resend, WhatsApp Cloud API, Twilio,
  etc.) — Phase 2 starts with Email.
- Real webhook HTTP receiver endpoints and signature validation — the
  `webhook_events` table and its shape exist now; the actual endpoints are
  built alongside each channel that needs them, since validation logic is
  provider-specific.
- Credential encryption utility implementation — `channel_accounts` has the
  column shape ready (`bytea` + app-level key), but there's no real secret
  to encrypt until Phase 2's first provider needs one. Building untested
  crypto code with nothing yet to protect is the kind of premature work
  the project's own conventions (YAGNI) argue against.
- Rate-limit *enforcement* — `channel_limits` defines the shape; the
  checking function that actually throttles sends is wired in once there's
  a real send path to throttle (Phase 2+).
- Frontend campaign builder UI — Phase 1 is backend/domain only.
- Multi-tenancy Subsystem 4 (invitations) and fine-grained RBAC UI — the
  `role` column exists (owner/admin/member) per the approved design, but
  Phase 1 doesn't need to differentiate their permissions for outreach
  data specifically (any org member gets full CRUD, matching the approved
  RLS design).

## Architecture

### 1. Multi-tenancy foundation

Two new tables, matching the approved design exactly:

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
```

`organization_id uuid NOT NULL REFERENCES organizations(id)` is added to
all 17 existing tables plus every new table below, following the approved
migration sequence: add nullable → backfill every existing row to a
`'Default Organization'` row (created for this migration, with the
existing admin user as its `owner` member) → `SET NOT NULL` → add the FK.

Root tables (organization_id set explicitly on insert, not derived):
`companies`, `lead_sources`, `strategies`, `campaigns`, `agent_tasks`,
`analytics_events`, plus new tables `channel_accounts`,
`suppression_list`, `channel_limits`.

Derived tables (organization_id copied from a parent FK via a
`BEFORE INSERT` trigger that rejects a mismatched explicit value, exactly
matching the approved design's existing mechanism): `contacts`, `leads`
(← `companies`), `lead_scores` (← `leads`), `strategy_versions` (←
`strategies`), `campaign_leads` (← `campaigns`, cross-checked against
`leads`), `outreach_messages` (← `conversations`, see below),
`outreach_message_events` (← `outreach_messages`), `replies` (← `leads`,
unchanged), `meetings` (← `leads`), `agent_runs` (← `agent_tasks`),
`conversations` (← `contacts`), `campaign_steps` (← `campaigns`),
`templates` (← `campaigns` when `scope='campaign'`, else root),
`webhook_events` (← `channel_accounts`). `research` keeps its existing
polymorphic resolution (`subject_type`/`subject_id`) per the approved
design.

RLS is rewritten per the approved design: any member of a row's
organization gets full CRUD on outreach data; `memberships`/
`organizations` get role-gated policies. **Important, carried over from
the approved design:** the worker's Postgres role has `BYPASSRLS`, so RLS
is not the isolation mechanism for anything the worker writes — the
triggers are. Any new outreach worker code must set/trust
`organization_id` explicitly, the same way `processResearchTask.ts` will
need to (see Queue section).

### 2. Outreach domain schema extensions

**`conversations`** (new) — groups messages across channels for one
contact:

```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  lead_id uuid REFERENCES leads(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
```

`lead_id` is nullable — a contact can have a conversation (e.g. an inbound
reply) before or without an active lead.

**`outreach_messages`** (extend in place — this is the existing table,
not a new one, per the "extend don't duplicate" decision):

```sql
ALTER TABLE outreach_messages
  ADD COLUMN conversation_id uuid REFERENCES conversations(id),
  ALTER COLUMN campaign_lead_id DROP NOT NULL;

ALTER TABLE outreach_messages
  DROP CONSTRAINT outreach_messages_direction_check,
  ADD CONSTRAINT outreach_messages_direction_check
    CHECK (direction IN ('inbound','outbound'));

ALTER TABLE outreach_messages
  DROP CONSTRAINT outreach_messages_status_check,
  ADD CONSTRAINT outreach_messages_status_check
    CHECK (status IN ('draft','approved','scheduled','queued','sending',
                       'sent','delivered','read','replied','failed',
                       'cancelled'));

ALTER TABLE outreach_messages
  ADD COLUMN provider text,
  ADD COLUMN provider_message_id text,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN replied_at timestamptz,
  ADD COLUMN failure_reason text;

CREATE UNIQUE INDEX idx_outreach_messages_provider_message_id
  ON outreach_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
```

`campaign_lead_id` becomes nullable because an inbound message (a reply to
a cold email, say) belongs to a `conversation`, not necessarily an active
`campaign_lead`. The existing `replies` table is untouched — no data
migration, no deletion; it keeps working for whatever currently reads it.
New inbound messages from Phase 2 onward land in `outreach_messages` with
`direction='inbound'`.

**`campaign_steps`** (new — the actual sequence/workflow engine, the
single biggest gap found in the audit):

```sql
CREATE TABLE campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  step_number integer NOT NULL,
  channel text NOT NULL,
  delay_minutes integer NOT NULL DEFAULT 0,
  condition_type text NOT NULL DEFAULT 'always'
    CHECK (condition_type IN ('always','no_reply','replied','bounced',
                               'channel_unavailable')),
  template_id uuid REFERENCES templates(id),
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_number)
);
```

`campaigns.channel` (today: exactly one channel per campaign) is left
alone for backward compatibility with any single-channel campaign; a
multi-step campaign simply has rows in `campaign_steps` instead.
`campaign_leads` gains two columns to track sequence progress:

```sql
ALTER TABLE campaign_leads
  ADD COLUMN current_step_number integer NOT NULL DEFAULT 0,
  ADD COLUMN next_action_at timestamptz;
```

**`templates`** (new, per the user's spec's templating requirements):

```sql
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  scope text NOT NULL CHECK (scope IN ('organization','campaign','personal')),
  owner_user_id uuid REFERENCES auth.users(id),
  campaign_id uuid REFERENCES campaigns(id),
  channel text NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  variables text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`scope` drops the user's original "workspace" tier (no workspace concept
in the flat model) but keeps organization/campaign/personal. `variables`
is the allow-list used to validate `{{first_name}}`-style tokens before a
template can be used — invalid variables are rejected at write time, not
send time.

**`channel_accounts`** (new — org-scoped provider credentials/config,
shape only, no real secret yet):

```sql
CREATE TABLE channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  channel text NOT NULL,
  provider text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled','error')),
  credentials_encrypted bytea,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**`suppression_list`** (new — cross-channel opt-out, distinct from the
existing `contacts.opted_out` boolean because a phone number can be
suppressed independently of an email address for the same contact, and
suppression must survive even if the contact record changes):

```sql
CREATE TABLE suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  channel text NOT NULL,
  identifier text NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('opt_out','bounced','complaint','manual',
                       'do_not_contact')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, identifier)
);
```

**`channel_limits`** (new — rate-limit configuration; enforcement logic
is Phase 2+, this is the shape):

```sql
CREATE TABLE channel_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  scope text NOT NULL
    CHECK (scope IN ('organization','campaign','channel',
                      'channel_account','recipient')),
  campaign_id uuid REFERENCES campaigns(id),
  channel text,
  channel_account_id uuid REFERENCES channel_accounts(id),
  max_count integer NOT NULL,
  period text NOT NULL CHECK (period IN ('minute','hour','day')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**`webhook_events`** (new — raw inbound log, dedup-safe; real receiver
endpoints come with each channel's phase):

```sql
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  channel_account_id uuid REFERENCES channel_accounts(id),
  provider text NOT NULL,
  event_type text,
  external_id text,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_webhook_events_provider_external_id
  ON webhook_events(provider, external_id)
  WHERE external_id IS NOT NULL;
```

`organization_id` is nullable here specifically because a raw webhook
payload arrives before it's been parsed enough to resolve which
`channel_account` (and therefore which org) it belongs to.

**Not built new** — reused as-is because they already do the job:
`outreach_message_events` already covers the spec's "message_events";
`agent_tasks`/`agent_runs` already covers "outreach_jobs".

### 3. Queue generalization

`worker/src/tasks/claimResearchTasks.ts` hardcodes `task_type='research'`
and a research-specific result type. Extract a generic claimer:

```ts
function claimTasks(pool: Pool, taskType: string, limit: number, workerId: string): Promise<ClaimedTask[]>
```

using the same `FOR UPDATE SKIP LOCKED` pattern, parameterized on
`task_type`. `processResearchTask.ts` becomes one handler registered
against this generic claimer, not the only consumer of it.

Two real gaps get closed, both required by the user's own spec
("jobs must be retryable, idempotent"), neither of which exist today:

- **Idempotency:** `agent_tasks` gains a nullable `idempotency_key text`
  column with `CREATE UNIQUE INDEX ... WHERE idempotency_key IS NOT NULL`.
  An outreach send job is enqueued with
  `idempotency_key = '${campaign_lead_id}:${step_number}'`; re-enqueuing
  the same step is a no-op via `ON CONFLICT DO NOTHING`.
- **Stale-claim recovery:** nothing today ever re-examines a row stuck in
  `status='claimed'` if the worker process dies mid-task. A new
  `reapStaleClaims(pool, staleAfterMinutes)` function resets
  `status='claimed' AND claimed_at < now() - interval` back to `'pending'`
  (incrementing `attempts`), run on a schedule alongside the existing
  cron-style task runners.

Backoff on retry is also added: `failTask` currently retries on the very
next cron tick. It instead pushes `scheduled_for = now() + backoff(attempts)`
(exponential: 1m, 5m, 30m, capped) before re-queuing.

`processResearchTask.ts` also gets the one small change the approved
multi-tenancy design already specifies: its `SELECT` picks up
`companies.organization_id` and passes it explicitly into the `research`
insert (required once that column is `NOT NULL`).

### 4. Channel adapter interface

A pure TypeScript contract, no implementations beyond the mock (below).
Capabilities are modeled explicitly per the user's requirement not to
invent unsupported ones — a real adapter declares which optional methods
it implements, callers check `capabilities` before calling them:

```ts
interface ChannelCapabilities {
  schedule: boolean;
  cancel: boolean;
  checkStatus: boolean;
  receive: boolean;
}

interface ChannelAdapter {
  channel: string;
  capabilities: ChannelCapabilities;
  send(message: OutboundMessage): Promise<SendResult>;
  checkStatus?(providerMessageId: string): Promise<DeliveryStatus>;
  schedule?(message: OutboundMessage, at: Date): Promise<SendResult>;
  cancel?(providerMessageId: string): Promise<void>;
  normalizeIncoming(raw: unknown): NormalizedInboundMessage;
  normalizeDeliveryEvent(raw: unknown): NormalizedDeliveryEvent;
}
```

### 5. AI channel selection

A new method on the existing `AIProvider` interface
(`worker/src/ai/AIProvider.ts`), following the exact pattern of the other
six methods — same file layout (`worker/src/ai/schemas/selectChannel.ts`
for input/output Zod schemas), same contract test
(`worker/src/ai/contracts.test.ts` extended to cover it), implemented in
both `MockAIProvider` (deterministic, reasonable canned choice) and
`ClaudeAIProvider` (real structured-output call):

```ts
selectChannel(input: SelectChannelInput): Promise<SelectChannelOutput>
// input: lead profile, company, past engagement/interactions,
//        available channels (from channel_accounts + contact's known
//        identifiers), campaign objective
// output: { channel, reasoning, confidence, fallbackOrder }
```

The workflow engine (`campaign_steps` evaluation) calls this when a step's
`channel` is left unset (AI-chooses) rather than hardcoded — but the AI's
choice is always filtered first against `suppression_list`, consent
(`contacts.opted_out`), and which `channel_accounts` actually exist for
the org, per the user's explicit requirement that AI recommendations never
override compliance rules. That filtering happens in application code
before the AI is even asked, not after — the AI only sees channels that
are already legal to use.

### 6. MockChannelAdapter

Implements `ChannelAdapter` fully, writing directly to `outreach_messages`
/ `outreach_message_events` as if a real send/delivery happened —
contract-identical output to a real adapter, exactly mirroring how
`MockAIProvider` already relates to `ClaudeAIProvider`. This is what makes
Phase 1 fully testable end-to-end (a lead really progressing through a
multi-step, multi-channel sequence, conditions really evaluating, jobs
really completing) without Phase 2's real Email integration existing yet.

## Testing

Matches the existing worker convention exactly: real local Postgres via
`TEST_DATABASE_URL`, `worker/src/test/schema.sql` gains every table/column
above (the multi-tenancy design already anticipated this file needing the
three tenancy tables; this phase adds the outreach tables to the same
file), `truncateAll()` gains the new tables, tests run sequentially
(`fileParallelism: false`) since they share one database.

One tooling risk carried over from the audit, worth naming even though not
fixed in this phase: `worker/src/test/schema.sql` is a hand-maintained
duplicate of the real migrations with no drift check. Phase 1 adds ~10
more tables to keep in sync by hand. Not fixed here (out of scope) but
flagged for a future cleanup — right now every schema change has to be
made in two places.

## Out of scope, deferred explicitly (not silently)

See "Phase 1 scope boundary" above for the full list with reasons. In
short: no real providers, no real webhook endpoints, no encryption
implementation, no rate-limit enforcement, no frontend, no invitations.
