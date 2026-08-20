CREATE TABLE raw_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  raw_payload jsonb NOT NULL,
  pipeline_status text NOT NULL DEFAULT 'pending' CHECK (pipeline_status IN (
    'pending','normalized','cleaned','merged','rejected','errored'
  )),
  rejection_reason text,
  error_message text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX raw_leads_source_external_unique ON raw_leads(source_id, external_id);
CREATE INDEX raw_leads_organization_id_idx ON raw_leads(organization_id);
CREATE INDEX raw_leads_pipeline_status_idx ON raw_leads(pipeline_status);

CREATE OR REPLACE FUNCTION raw_leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM lead_sources WHERE id = NEW.source_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'raw_leads.source_id % does not reference an existing lead_source', NEW.source_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'raw_leads.organization_id (%) does not match parent source organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raw_leads_set_organization_id_trigger
  BEFORE INSERT ON raw_leads
  FOR EACH ROW EXECUTE FUNCTION raw_leads_set_organization_id();
