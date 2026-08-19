CREATE TABLE replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  in_reply_to_message_id uuid REFERENCES outreach_messages(id) ON DELETE SET NULL,
  raw_content text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  intent text,
  sentiment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX replies_lead_id_idx ON replies(lead_id);
CREATE INDEX replies_in_reply_to_message_id_idx ON replies(in_reply_to_message_id);
CREATE INDEX replies_organization_id_idx ON replies(organization_id);

CREATE OR REPLACE FUNCTION replies_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'replies.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'replies.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER replies_set_organization_id_trigger
  BEFORE INSERT ON replies
  FOR EACH ROW EXECUTE FUNCTION replies_set_organization_id();

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'completed', 'no_show', 'cancelled')),
  scheduled_at timestamptz,
  meeting_link text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'booking_agent')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_lead_id_idx ON meetings(lead_id);
CREATE INDEX meetings_organization_id_idx ON meetings(organization_id);
CREATE TRIGGER meetings_set_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION meetings_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'meetings.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'meetings.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_set_organization_id_trigger
  BEFORE INSERT ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_set_organization_id();
