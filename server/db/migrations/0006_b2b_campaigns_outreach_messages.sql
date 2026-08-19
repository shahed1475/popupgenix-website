CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_organization_id_idx ON campaigns(organization_id);
CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'paused', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_leads_campaign_lead_unique UNIQUE (campaign_id, lead_id)
);
CREATE INDEX campaign_leads_campaign_id_idx ON campaign_leads(campaign_id);
CREATE INDEX campaign_leads_lead_id_idx ON campaign_leads(lead_id);
CREATE INDEX campaign_leads_organization_id_idx ON campaign_leads(organization_id);
CREATE TRIGGER campaign_leads_set_updated_at BEFORE UPDATE ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION campaign_leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  campaign_org_id uuid;
  lead_org_id uuid;
BEGIN
  SELECT organization_id INTO campaign_org_id FROM campaigns WHERE id = NEW.campaign_id;
  SELECT organization_id INTO lead_org_id FROM leads WHERE id = NEW.lead_id;
  IF campaign_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_leads.campaign_id % does not reference an existing campaign', NEW.campaign_id;
  END IF;
  IF lead_org_id IS NULL THEN
    RAISE EXCEPTION 'campaign_leads.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF campaign_org_id <> lead_org_id THEN
    RAISE EXCEPTION 'campaign % and lead % belong to different organizations', NEW.campaign_id, NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> campaign_org_id THEN
    RAISE EXCEPTION 'campaign_leads.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, campaign_org_id;
  END IF;
  NEW.organization_id := campaign_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_leads_set_organization_id_trigger
  BEFORE INSERT ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION campaign_leads_set_organization_id();

CREATE TABLE outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_lead_id uuid NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  channel text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction = 'outbound'),
  subject text,
  body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'queued', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_messages_campaign_lead_id_idx ON outreach_messages(campaign_lead_id);
CREATE INDEX outreach_messages_organization_id_idx ON outreach_messages(organization_id);
CREATE TRIGGER outreach_messages_set_updated_at BEFORE UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION outreach_messages_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM campaign_leads WHERE id = NEW.campaign_lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'outreach_messages.campaign_lead_id % does not reference an existing campaign_lead', NEW.campaign_lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'outreach_messages.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outreach_messages_set_organization_id_trigger
  BEFORE INSERT ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION outreach_messages_set_organization_id();

CREATE TABLE outreach_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'queued','sent','delivered','opened','clicked','bounced','failed','unsubscribed'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_message_events_message_id_idx ON outreach_message_events(message_id);
CREATE INDEX outreach_message_events_organization_id_idx ON outreach_message_events(organization_id);

CREATE OR REPLACE FUNCTION outreach_message_events_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM outreach_messages WHERE id = NEW.message_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'outreach_message_events.message_id % does not reference an existing outreach_message', NEW.message_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'outreach_message_events.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outreach_message_events_set_organization_id_trigger
  BEFORE INSERT ON outreach_message_events
  FOR EACH ROW EXECUTE FUNCTION outreach_message_events_set_organization_id();
