# Omnichannel Outreach Engine — Phase 1, Plan 3: Outreach Domain Schema & Interfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the tenant-isolated B2B schema with the outreach-domain tables (conversations,
extended outreach_messages, templates, campaign_steps, channel_accounts, suppression_list,
channel_limits, webhook_events), generalize the research-only job queue into a multi-task-type
queue with idempotency/backoff/stale-claim recovery, add an AI `selectChannel` capability, and
define the `ChannelAdapter` contract with a `MockChannelAdapter` reference implementation.

**Architecture:** Every new/derived table follows the exact `organization_id` +
`SECURITY DEFINER` trigger + RLS pattern established in Subsystem 1
(`docs/superpowers/plans/2026-08-16-multi-tenancy-organizations.md`) and Plan 2
(`docs/superpowers/plans/2026-08-18-multi-tenancy-tenant-isolation.md`). The queue is generalized
by extracting `claimResearchTasks`'s SQL into a generic `claimTasks(pool, workerId, taskType,
batchSize)`, with `claimResearchTasks` becoming a thin wrapper — no behavior change for existing
callers. `ChannelAdapter` is a pure TypeScript contract (no real provider code — Phase 2+ per the
design spec); `MockChannelAdapter` is its Mock-first reference implementation, mirroring the
`AIProvider`/`MockAIProvider` relationship already in this codebase.

**Tech Stack:** Postgres (Supabase migrations + RLS), Node/TypeScript worker (`pg` `Pool`, Vitest),
Zod schema-driven AI provider abstraction (existing `worker/src/ai/` module).

**Prerequisite:** This plan assumes Subsystem 1
(`docs/superpowers/plans/2026-08-16-multi-tenancy-organizations.md`) and Plan 2
(`docs/superpowers/plans/2026-08-18-multi-tenancy-tenant-isolation.md`) have already been executed
and merged — every SQL diff below is written against the **post-Plan-2** state of the schema and
of `worker/src/test/schema.sql` (organizations/memberships exist, `is_org_member(auth.uid(),
organization_id)` exists, all 17 existing tables carry `organization_id NOT NULL` + RLS, and
`worker/src/test/schema.sql` already has `organization_id UUID NOT NULL` on `companies`, `leads`,
`research`, `agent_tasks`, `agent_runs`). If executed before those land, every task below will fail
at the first migration/test step — do not attempt to reorder.

## Global Constraints

- **Additive-only migrations.** Every schema change is a new file under `supabase/migrations/`.
  Never edit an existing migration file, including ones created earlier in this same plan.
- **Every new/derived table gets `organization_id`.** Root tables (`channel_accounts`,
  `suppression_list`, `channel_limits`) take it as an explicit `NOT NULL` column set by the
  application. Derived tables (`conversations` from `contacts`; `templates` conditionally from
  `campaigns`; `campaign_steps` from `campaigns`) resolve it via a `BEFORE INSERT`
  `SECURITY DEFINER` trigger that rejects a mismatched explicit value. `webhook_events` is the one
  documented exception — `organization_id` is nullable because a webhook can arrive before its
  provider account can be resolved.
- **RLS policy pattern.** Every tenant-scoped table gets
  `USING (public.is_org_member(auth.uid(), organization_id)) WITH CHECK (public.is_org_member(auth.uid(), organization_id))`
  named `"Members manage <table>"`, exactly matching Plan 2's convention. `webhook_events` is the
  exception: members get read-only access to rows already attributed to their org; only a
  service-role connection (bypassing RLS) may insert.
- **No real channel provider integrations in this plan.** `ChannelAdapter` is a contract only.
  `MockChannelAdapter` is the only implementation, and it writes directly to `outreach_messages`
  as if delivered — mirroring `MockAIProvider`. No real email/LinkedIn/WhatsApp/SMS/etc. SDK code,
  no credential encryption implementation (the `channel_accounts.credentials_ciphertext` column
  exists for a future phase to populate), no real webhook HTTP endpoint, no rate-limit enforcement
  engine (`channel_limits` is config storage only in this phase).
- **AI channel selection never overrides compliance.** `selectChannel`'s input takes a
  pre-filtered `eligibleChannels` list (channels that have already passed suppression/consent
  checks by the caller) and its output is constrained to that same enum — the model is never given
  a way to introduce a channel that wasn't already eligible. This is a contract-level guarantee,
  not a runtime check the AI performs itself.
- **TDD every step.** Write the failing test, verify it fails for the right reason, implement,
  verify it passes, commit. Supabase-schema tasks run against `npx supabase db reset && npm run
  test:supabase` (real Supabase CLI stack, required for `auth.uid()`/RLS behavior). Worker tasks
  run against `npm test` inside `worker/` (a plain `TEST_DATABASE_URL` Postgres, no RLS).
- **No placeholders, no invented capabilities.** Every table, trigger, policy, interface method,
  and test below is complete, runnable code — nothing deferred to "add later."

---

### Task 1: `channel_accounts` (root table)

**Files:**
- Create: `supabase/migrations/20260818150000_outreach_domain_channel_accounts.sql`
- Create: `supabase/tests/channelAccounts.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.is_org_member(auth.uid(), organization_id)`
  (Subsystem 1), `createAdminClient`/`createOrgWithOwnerClient` (`supabase/tests/testHelpers.ts`,
  Plan 2 Task 1).
- Produces: `public.channel_accounts` — one row per connected sending identity (an email inbox, a
  WhatsApp Business number, a LinkedIn seat, etc.), referenced by `channel_limits` (Task 3),
  `webhook_events` (Task 4), and `conversations` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/channelAccounts.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("channel_accounts tenant isolation", () => {
  it("a member of org A cannot see org B's channel_accounts", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: accountB, error: insertError } = await clientB
      .from("channel_accounts")
      .insert({ organization_id: orgBId, channel: "email", provider: "mock", display_name: "Org B Inbox" })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("channel_accounts")
      .select("id")
      .eq("id", accountB!.id);
    expect(seenByA).toEqual([]);
  });

  it("rejects inserting a channel_account for a different organization", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId } = await createOrgWithOwnerClient(admin);

    const { error } = await clientA
      .from("channel_accounts")
      .insert({ organization_id: orgBId, channel: "email", provider: "mock", display_name: "Cross-org" });
    expect(error).not.toBeNull();
  });

  it("rejects an unknown channel value", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);

    const { error } = await clientA
      .from("channel_accounts")
      .insert({ organization_id: orgAId, channel: "carrier_pigeon", provider: "mock", display_name: "Bad" });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `channel_accounts` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150000_outreach_domain_channel_accounts.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: channel_accounts (root table).
-- One row per connected sending identity (an email inbox, a WhatsApp Business number, a
-- LinkedIn seat, etc.). credentials_ciphertext is a placeholder column for a future phase's
-- encryption implementation — this phase does not write to it.

CREATE TABLE public.channel_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  credentials_ciphertext TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_channel_accounts_organization_id ON public.channel_accounts (organization_id);

CREATE TRIGGER update_channel_accounts_updated_at
BEFORE UPDATE ON public.channel_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage channel_accounts"
ON public.channel_accounts
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150000_outreach_domain_channel_accounts.sql supabase/tests/channelAccounts.test.ts
git commit -m "feat: add channel_accounts table"
```

---

### Task 2: `suppression_list` (root table)

**Files:**
- Create: `supabase/migrations/20260818150100_outreach_domain_suppression_list.sql`
- Create: `supabase/tests/suppressionList.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.is_org_member`, `public.contacts` (existing,
  tenant-isolated by Plan 2 Task 1).
- Produces: `public.suppression_list` — the cross-channel do-not-contact registry. A `channel IS
  NULL` row means the identifier is suppressed on every channel (a full opt-out); a non-null
  `channel` row suppresses just that one.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/suppressionList.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("suppression_list tenant isolation", () => {
  it("a member of org A cannot see org B's suppression_list entries", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: entryB, error: insertError } = await clientB
      .from("suppression_list")
      .insert({ organization_id: orgBId, identifier: "blocked@example.com", reason: "opt_out" })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("suppression_list")
      .select("id")
      .eq("id", entryB!.id);
    expect(seenByA).toEqual([]);
  });

  it("rejects a duplicate (organization_id, channel, identifier) entry", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    await clientA
      .from("suppression_list")
      .insert({ organization_id: orgAId, channel: "email", identifier: "dup@example.com", reason: "opt_out" });

    const { error } = await clientA
      .from("suppression_list")
      .insert({ organization_id: orgAId, channel: "email", identifier: "dup@example.com", reason: "bounced" });
    expect(error).not.toBeNull();
  });

  it("allows the same identifier suppressed on two different channels", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    await clientA
      .from("suppression_list")
      .insert({ organization_id: orgAId, channel: "email", identifier: "multi@example.com", reason: "opt_out" });

    const { error } = await clientA
      .from("suppression_list")
      .insert({ organization_id: orgAId, channel: "sms", identifier: "multi@example.com", reason: "opt_out" });
    expect(error).toBeNull();
  });

  it("rejects an unknown reason value", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA
      .from("suppression_list")
      .insert({ organization_id: orgAId, identifier: "x@example.com", reason: "not_a_real_reason" });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `suppression_list` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150100_outreach_domain_suppression_list.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: suppression_list (root table).
-- channel IS NULL means suppressed on every channel; a non-null channel suppresses just that one.

CREATE TABLE public.suppression_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT CHECK (channel IS NULL OR channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  identifier TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('opt_out', 'bounced', 'complaint', 'manual', 'compliance')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppression_list_organization_id ON public.suppression_list (organization_id);

CREATE UNIQUE INDEX idx_suppression_list_org_channel_identifier
  ON public.suppression_list (organization_id, COALESCE(channel, ''), identifier);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage suppression_list"
ON public.suppression_list
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150100_outreach_domain_suppression_list.sql supabase/tests/suppressionList.test.ts
git commit -m "feat: add suppression_list table"
```

---

### Task 3: `channel_limits` (root table)

**Files:**
- Create: `supabase/migrations/20260818150200_outreach_domain_channel_limits.sql`
- Create: `supabase/tests/channelLimits.test.ts`

**Interfaces:**
- Consumes: `public.organizations`, `public.is_org_member`, `public.channel_accounts` (Task 1).
- Produces: `public.channel_limits` — rate-limit **configuration** rows (window + max sends). This
  phase stores config only; the enforcement engine that reads this table before every send is a
  later phase, per the design spec's explicit scope boundary.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/channelLimits.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("channel_limits tenant isolation", () => {
  it("a member of org A cannot see org B's channel_limits", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { orgId: orgBId, client: clientB } = await createOrgWithOwnerClient(admin);

    const { data: limitB, error: insertError } = await clientB
      .from("channel_limits")
      .insert({ organization_id: orgBId, channel: "email", window_seconds: 3600, max_sends: 50 })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA
      .from("channel_limits")
      .select("id")
      .eq("id", limitB!.id);
    expect(seenByA).toEqual([]);
  });

  it("rejects a non-positive max_sends", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA
      .from("channel_limits")
      .insert({ organization_id: orgAId, channel: "email", window_seconds: 3600, max_sends: 0 });
    expect(error).not.toBeNull();
  });

  it("accepts a limit scoped to a specific channel_account", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: account } = await clientA
      .from("channel_accounts")
      .insert({ organization_id: orgAId, channel: "email", provider: "mock", display_name: "Inbox" })
      .select()
      .single();

    const { data: limit, error } = await clientA
      .from("channel_limits")
      .insert({
        organization_id: orgAId,
        channel_account_id: account!.id,
        channel: "email",
        window_seconds: 86400,
        max_sends: 200,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(limit!.channel_account_id).toBe(account!.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `channel_limits` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150200_outreach_domain_channel_limits.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: channel_limits (root table, config only).
-- Enforcement (checking these before every send) is a later phase.

CREATE TABLE public.channel_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_account_id UUID REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  max_sends INTEGER NOT NULL CHECK (max_sends > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_channel_limits_organization_id ON public.channel_limits (organization_id);

CREATE TRIGGER update_channel_limits_updated_at
BEFORE UPDATE ON public.channel_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.channel_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage channel_limits"
ON public.channel_limits
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150200_outreach_domain_channel_limits.sql supabase/tests/channelLimits.test.ts
git commit -m "feat: add channel_limits table"
```

---

### Task 4: `webhook_events` (root table, nullable `organization_id`)

**Files:**
- Create: `supabase/migrations/20260818150300_outreach_domain_webhook_events.sql`
- Create: `supabase/tests/webhookEvents.test.ts`

**Interfaces:**
- Consumes: `public.channel_accounts` (Task 1).
- Produces: `public.webhook_events` — the raw inbound-webhook log a future phase's HTTP endpoint
  writes to (idempotent on `(provider, provider_event_id)`). `organization_id` is nullable because
  a webhook can arrive before its `channel_account_id` (and therefore its org) can be resolved.
  Only a service-role connection may insert; members get read-only access to rows already
  attributed to their org.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/webhookEvents.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("webhook_events visibility", () => {
  it("a member can see webhook_events attributed to their organization", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: event, error: insertError } = await admin
      .from("webhook_events")
      .insert({ organization_id: orgAId, channel: "email", provider: "mock", event_type: "delivered", payload: {} })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByA } = await clientA.from("webhook_events").select("id").eq("id", event!.id);
    expect(seenByA).toEqual([{ id: event!.id }]);
  });

  it("a member of a different organization cannot see it", async () => {
    const { orgId: orgAId } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const { data: event } = await admin
      .from("webhook_events")
      .insert({ organization_id: orgAId, channel: "email", provider: "mock", event_type: "delivered", payload: {} })
      .select()
      .single();

    const { data: seenByB } = await clientB.from("webhook_events").select("id").eq("id", event!.id);
    expect(seenByB).toEqual([]);
  });

  it("no member can see an unattributed (organization_id null) webhook_event", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: event } = await admin
      .from("webhook_events")
      .insert({ channel: "email", provider: "mock", event_type: "delivered", payload: {} })
      .select()
      .single();

    const { data: seenByA } = await clientA.from("webhook_events").select("id").eq("id", event!.id);
    expect(seenByA).toEqual([]);
  });

  it("a member cannot insert a webhook_event directly (service-role only)", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA
      .from("webhook_events")
      .insert({ organization_id: orgAId, channel: "email", provider: "mock", event_type: "delivered", payload: {} });
    expect(error).not.toBeNull();
  });

  it("enforces idempotency on (provider, provider_event_id)", async () => {
    const { orgId: orgAId } = await createOrgWithOwnerClient(admin);
    await admin.from("webhook_events").insert({
      organization_id: orgAId,
      channel: "email",
      provider: "mock",
      provider_event_id: "evt-dup-1",
      event_type: "delivered",
      payload: {},
    });

    const { error } = await admin.from("webhook_events").insert({
      organization_id: orgAId,
      channel: "email",
      provider: "mock",
      provider_event_id: "evt-dup-1",
      event_type: "delivered",
      payload: {},
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `webhook_events` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150300_outreach_domain_webhook_events.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: webhook_events (root table, nullable organization_id).
-- A future phase's HTTP webhook endpoint (service-role connection) is the only writer.

CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  channel_account_id UUID REFERENCES public.channel_accounts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_organization_id ON public.webhook_events (organization_id);

CREATE UNIQUE INDEX idx_webhook_events_provider_event_id
  ON public.webhook_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view attributed webhook_events"
ON public.webhook_events
FOR SELECT
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150300_outreach_domain_webhook_events.sql supabase/tests/webhookEvents.test.ts
git commit -m "feat: add webhook_events table"
```

---

### Task 5: `conversations` (derived from `contacts`)

**Files:**
- Create: `supabase/migrations/20260818150400_outreach_domain_conversations.sql`
- Create: `supabase/tests/conversations.test.ts`

**Interfaces:**
- Consumes: `public.contacts` (tenant-isolated by Plan 2 Task 1), `public.channel_accounts`
  (Task 1).
- Produces: `public.conversations` — one thread per `(contact, channel)`, at most one `open` at a
  time. Consumed by the extended `outreach_messages` (Task 6).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/conversations.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

async function seedContact(client: SupabaseClient, orgId: string) {
  const { data: company } = await client
    .from("companies")
    .insert({ name: "Co", organization_id: orgId })
    .select()
    .single();
  const { data: contact } = await client
    .from("contacts")
    .insert({ company_id: company!.id, full_name: "Jane Doe" })
    .select()
    .single();
  return contact!;
}

describe("conversations tenant isolation", () => {
  it("inherits organization_id from its contact", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const contactA = await seedContact(clientA, orgAId);

    const { data: convoA, error } = await clientA
      .from("conversations")
      .insert({ contact_id: contactA.id, channel: "email" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(convoA!.organization_id).toBe(orgAId);
  });

  it("a member of org B cannot see org A's conversations", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const contactA = await seedContact(clientA, orgAId);
    const { data: convoA } = await clientA
      .from("conversations")
      .insert({ contact_id: contactA.id, channel: "email" })
      .select()
      .single();

    const { data: seenByB } = await clientB.from("conversations").select("id").eq("id", convoA!.id);
    expect(seenByB).toEqual([]);
  });

  it("rejects a second open conversation on the same contact and channel", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const contactA = await seedContact(clientA, orgAId);
    await clientA.from("conversations").insert({ contact_id: contactA.id, channel: "email" });

    const { error } = await clientA.from("conversations").insert({ contact_id: contactA.id, channel: "email" });
    expect(error).not.toBeNull();
  });

  it("allows a second conversation on the same contact once the first is closed", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const contactA = await seedContact(clientA, orgAId);
    const { data: first } = await clientA
      .from("conversations")
      .insert({ contact_id: contactA.id, channel: "email" })
      .select()
      .single();
    await clientA.from("conversations").update({ status: "closed" }).eq("id", first!.id);

    const { error } = await clientA.from("conversations").insert({ contact_id: contactA.id, channel: "email" });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `conversations` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150400_outreach_domain_conversations.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: conversations (derived from contacts).

CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  channel_account_id UUID REFERENCES public.channel_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_inbound_at TIMESTAMP WITH TIME ZONE,
  last_outbound_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_conversations_organization_id ON public.conversations (organization_id);
CREATE INDEX idx_conversations_contact_id ON public.conversations (contact_id);

CREATE UNIQUE INDEX idx_conversations_contact_channel_open
  ON public.conversations (contact_id, channel)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.set_conversations_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.contacts WHERE id = NEW.contact_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'contact_id % has no organization_id or does not exist', NEW.contact_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: conversations must match its contact''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_conversations_organization_id
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_conversations_organization_id();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage conversations"
ON public.conversations
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

Note: `organization_id` is declared nullable then immediately set `NOT NULL` in the same file
(rather than `NOT NULL` inline) purely so the `BEFORE INSERT` trigger can populate it before the
constraint is checked on a fresh, empty table — there is no backfill step needed here (unlike
Plan 2's retrofits) since this is a brand-new table with zero existing rows.

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150400_outreach_domain_conversations.sql supabase/tests/conversations.test.ts
git commit -m "feat: add conversations table"
```

---

### Task 6: Extend `outreach_messages` (dual-parent: `conversations` or `campaign_leads`)

**Files:**
- Create: `supabase/migrations/20260818150500_outreach_domain_extend_outreach_messages.sql`
- Create: `supabase/tests/outreachMessagesExtended.test.ts`

**Interfaces:**
- Consumes: `public.conversations` (Task 5), `public.campaign_leads` (existing, tenant-isolated by
  Plan 2 Task 4), and Plan 2 Task 4's `public.set_outreach_messages_organization_id()` function,
  which this task replaces via `CREATE OR REPLACE FUNCTION` (same function/trigger name — no new
  `CREATE TRIGGER` needed, Postgres re-resolves the existing trigger to the replaced function body
  automatically).
- Produces: `outreach_messages` now accepts inbound and a wider status range, and derives
  `organization_id` from **either** `conversation_id` or `campaign_lead_id`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/outreachMessagesExtended.test.ts`:

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
  const { data: lead } = await client.from("leads").insert({ company_id: company!.id }).select().single();
  return lead!;
}

async function seedConversation(client: SupabaseClient, orgId: string) {
  const { data: company } = await client
    .from("companies")
    .insert({ name: "Co2", organization_id: orgId })
    .select()
    .single();
  const { data: contact } = await client
    .from("contacts")
    .insert({ company_id: company!.id, full_name: "Jane" })
    .select()
    .single();
  const { data: conversation } = await client
    .from("conversations")
    .insert({ contact_id: contact!.id, channel: "email" })
    .select()
    .single();
  return conversation!;
}

describe("outreach_messages extended (conversation-based + inbound)", () => {
  it("still derives organization_id from campaign_lead_id (regression)", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const leadA = await seedLead(clientA, orgAId);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C", channel: "email", organization_id: orgAId })
      .select()
      .single();
    const { data: campaignLeadA } = await clientA
      .from("campaign_leads")
      .insert({ campaign_id: campaignA!.id, lead_id: leadA.id })
      .select()
      .single();

    const { data: messageA, error } = await clientA
      .from("outreach_messages")
      .insert({ campaign_lead_id: campaignLeadA!.id, channel: "email", body: "hi" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(messageA!.organization_id).toBe(orgAId);
  });

  it("derives organization_id from conversation_id", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const convoA = await seedConversation(clientA, orgAId);

    const { data: messageA, error } = await clientA
      .from("outreach_messages")
      .insert({ conversation_id: convoA.id, channel: "email", direction: "inbound", body: "hello" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(messageA!.organization_id).toBe(orgAId);
    expect(messageA!.direction).toBe("inbound");
  });

  it("accepts the new delivered status", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const convoA = await seedConversation(clientA, orgAId);

    const { error } = await clientA
      .from("outreach_messages")
      .insert({ conversation_id: convoA.id, channel: "email", status: "delivered", body: "hi" });
    expect(error).toBeNull();
  });

  it("rejects a message with neither conversation_id nor campaign_lead_id", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA.from("outreach_messages").insert({ channel: "email", body: "orphan" });
    expect(error).not.toBeNull();
  });

  it("a member of org B cannot see org A's conversation-based messages", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const convoA = await seedConversation(clientA, orgAId);
    const { data: messageA } = await clientA
      .from("outreach_messages")
      .insert({ conversation_id: convoA.id, channel: "email", body: "secret" })
      .select()
      .single();

    const { data: seenByB } = await clientB.from("outreach_messages").select("id").eq("id", messageA!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `conversation_id` doesn't exist, `direction`/`status` CHECKs reject the new
values, and the first test (regression) currently PASSES already (it exercises unchanged
behavior) — everything else fails.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150500_outreach_domain_extend_outreach_messages.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: extend outreach_messages to be bidirectional and
-- conversation-aware, in place (not a new parallel table).

ALTER TABLE public.outreach_messages
  ADD COLUMN conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN provider TEXT,
  ADD COLUMN provider_message_id TEXT,
  ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN failed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN replied_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN failure_reason TEXT;

ALTER TABLE public.outreach_messages ALTER COLUMN campaign_lead_id DROP NOT NULL;

ALTER TABLE public.outreach_messages
  DROP CONSTRAINT outreach_messages_direction_check,
  ADD CONSTRAINT outreach_messages_direction_check CHECK (direction IN ('inbound', 'outbound'));

ALTER TABLE public.outreach_messages
  DROP CONSTRAINT outreach_messages_status_check,
  ADD CONSTRAINT outreach_messages_status_check CHECK (status IN (
    'draft','approved','scheduled','queued','sending','sent','delivered','read','replied','failed','cancelled'
  ));

ALTER TABLE public.outreach_messages
  ADD CONSTRAINT outreach_messages_conversation_or_campaign_lead_check
  CHECK (conversation_id IS NOT NULL OR campaign_lead_id IS NOT NULL);

CREATE INDEX idx_outreach_messages_conversation_id ON public.outreach_messages (conversation_id);

CREATE UNIQUE INDEX idx_outreach_messages_provider_message_id
  ON public.outreach_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_outreach_messages_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resolved_org_id UUID;
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT organization_id INTO _resolved_org_id FROM public.conversations WHERE id = NEW.conversation_id;
    IF _resolved_org_id IS NULL THEN
      RAISE EXCEPTION 'conversation_id % has no organization_id or does not exist', NEW.conversation_id;
    END IF;
  ELSIF NEW.campaign_lead_id IS NOT NULL THEN
    SELECT organization_id INTO _resolved_org_id FROM public.campaign_leads WHERE id = NEW.campaign_lead_id;
    IF _resolved_org_id IS NULL THEN
      RAISE EXCEPTION 'campaign_lead_id % has no organization_id or does not exist', NEW.campaign_lead_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'outreach_messages requires conversation_id or campaign_lead_id';
  END IF;

  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _resolved_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch for outreach_messages';
  END IF;
  NEW.organization_id := _resolved_org_id;
  RETURN NEW;
END;
$$;
```

This is additive (a new migration file), not an edit of Plan 2's migration file — `CREATE OR
REPLACE FUNCTION` on the same function name legitimately changes the existing `BEFORE INSERT`
trigger's behavior going forward without touching history, the same pattern the original codebase
already used for `public.is_admin`.

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS — including Plan 2's original `outreach_messages`/`outreach_message_events` tests
in `supabase/tests/tenantIsolationCampaignsOutreachMessages.test.ts`, unaffected by this change.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150500_outreach_domain_extend_outreach_messages.sql supabase/tests/outreachMessagesExtended.test.ts
git commit -m "feat: extend outreach_messages to be bidirectional and conversation-aware"
```

---

### Task 7: `templates` (conditionally derived: campaign-scoped from `campaigns`, else explicit)

**Files:**
- Create: `supabase/migrations/20260818150600_outreach_domain_templates.sql`
- Create: `supabase/tests/templates.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (existing, tenant-isolated by Plan 2 Task 4).
- Produces: `public.templates` — consumed by `campaign_steps.template_id` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/templates.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("templates", () => {
  it("campaign-scoped template inherits organization_id from its campaign", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C", channel: "email", organization_id: orgAId })
      .select()
      .single();

    const { data: template, error } = await clientA
      .from("templates")
      .insert({ scope: "campaign", campaign_id: campaignA!.id, channel: "email", name: "Step 1", body: "Hi {{firstName}}" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(template!.organization_id).toBe(orgAId);
  });

  it("organization-scoped template requires an explicit organization_id", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: template, error } = await clientA
      .from("templates")
      .insert({ scope: "organization", organization_id: orgAId, channel: "email", name: "Org template", body: "Hi" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(template!.organization_id).toBe(orgAId);
  });

  it("rejects an organization-scoped template with no organization_id", async () => {
    const { client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA
      .from("templates")
      .insert({ scope: "organization", channel: "email", name: "No org", body: "Hi" });
    expect(error).not.toBeNull();
  });

  it("rejects a campaign-scoped template with no campaign_id", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { error } = await clientA
      .from("templates")
      .insert({ scope: "campaign", organization_id: orgAId, channel: "email", name: "No campaign", body: "Hi" });
    expect(error).not.toBeNull();
  });

  it("a member of org B cannot see org A's templates", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const { data: template } = await clientA
      .from("templates")
      .insert({ scope: "organization", organization_id: orgAId, channel: "email", name: "Org template", body: "Hi" })
      .select()
      .single();

    const { data: seenByB } = await clientB.from("templates").select("id").eq("id", template!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `templates` doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150600_outreach_domain_templates.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: templates.
-- scope='campaign' derives organization_id from its campaign; scope IN ('organization','personal')
-- requires an explicit organization_id (personal-scope ownership enforcement beyond RLS's
-- org-wide visibility is deferred — documented limitation, not silently implemented).

CREATE TABLE public.templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  scope TEXT NOT NULL CHECK (scope IN ('organization', 'campaign', 'personal')),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT templates_scope_campaign_check CHECK (scope <> 'campaign' OR campaign_id IS NOT NULL),
  CONSTRAINT templates_scope_personal_check CHECK (scope <> 'personal' OR owner_user_id IS NOT NULL)
);

CREATE INDEX idx_templates_organization_id ON public.templates (organization_id);
CREATE INDEX idx_templates_campaign_id ON public.templates (campaign_id);

CREATE OR REPLACE FUNCTION public.set_templates_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  IF NEW.scope = 'campaign' THEN
    SELECT organization_id INTO _parent_org_id FROM public.campaigns WHERE id = NEW.campaign_id;
    IF _parent_org_id IS NULL THEN
      RAISE EXCEPTION 'campaign_id % has no organization_id or does not exist', NEW.campaign_id;
    END IF;
    IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
      RAISE EXCEPTION 'organization_id mismatch: campaign-scoped templates must match its campaign''s organization';
    END IF;
    NEW.organization_id := _parent_org_id;
  ELSE
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'templates with scope <> campaign must set organization_id explicitly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_templates_organization_id
BEFORE INSERT ON public.templates
FOR EACH ROW
EXECUTE FUNCTION public.set_templates_organization_id();

CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage templates"
ON public.templates
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150600_outreach_domain_templates.sql supabase/tests/templates.test.ts
git commit -m "feat: add templates table"
```

---

### Task 8: `campaign_steps` (derived from `campaigns`) + `campaign_leads` sequence columns

**Files:**
- Create: `supabase/migrations/20260818150700_outreach_domain_campaign_steps.sql`
- Create: `supabase/tests/campaignSteps.test.ts`

**Interfaces:**
- Consumes: `public.campaigns`, `public.templates` (Task 7).
- Produces: `public.campaign_steps` — the ordered touch sequence for a campaign.
  `campaign_leads.current_step_number` / `.next_action_at` track each lead's position in that
  sequence (plain columns, no trigger change — `campaign_leads.organization_id` is already
  resolved by Plan 2 Task 4's trigger).

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/campaignSteps.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createOrgWithOwnerClient } from "./testHelpers.js";

let admin: SupabaseClient;

beforeAll(() => {
  admin = createAdminClient();
});

describe("campaign_steps", () => {
  it("inherits organization_id from its campaign", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C", channel: "email", organization_id: orgAId })
      .select()
      .single();

    const { data: step, error } = await clientA
      .from("campaign_steps")
      .insert({ campaign_id: campaignA!.id, step_number: 1, channel: "email" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(step!.organization_id).toBe(orgAId);
  });

  it("rejects a duplicate step_number within the same campaign", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C2", channel: "email", organization_id: orgAId })
      .select()
      .single();
    await clientA.from("campaign_steps").insert({ campaign_id: campaignA!.id, step_number: 1, channel: "email" });

    const { error } = await clientA
      .from("campaign_steps")
      .insert({ campaign_id: campaignA!.id, step_number: 1, channel: "linkedin" });
    expect(error).not.toBeNull();
  });

  it("a member of org B cannot see org A's campaign_steps", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { client: clientB } = await createOrgWithOwnerClient(admin);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C3", channel: "email", organization_id: orgAId })
      .select()
      .single();
    const { data: step } = await clientA
      .from("campaign_steps")
      .insert({ campaign_id: campaignA!.id, step_number: 1, channel: "email" })
      .select()
      .single();

    const { data: seenByB } = await clientB.from("campaign_steps").select("id").eq("id", step!.id);
    expect(seenByB).toEqual([]);
  });

  it("accepts a template_id from the same organization", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C4", channel: "email", organization_id: orgAId })
      .select()
      .single();
    const { data: template } = await clientA
      .from("templates")
      .insert({ scope: "campaign", campaign_id: campaignA!.id, channel: "email", name: "T1", body: "Hi" })
      .select()
      .single();

    const { data: step, error } = await clientA
      .from("campaign_steps")
      .insert({ campaign_id: campaignA!.id, step_number: 1, channel: "email", template_id: template!.id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(step!.template_id).toBe(template!.id);
  });

  it("campaign_leads accepts current_step_number and next_action_at", async () => {
    const { orgId: orgAId, client: clientA } = await createOrgWithOwnerClient(admin);
    const { data: company } = await clientA
      .from("companies")
      .insert({ name: "Co", organization_id: orgAId })
      .select()
      .single();
    const { data: lead } = await clientA.from("leads").insert({ company_id: company!.id }).select().single();
    const { data: campaignA } = await clientA
      .from("campaigns")
      .insert({ name: "C5", channel: "email", organization_id: orgAId })
      .select()
      .single();

    const { data: campaignLead, error } = await clientA
      .from("campaign_leads")
      .insert({
        campaign_id: campaignA!.id,
        lead_id: lead!.id,
        current_step_number: 2,
        next_action_at: new Date().toISOString(),
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(campaignLead!.current_step_number).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:supabase`
Expected: FAIL — `campaign_steps` doesn't exist, `campaign_leads` has no
`current_step_number`/`next_action_at` columns.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818150700_outreach_domain_campaign_steps.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: campaign_steps (derived from campaigns) and
-- campaign_leads sequence-position columns.

CREATE TABLE public.campaign_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  channel TEXT NOT NULL CHECK (channel IN (
    'email','linkedin','whatsapp','sms','telegram','messenger','instagram','voice'
  )),
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  wait_days INTEGER NOT NULL DEFAULT 0 CHECK (wait_days >= 0),
  condition TEXT NOT NULL DEFAULT 'always' CHECK (condition IN ('always', 'no_reply', 'no_open')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT campaign_steps_campaign_step_unique UNIQUE (campaign_id, step_number)
);

ALTER TABLE public.campaign_steps ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_campaign_steps_organization_id ON public.campaign_steps (organization_id);
CREATE INDEX idx_campaign_steps_campaign_id ON public.campaign_steps (campaign_id);

CREATE OR REPLACE FUNCTION public.set_campaign_steps_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_org_id UUID;
BEGIN
  SELECT organization_id INTO _parent_org_id FROM public.campaigns WHERE id = NEW.campaign_id;
  IF _parent_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_id % has no organization_id or does not exist', NEW.campaign_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> _parent_org_id THEN
    RAISE EXCEPTION 'organization_id mismatch: campaign_steps must match its campaign''s organization';
  END IF;
  NEW.organization_id := _parent_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_campaign_steps_organization_id
BEFORE INSERT ON public.campaign_steps
FOR EACH ROW
EXECUTE FUNCTION public.set_campaign_steps_organization_id();

CREATE TRIGGER update_campaign_steps_updated_at
BEFORE UPDATE ON public.campaign_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage campaign_steps"
ON public.campaign_steps
FOR ALL
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

ALTER TABLE public.campaign_leads
  ADD COLUMN current_step_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_action_at TIMESTAMP WITH TIME ZONE;
```

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818150700_outreach_domain_campaign_steps.sql supabase/tests/campaignSteps.test.ts
git commit -m "feat: add campaign_steps and campaign_leads sequence columns"
```

---

### Task 9: Queue generalization (`claimTasks`, idempotency, stale-claim recovery, backoff)

**Files:**
- Create: `supabase/migrations/20260818150800_outreach_domain_queue_idempotency.sql`
- Create: `worker/src/tasks/claimTasks.ts`
- Create: `worker/src/tasks/claimTasks.test.ts`
- Create: `worker/src/tasks/reapStaleClaims.ts`
- Create: `worker/src/tasks/reapStaleClaims.test.ts`
- Create: `worker/src/tasks/failTask.ts`
- Create: `worker/src/tasks/failTask.test.ts`
- Modify: `worker/src/tasks/claimResearchTasks.ts` (becomes a thin wrapper over `claimTasks`)
- Modify: `worker/src/tasks/processResearchTask.ts` (uses the shared `failTask`)
- Modify: `worker/src/test/schema.sql` (add `idempotency_key` to `agent_tasks`)

**Interfaces:**
- Consumes: `agent_tasks` (existing, post-Plan-2 shape with `organization_id NOT NULL`).
- Produces: `claimTasks(pool, workerId, taskType, batchSize): Promise<ClaimedTask[]>` — the generic
  engine every future task-type worker (outreach send, webhook processing, etc.) will call.
  `reapStaleClaims(pool, staleAfterMinutes): Promise<number>`. `failTask(pool, task, message):
  Promise<FailTaskResult>` — now reschedules retryable tasks with exponential backoff instead of
  making them immediately re-claimable.

- [ ] **Step 1: Write the migration for `idempotency_key`**

Create `supabase/migrations/20260818150800_outreach_domain_queue_idempotency.sql`:

```sql
-- Omnichannel Outreach Engine Phase 1: idempotency_key on agent_tasks, so a caller can safely
-- retry task-creation without producing duplicate work.

ALTER TABLE public.agent_tasks ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX idx_agent_tasks_idempotency_key
  ON public.agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS (no existing test asserts against this column; it's purely additive).

- [ ] **Step 2: Commit the migration**

```bash
git add supabase/migrations/20260818150800_outreach_domain_queue_idempotency.sql
git commit -m "feat: add idempotency_key to agent_tasks"
```

- [ ] **Step 3: Update the worker's test schema**

`worker/src/test/schema.sql` is a hand-maintained subset (see Plan 2 Task 8 for its post-tenancy
shape). Add `idempotency_key TEXT,` to `agent_tasks` and its matching partial unique index.
Replace the file's full contents with:

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
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idempotency_key
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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

- [ ] **Step 4: Write the failing test for the generic `claimTasks`**

Create `worker/src/tasks/claimTasks.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { claimTasks } from "./claimTasks.js";

let pool: Pool;
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("claimTasks", () => {
  it("claims pending tasks of the requested task_type only", async () => {
    await pool.query(
      "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'outreach', 'pending', '{}')",
      [TEST_ORG_ID]
    );
    await pool.query(
      "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'research', 'pending', '{}')",
      [TEST_ORG_ID]
    );

    const claimed = await claimTasks(pool, "worker-1", "outreach", 5);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].task_type).toBe("outreach");
  });

  it("marks claimed rows with the given workerId", async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO agent_tasks (organization_id, task_type, status, payload) VALUES ($1, 'outreach', 'pending', '{}') RETURNING id",
      [TEST_ORG_ID]
    );

    await claimTasks(pool, "worker-9", "outreach", 5);

    const task = await pool.query("SELECT status, claimed_by FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("claimed");
    expect(task.rows[0].claimed_by).toBe("worker-9");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run (from `worker/`): `npm test -- claimTasks`
Expected: FAIL — `claimTasks.ts` doesn't exist yet.

- [ ] **Step 6: Implement `claimTasks`**

Create `worker/src/tasks/claimTasks.ts`:

```ts
import type { Pool } from "pg";

export interface ClaimedTask {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimTasks(
  pool: Pool,
  workerId: string,
  taskType: string,
  batchSize: number
): Promise<ClaimedTask[]> {
  const { rows } = await pool.query<ClaimedTask>(
    `UPDATE agent_tasks
     SET status = 'claimed', claimed_by = $1, claimed_at = now()
     WHERE id IN (
       SELECT id FROM agent_tasks
       WHERE task_type = $2 AND status = 'pending' AND scheduled_for <= now()
       ORDER BY priority DESC, scheduled_for ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, task_type, payload, attempts, max_attempts`,
    [workerId, taskType, batchSize]
  );
  return rows;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run (from `worker/`): `npm test -- claimTasks`
Expected: PASS.

- [ ] **Step 8: Rewrite `claimResearchTasks` as a thin wrapper**

Replace `worker/src/tasks/claimResearchTasks.ts` in full:

```ts
import type { Pool } from "pg";
import { claimTasks } from "./claimTasks.js";

export interface ClaimedResearchTask {
  id: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimResearchTasks(
  pool: Pool,
  workerId: string,
  batchSize: number
): Promise<ClaimedResearchTask[]> {
  const rows = await claimTasks(pool, workerId, "research", batchSize);
  return rows.map(({ id, payload, attempts, max_attempts }) => ({ id, payload, attempts, max_attempts }));
}
```

This preserves the exact existing exported shape (no `task_type` field), so
`processResearchTask.ts` and `claimResearchTasks.test.ts`/`processResearchTask.test.ts` need no
changes for this step.

- [ ] **Step 9: Run the existing research-queue tests to confirm the refactor is behavior-preserving**

Run (from `worker/`): `npm test -- claimResearchTasks processResearchTask`
Expected: PASS — unchanged, now exercising the shared `claimTasks` engine transitively.

- [ ] **Step 10: Commit the queue generalization**

```bash
git add worker/src/test/schema.sql worker/src/tasks/claimTasks.ts worker/src/tasks/claimTasks.test.ts worker/src/tasks/claimResearchTasks.ts
git commit -m "refactor(worker): generalize claimResearchTasks into a generic claimTasks engine"
```

- [ ] **Step 11: Write the failing test for `reapStaleClaims`**

Create `worker/src/tasks/reapStaleClaims.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { reapStaleClaims } from "./reapStaleClaims.js";

let pool: Pool;
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("reapStaleClaims", () => {
  it("returns a stuck claimed task to pending after the staleness window", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (organization_id, task_type, status, payload, claimed_by, claimed_at)
       VALUES ($1, 'research', 'claimed', '{}', 'worker-dead', now() - interval '20 minutes')
       RETURNING id`,
      [TEST_ORG_ID]
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(1);
    const task = await pool.query("SELECT status, claimed_by, claimed_at FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("pending");
    expect(task.rows[0].claimed_by).toBeNull();
    expect(task.rows[0].claimed_at).toBeNull();
  });

  it("leaves a recently claimed task untouched", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks (organization_id, task_type, status, payload, claimed_by, claimed_at)
       VALUES ($1, 'research', 'claimed', '{}', 'worker-live', now())
       RETURNING id`,
      [TEST_ORG_ID]
    );

    const reaped = await reapStaleClaims(pool, 10);

    expect(reaped).toBe(0);
    const task = await pool.query("SELECT status FROM agent_tasks WHERE id = $1", [rows[0].id]);
    expect(task.rows[0].status).toBe("claimed");
  });
});
```

- [ ] **Step 12: Run the test to verify it fails**

Run (from `worker/`): `npm test -- reapStaleClaims`
Expected: FAIL — `reapStaleClaims.ts` doesn't exist yet.

- [ ] **Step 13: Implement `reapStaleClaims`**

Create `worker/src/tasks/reapStaleClaims.ts`:

```ts
import type { Pool } from "pg";

export async function reapStaleClaims(pool: Pool, staleAfterMinutes: number): Promise<number> {
  const result = await pool.query(
    `UPDATE agent_tasks
     SET status = 'pending', claimed_by = NULL, claimed_at = NULL
     WHERE status = 'claimed' AND claimed_at < now() - ($1 || ' minutes')::interval`,
    [staleAfterMinutes]
  );
  return result.rowCount ?? 0;
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run (from `worker/`): `npm test -- reapStaleClaims`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add worker/src/tasks/reapStaleClaims.ts worker/src/tasks/reapStaleClaims.test.ts
git commit -m "feat(worker): add reapStaleClaims for stuck claimed tasks"
```

- [ ] **Step 16: Write the failing test for the shared `failTask` with backoff**

Create `worker/src/tasks/failTask.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { failTask } from "./failTask.js";

let pool: Pool;
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedTask(attempts: number, maxAttempts: number) {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO agent_tasks (organization_id, task_type, status, payload, attempts, max_attempts) VALUES ($1, 'research', 'pending', '{}', $2, $3) RETURNING id",
    [TEST_ORG_ID, attempts, maxAttempts]
  );
  return { id: rows[0].id, attempts, max_attempts: maxAttempts };
}

describe("failTask", () => {
  it("reschedules a retryable task into the future using exponential backoff", async () => {
    const task = await seedTask(0, 3);
    const before = new Date();

    await failTask(pool, task, "boom");

    const { rows } = await pool.query("SELECT status, attempts, scheduled_for FROM agent_tasks WHERE id = $1", [task.id]);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(new Date(rows[0].scheduled_for).getTime()).toBeGreaterThan(before.getTime() + 50_000);
  });

  it("marks the task permanently failed once max_attempts is reached, without touching scheduled_for", async () => {
    const task = await seedTask(2, 3);
    const originalScheduledFor = (
      await pool.query("SELECT scheduled_for FROM agent_tasks WHERE id = $1", [task.id])
    ).rows[0].scheduled_for;

    await failTask(pool, task, "boom");

    const { rows } = await pool.query("SELECT status, scheduled_for FROM agent_tasks WHERE id = $1", [task.id]);
    expect(rows[0].status).toBe("failed");
    expect(new Date(rows[0].scheduled_for).getTime()).toBe(new Date(originalScheduledFor).getTime());
  });

  it("returns a failed result carrying the error message", async () => {
    const task = await seedTask(0, 3);

    const result = await failTask(pool, task, "upstream boom");

    expect(result).toEqual({ taskId: task.id, status: "failed", error: "upstream boom" });
  });
});
```

- [ ] **Step 17: Run the test to verify it fails**

Run (from `worker/`): `npm test -- failTask`
Expected: FAIL — `failTask.ts` doesn't exist yet as a standalone module.

- [ ] **Step 18: Implement the shared `failTask`**

Create `worker/src/tasks/failTask.ts`:

```ts
import type { Pool } from "pg";

export interface FailableTask {
  id: string;
  attempts: number;
  max_attempts: number;
}

export interface FailTaskResult {
  taskId: string;
  status: "failed";
  error: string;
}

export async function failTask(
  pool: Pool,
  task: FailableTask,
  message: string
): Promise<FailTaskResult> {
  const attempts = task.attempts + 1;
  const nextStatus = attempts < task.max_attempts ? "pending" : "failed";
  const backoffSeconds = Math.min(2 ** attempts * 30, 3600);
  await pool.query(
    `UPDATE agent_tasks
     SET status = $1,
         attempts = $2,
         scheduled_for = CASE WHEN $1 = 'pending' THEN now() + ($4 || ' seconds')::interval ELSE scheduled_for END
     WHERE id = $3`,
    [nextStatus, attempts, task.id, backoffSeconds]
  );
  return { taskId: task.id, status: "failed", error: message };
}
```

- [ ] **Step 19: Run the test to verify it passes**

Run (from `worker/`): `npm test -- failTask`
Expected: PASS.

- [ ] **Step 20: Wire `processResearchTask.ts` to the shared `failTask`**

In `worker/src/tasks/processResearchTask.ts`, replace the import block and remove the private
`failTask` function at the bottom of the file. Change the top imports from:

```ts
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import type { ClaimedResearchTask } from "./claimResearchTasks.js";
```

to:

```ts
import type { Pool } from "pg";
import type { AIProvider } from "../ai/AIProvider.js";
import type { ClaimedResearchTask } from "./claimResearchTasks.js";
import { failTask } from "./failTask.js";
```

Delete the file's own `async function failTask(...)` definition (the last function in the file) —
the three call sites (`return failTask(pool, task, "...")`) are unchanged since `ClaimedResearchTask`
already structurally satisfies `FailableTask` (`id`, `attempts`, `max_attempts`).

- [ ] **Step 21: Run the full worker suite**

Run (from `worker/`): `npm test`
Expected: PASS — `processResearchTask.test.ts`'s existing failure-path tests (which assert
`status`/`attempts` but never `scheduled_for`) are unaffected by the added backoff.

- [ ] **Step 22: Commit**

```bash
git add worker/src/tasks/failTask.ts worker/src/tasks/failTask.test.ts worker/src/tasks/processResearchTask.ts
git commit -m "feat(worker): extract shared failTask with exponential backoff"
```

---

### Task 10: AI `selectChannel` capability

**Files:**
- Create: `worker/src/ai/schemas/selectChannel.ts`
- Create: `worker/src/ai/schemas/selectChannel.test.ts`
- Modify: `worker/src/ai/schemas/index.ts`
- Modify: `worker/src/ai/AIProvider.ts`
- Modify: `worker/src/ai/MockAIProvider.ts`
- Modify: `worker/src/ai/ClaudeAIProvider.ts`
- Modify: `worker/src/ai/MockAIProvider.test.ts`
- Modify: `worker/src/ai/ClaudeAIProvider.test.ts`
- Modify: `worker/src/ai/contracts.test.ts`

**Interfaces:**
- Consumes: `parseOrThrow` (`worker/src/ai/errors.ts`), `confidenceSchema`/`nonEmptyString`
  (`worker/src/ai/schemas/common.ts`).
- Produces: `AIProvider.selectChannel(input: SelectChannelInput): Promise<SelectChannelOutput>` —
  an advisory-only recommendation among a **caller-supplied, pre-filtered** `eligibleChannels`
  list. The AI is never given a way to suggest a channel outside that list, which is how this
  capability satisfies "must never override compliance/consent/opt-outs": the filtering happens
  before the AI is ever called, not inside it.

- [ ] **Step 1: Write the failing schema tests**

Create `worker/src/ai/schemas/selectChannel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectChannelInputSchema, selectChannelOutputSchema } from "./selectChannel.js";

describe("selectChannelInputSchema", () => {
  it("accepts minimal valid input", () => {
    expect(() =>
      selectChannelInputSchema.parse({
        eligibleChannels: ["email", "linkedin"],
        contactSummary: null,
        companySummary: "Acme is a SaaS company",
        priorChannelHistory: [],
        messageIntent: "initial outreach",
      })
    ).not.toThrow();
  });

  it("rejects an empty eligibleChannels array", () => {
    expect(() =>
      selectChannelInputSchema.parse({
        eligibleChannels: [],
        contactSummary: null,
        companySummary: "Acme",
        priorChannelHistory: [],
        messageIntent: "initial outreach",
      })
    ).toThrow();
  });

  it("rejects an unknown channel value in eligibleChannels", () => {
    expect(() =>
      selectChannelInputSchema.parse({
        eligibleChannels: ["carrier_pigeon"],
        contactSummary: null,
        companySummary: "Acme",
        priorChannelHistory: [],
        messageIntent: "initial outreach",
      })
    ).toThrow();
  });
});

describe("selectChannelOutputSchema", () => {
  const valid = {
    channel: "email" as const,
    reasoning: "Email has the highest historical reply rate for this contact",
    confidence: 0.7,
  };

  it("accepts a valid output", () => {
    expect(() => selectChannelOutputSchema.parse(valid)).not.toThrow();
  });

  it("rejects an unknown channel value", () => {
    expect(() => selectChannelOutputSchema.parse({ ...valid, channel: "carrier_pigeon" })).toThrow();
  });

  it("rejects a confidence above 1", () => {
    expect(() => selectChannelOutputSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it("rejects an empty reasoning string", () => {
    expect(() => selectChannelOutputSchema.parse({ ...valid, reasoning: "" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `worker/`): `npm test -- selectChannel`
Expected: FAIL — `selectChannel.ts` doesn't exist yet.

- [ ] **Step 3: Implement the schema**

Create `worker/src/ai/schemas/selectChannel.ts`:

```ts
import { z } from "zod";
import { confidenceSchema, nonEmptyString } from "./common.js";

export const eligibleChannelSchema = z.enum([
  "email", "linkedin", "whatsapp", "sms", "telegram", "messenger", "instagram", "voice",
]);

export const channelHistoryOutcomeSchema = z.enum(["no_response", "replied", "bounced", "failed"]);

export const selectChannelInputSchema = z.object({
  eligibleChannels: z.array(eligibleChannelSchema).min(1),
  contactSummary: z.string().nullable().optional(),
  companySummary: nonEmptyString,
  priorChannelHistory: z.array(
    z.object({
      channel: eligibleChannelSchema,
      outcome: channelHistoryOutcomeSchema,
    })
  ),
  messageIntent: nonEmptyString,
});
export type SelectChannelInput = z.infer<typeof selectChannelInputSchema>;

export const selectChannelOutputSchema = z.object({
  channel: eligibleChannelSchema,
  reasoning: nonEmptyString,
  confidence: confidenceSchema,
});
export type SelectChannelOutput = z.infer<typeof selectChannelOutputSchema>;
```

Note: the schema alone cannot enforce "output channel is one of the input's `eligibleChannels`" —
that is a cross-field invariant the caller (a future phase's campaign-step executor, out of scope
here) must check after calling `selectChannel`, falling back to a default eligible channel if the
model's choice isn't in the list. This is a documented limitation, not a silently skipped check.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `worker/`): `npm test -- selectChannel`
Expected: PASS.

- [ ] **Step 5: Add to the schemas barrel**

In `worker/src/ai/schemas/index.ts`, add one line:

```ts
export * from "./common.js";
export * from "./analyzeCompany.js";
export * from "./researchContact.js";
export * from "./qualifyLead.js";
export * from "./generateOutreach.js";
export * from "./classifyReply.js";
export * from "./generateReply.js";
export * from "./analyzeStrategy.js";
export * from "./selectChannel.js";
```

- [ ] **Step 6: Add `selectChannel` to the `AIProvider` interface**

In `worker/src/ai/AIProvider.ts`, replace the full file contents:

```ts
import type {
  AnalyzeCompanyInput,
  AnalyzeCompanyOutput,
  ResearchContactInput,
  ResearchContactOutput,
  QualifyLeadInput,
  QualifyLeadOutput,
  GenerateOutreachInput,
  GenerateOutreachOutput,
  ClassifyReplyInput,
  ClassifyReplyOutput,
  GenerateReplyInput,
  GenerateReplyOutput,
  AnalyzeStrategyInput,
  AnalyzeStrategyOutput,
  SelectChannelInput,
  SelectChannelOutput,
} from "./schemas/index.js";

export interface AIProvider {
  analyzeCompany(input: AnalyzeCompanyInput): Promise<AnalyzeCompanyOutput>;
  researchContact(input: ResearchContactInput): Promise<ResearchContactOutput>;
  qualifyLead(input: QualifyLeadInput): Promise<QualifyLeadOutput>;
  generateOutreach(input: GenerateOutreachInput): Promise<GenerateOutreachOutput>;
  classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyOutput>;
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput>;
  analyzeStrategy(input: AnalyzeStrategyInput): Promise<AnalyzeStrategyOutput>;
  selectChannel(input: SelectChannelInput): Promise<SelectChannelOutput>;
}
```

- [ ] **Step 7: Write the failing `MockAIProvider` test**

In `worker/src/ai/MockAIProvider.test.ts`, add a new `it` right after the `analyzeStrategy` test
(before the `"wraps invalid input..."` test), i.e. replace:

```ts
  it("wraps invalid input in AIProviderValidationError", async () => {
```

with:

```ts
  it("selectChannel returns one of the eligible channels", async () => {
    const result = await provider.selectChannel({
      eligibleChannels: ["email", "linkedin"],
      contactSummary: null,
      companySummary: "Acme is a SaaS company",
      priorChannelHistory: [],
      messageIntent: "initial outreach",
    });
    expect(["email", "linkedin"]).toContain(result.channel);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("wraps invalid input in AIProviderValidationError", async () => {
```

- [ ] **Step 8: Run the test to verify it fails**

Run (from `worker/`): `npm test -- MockAIProvider`
Expected: FAIL — `MockAIProvider.selectChannel` is not a function yet.

- [ ] **Step 9: Implement `selectChannel` in `MockAIProvider`**

In `worker/src/ai/MockAIProvider.ts`, add `selectChannelInputSchema`, `selectChannelOutputSchema`,
`SelectChannelInput`, `SelectChannelOutput` to the existing import block from `./schemas/index.js`
(append after the `AnalyzeStrategyOutput` import), and add a new method to the class right after
`analyzeStrategy`, before the closing `}`:

```ts
  async selectChannel(rawInput: SelectChannelInput): Promise<SelectChannelOutput> {
    const input = parseOrThrow(selectChannelInputSchema, rawInput);
    const chosen = input.eligibleChannels[0];
    return parseOrThrow(selectChannelOutputSchema, {
      channel: chosen,
      reasoning: `Mock selection: defaulting to the first eligible channel (${chosen}) from ${input.eligibleChannels.length} eligible option(s).`,
      confidence: 0.5,
    }, "Output");
  }
```

- [ ] **Step 10: Run the test to verify it passes**

Run (from `worker/`): `npm test -- MockAIProvider`
Expected: PASS.

- [ ] **Step 11: Write the failing `ClaudeAIProvider` test**

In `worker/src/ai/ClaudeAIProvider.test.ts`, add a new `it` right before the final closing `});`
of the `describe("ClaudeAIProvider", ...)` block (after the `"strategy recommendations only..."`
test):

```ts
  it("selectChannel returns validated output constrained to the eligible-channel enum", async () => {
    const fakeClient: AnthropicMessagesLike = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: {
            channel: "linkedin",
            reasoning: "Prior email attempts bounced; LinkedIn has an active profile.",
            confidence: 0.65,
          },
        }),
      },
    };
    const provider = makeProvider(fakeClient);
    const result = await provider.selectChannel({
      eligibleChannels: ["email", "linkedin"],
      contactSummary: null,
      companySummary: "Acme is a SaaS company",
      priorChannelHistory: [{ channel: "email", outcome: "bounced" }],
      messageIntent: "follow-up",
    });

    expect(result.channel).toBe("linkedin");
    expect(result.confidence).toBe(0.65);
  });
```

- [ ] **Step 12: Run the test to verify it fails**

Run (from `worker/`): `npm test -- ClaudeAIProvider`
Expected: FAIL — `ClaudeAIProvider.selectChannel` is not a function yet.

- [ ] **Step 13: Implement `selectChannel` in `ClaudeAIProvider`**

In `worker/src/ai/ClaudeAIProvider.ts`, add `selectChannelInputSchema`, `selectChannelOutputSchema`,
`SelectChannelInput`, `SelectChannelOutput` to the existing import block from `./schemas/index.js`
(same additions as Step 9), and add a new method to the class right after `analyzeStrategy`,
before the closing `}`:

```ts
  async selectChannel(rawInput: SelectChannelInput): Promise<SelectChannelOutput> {
    const input = parseOrThrow(selectChannelInputSchema, rawInput);
    return this.runStructured(
      "You are a B2B outreach channel strategist. Choose the single best channel to use next for this contact, from the provided list of already-compliant, already-eligible channels only. Never suggest a channel outside that list — it has already been filtered for consent and opt-out status. This decision is advisory only; it does not send anything.",
      `Eligible channels: ${input.eligibleChannels.join(", ")}\nMessage intent: ${input.messageIntent}\nCompany summary: ${input.companySummary}\nContact summary: ${input.contactSummary ?? "unknown"}\nPrior channel history: ${input.priorChannelHistory.map((h) => `${h.channel}: ${h.outcome}`).join("; ") || "none"}`,
      selectChannelOutputSchema
    );
  }
```

- [ ] **Step 14: Run the test to verify it passes**

Run (from `worker/`): `npm test -- ClaudeAIProvider`
Expected: PASS.

- [ ] **Step 15: Extend the contract tests**

In `worker/src/ai/contracts.test.ts`, add `selectChannelOutputSchema` to the existing import from
`./schemas/index.js`:

```ts
import {
  generateOutreachOutputSchema,
  generateReplyOutputSchema,
  analyzeStrategyOutputSchema,
  selectChannelOutputSchema,
} from "./schemas/index.js";
```

Add a new `it` inside the `describe("AIProvider contract: no outreach execution capability", ...)`
block, right after the `"analyzeStrategy output schema has no persistence/activation fields"` test:

```ts
  it("selectChannel output schema has no send/delivery fields", () => {
    const keys = Object.keys(selectChannelOutputSchema.shape);
    for (const forbidden of FORBIDDEN_OUTREACH_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });
```

Add one assertion to the `describe("AIProvider barrel export", ...)` test, right after
`expect(barrel.analyzeStrategyOutputSchema).toBeDefined();`:

```ts
    expect(barrel.selectChannelOutputSchema).toBeDefined();
```

- [ ] **Step 16: Run the full AI test suite**

Run (from `worker/`): `npm test -- ai/`
Expected: PASS — all `worker/src/ai/**` tests, including the extended contract tests.

- [ ] **Step 17: Commit**

```bash
git add worker/src/ai/schemas/selectChannel.ts worker/src/ai/schemas/selectChannel.test.ts worker/src/ai/schemas/index.ts worker/src/ai/AIProvider.ts worker/src/ai/MockAIProvider.ts worker/src/ai/ClaudeAIProvider.ts worker/src/ai/MockAIProvider.test.ts worker/src/ai/ClaudeAIProvider.test.ts worker/src/ai/contracts.test.ts
git commit -m "feat(worker): add AI selectChannel capability, constrained to caller-supplied eligible channels"
```

---

### Task 11: `ChannelAdapter` contract + `MockChannelAdapter`

**Files:**
- Create: `worker/src/channels/ChannelAdapter.ts`
- Create: `worker/src/channels/MockChannelAdapter.ts`
- Create: `worker/src/channels/MockChannelAdapter.test.ts`
- Modify: `worker/src/test/schema.sql` (add `contacts`, `conversations`, `outreach_messages`,
  `outreach_message_events` — worker-minimal versions)
- Modify: `worker/src/test/setupTestDb.ts` (extend `truncateAll`)

**Interfaces:**
- Consumes: nothing new (pure contract + a `pg` `Pool`).
- Produces: `ChannelAdapter` — the interface every real channel integration (Phase 2+) will
  implement. `MockChannelAdapter implements ChannelAdapter` — the only implementation in this
  phase, exercising the contract end-to-end against the worker's test schema, mirroring
  `MockAIProvider`'s relationship to `AIProvider`.

- [ ] **Step 1: Define the `ChannelAdapter` contract**

Create `worker/src/channels/ChannelAdapter.ts`:

```ts
export type ChannelName =
  | "email" | "linkedin" | "whatsapp" | "sms" | "telegram" | "messenger" | "instagram" | "voice";

export interface ChannelCapabilities {
  send: boolean;
  receive: boolean;
  checkStatus: boolean;
  schedule: boolean;
  cancel: boolean;
}

export interface SendMessageInput {
  channelAccountId: string;
  conversationId: string;
  recipientIdentifier: string;
  subject?: string | null;
  body: string;
  scheduledFor?: Date | null;
  idempotencyKey: string;
}

export interface SendMessageResult {
  providerMessageId: string;
  status: "queued" | "sent" | "scheduled";
  sentAt: Date | null;
}

export interface MessageStatus {
  providerMessageId: string;
  status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
  occurredAt: Date;
  failureReason?: string | null;
}

export interface NormalizedIncomingMessage {
  channelAccountId: string;
  recipientIdentifier: string;
  externalMessageId: string;
  body: string;
  receivedAt: Date;
  rawPayload: unknown;
}

export interface NormalizedDeliveryEvent {
  providerMessageId: string;
  eventType: "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed" | "unsubscribed";
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

export interface ChannelAdapter {
  readonly channel: ChannelName;
  readonly capabilities: ChannelCapabilities;

  send(input: SendMessageInput): Promise<SendMessageResult>;
  checkStatus?(providerMessageId: string): Promise<MessageStatus>;
  schedule?(input: SendMessageInput): Promise<SendMessageResult>;
  cancel?(providerMessageId: string): Promise<void>;
  normalizeIncoming(rawWebhookPayload: unknown): NormalizedIncomingMessage;
  normalizeDeliveryEvent(rawWebhookPayload: unknown): NormalizedDeliveryEvent;
}
```

`send`, `normalizeIncoming`, and `normalizeDeliveryEvent` are required on every adapter — every
channel in this system can send and every channel must be able to interpret its own webhooks (even
if, like the Mock below, it documents that it never actually receives any in this phase).
`checkStatus`, `schedule`, and `cancel` are optional because not every provider's real API exposes
them — an adapter that can't support one simply omits it, and callers must check for its presence
before calling, mirroring the design spec's "no invented unsupported capabilities" rule.

- [ ] **Step 2: Update the worker's test schema**

Add `contacts`, `conversations`, `outreach_messages`, `outreach_message_events` (worker-minimal
versions — no `campaign_leads` involvement, since the worker only ever sends via the
conversation-based path). Replace `worker/src/test/schema.sql`'s full contents with (this is the
Task 9 Step 3 version plus these four new tables appended):

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
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idempotency_key
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'draft',
  subject TEXT,
  body TEXT,
  provider TEXT,
  provider_message_id TEXT,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_message_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Extend `truncateAll`**

In `worker/src/test/setupTestDb.ts`, replace the `truncateAll` function body:

```ts
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE TABLE outreach_message_events, outreach_messages, conversations, contacts, agent_runs, agent_tasks, research, leads, companies RESTART IDENTITY CASCADE"
  );
}
```

- [ ] **Step 4: Write the failing test for `MockChannelAdapter`**

Create `worker/src/channels/MockChannelAdapter.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "../test/setupTestDb.js";
import { MockChannelAdapter } from "./MockChannelAdapter.js";

let pool: Pool;
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  pool = await createTestPool();
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

async function seedConversation() {
  const company = await pool.query<{ id: string }>(
    "INSERT INTO companies (organization_id, name) VALUES ($1, 'Acme') RETURNING id",
    [TEST_ORG_ID]
  );
  const contact = await pool.query<{ id: string }>(
    "INSERT INTO contacts (organization_id, company_id, full_name) VALUES ($1, $2, 'Jane Doe') RETURNING id",
    [TEST_ORG_ID, company.rows[0].id]
  );
  const conversation = await pool.query<{ id: string }>(
    "INSERT INTO conversations (organization_id, contact_id, channel) VALUES ($1, $2, 'email') RETURNING id",
    [TEST_ORG_ID, contact.rows[0].id]
  );
  return conversation.rows[0].id;
}

describe("MockChannelAdapter", () => {
  it("writes a delivered outreach_message row when sending", async () => {
    const conversationId = await seedConversation();
    const adapter = new MockChannelAdapter(pool, "email");

    const result = await adapter.send({
      channelAccountId: randomUUID(),
      conversationId,
      recipientIdentifier: "jane@example.com",
      subject: "Quick question",
      body: "Hi Jane",
      idempotencyKey: randomUUID(),
    });

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toMatch(/^mock-/);

    const { rows } = await pool.query(
      "SELECT status, provider, provider_message_id, direction FROM outreach_messages WHERE conversation_id = $1",
      [conversationId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].direction).toBe("outbound");
    expect(rows[0].provider).toBe("mock");
    expect(rows[0].provider_message_id).toBe(result.providerMessageId);
  });

  it("reports its declared capabilities", () => {
    const adapter = new MockChannelAdapter(pool, "whatsapp");
    expect(adapter.channel).toBe("whatsapp");
    expect(adapter.capabilities).toEqual({
      send: true,
      receive: false,
      checkStatus: false,
      schedule: false,
      cancel: false,
    });
  });

  it("throws when asked to normalize an incoming message, since it never receives", () => {
    const adapter = new MockChannelAdapter(pool, "email");
    expect(() => adapter.normalizeIncoming({})).toThrow(/does not support receiving/);
  });

  it("throws when asked to normalize a delivery event", () => {
    const adapter = new MockChannelAdapter(pool, "email");
    expect(() => adapter.normalizeDeliveryEvent({})).toThrow(/does not support delivery event normalization/);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run (from `worker/`): `npm test -- MockChannelAdapter`
Expected: FAIL — `MockChannelAdapter.ts` doesn't exist yet, and `contacts`/`conversations`/
`outreach_messages`/`outreach_message_events` don't exist in the test schema until Step 2 above is
applied (a fresh `createTestPool()` re-runs `schema.sql` every test file, so Step 2 must land
before this step is run).

- [ ] **Step 6: Implement `MockChannelAdapter`**

Create `worker/src/channels/MockChannelAdapter.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelName,
  MessageStatus,
  NormalizedDeliveryEvent,
  NormalizedIncomingMessage,
  SendMessageInput,
  SendMessageResult,
} from "./ChannelAdapter.js";

export class MockChannelAdapter implements ChannelAdapter {
  readonly channel: ChannelName;
  readonly capabilities: ChannelCapabilities = {
    send: true,
    receive: false,
    checkStatus: false,
    schedule: false,
    cancel: false,
  };

  constructor(
    private readonly pool: Pool,
    channel: ChannelName
  ) {
    this.channel = channel;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const providerMessageId = `mock-${randomUUID()}`;
    const sentAt = new Date();

    await this.pool.query(
      `INSERT INTO outreach_messages
         (id, organization_id, conversation_id, channel, direction, status, subject, body, provider, provider_message_id, delivered_at)
       SELECT gen_random_uuid(), organization_id, $1, $2, 'outbound', 'delivered', $3, $4, 'mock', $5, $6
       FROM conversations WHERE id = $1`,
      [input.conversationId, this.channel, input.subject ?? null, input.body, providerMessageId, sentAt]
    );

    return { providerMessageId, status: "sent", sentAt };
  }

  normalizeIncoming(_rawWebhookPayload: unknown): NormalizedIncomingMessage {
    throw new Error("MockChannelAdapter does not support receiving messages");
  }

  normalizeDeliveryEvent(_rawWebhookPayload: unknown): NormalizedDeliveryEvent {
    throw new Error("MockChannelAdapter does not support delivery event normalization");
  }
}
```

`organization_id` is populated via `SELECT organization_id ... FROM conversations WHERE id = $1`
rather than a hardcoded constant — the adapter has no direct notion of "current org," it derives
it from the conversation it's writing into, the same rule the real Supabase trigger enforces.

- [ ] **Step 7: Run the test to verify it passes**

Run (from `worker/`): `npm test -- MockChannelAdapter`
Expected: PASS.

- [ ] **Step 8: Run the full worker suite**

Run (from `worker/`): `npm test`
Expected: PASS — every file, including the unrelated `processResearchTask`/`claimResearchTasks`/
`claimTasks`/`reapStaleClaims`/`failTask`/AI suites from earlier tasks.

- [ ] **Step 9: Commit**

```bash
git add worker/src/channels/ChannelAdapter.ts worker/src/channels/MockChannelAdapter.ts worker/src/channels/MockChannelAdapter.test.ts worker/src/test/schema.sql worker/src/test/setupTestDb.ts
git commit -m "feat(worker): add ChannelAdapter contract and MockChannelAdapter reference implementation"
```

---

### Task 12: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Full Supabase RLS suite from a clean database**

Run: `npx supabase db reset && npm run test:supabase`
Expected: PASS — every test file from Subsystem 1, Plan 2, and this plan (Tasks 1-8's new test
files) green together, confirming no migration in this plan conflicts with anything before it.

- [ ] **Step 2: Full worker suite**

Run (from `worker/`): `npm test`
Expected: PASS — every existing and new worker test file green.

- [ ] **Step 3: Full frontend suite (regression check — this plan never touches `src/`)**

Run (from repo root): `npm test`
Expected: PASS, unchanged from before this plan — confirms nothing here regressed the Frontend
Integration phase.

- [ ] **Step 4: Report status**

Summarize for the user: all 3 test suites green (Supabase RLS, worker, frontend); list every new
table (`channel_accounts`, `suppression_list`, `channel_limits`, `webhook_events`, `conversations`,
`templates`, `campaign_steps`) and every extended table (`outreach_messages`, `campaign_leads`,
`agent_tasks`); confirm the queue is now generic (`claimTasks`) with idempotency, stale-claim
recovery, and exponential backoff; confirm `AIProvider.selectChannel` exists on both Mock and
Claude implementations with contract-test coverage; confirm `ChannelAdapter` + `MockChannelAdapter`
exist with no real provider code anywhere in the diff. This closes out Phase 1 planning execution
— Phase 2 (a real channel provider, e.g. email via a transactional-email API, replacing
`MockChannelAdapter` for one channel) is the next phase per the design spec's 8-phase strategy, and
is explicitly out of scope for this plan.
