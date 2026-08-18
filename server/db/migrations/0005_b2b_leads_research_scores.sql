CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','researching','qualified','disqualified','approved_for_outreach',
    'contacted','replied','meeting_booked','proposal','won','lost'
  )),
  current_score numeric,
  current_strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  disqualified_reason text,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_company_id_idx ON leads(company_id);
CREATE INDEX leads_contact_id_idx ON leads(contact_id);
CREATE INDEX leads_status_idx ON leads(status);
CREATE INDEX leads_created_at_idx ON leads(created_at DESC);
CREATE INDEX leads_organization_id_idx ON leads(organization_id);
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION leads_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.company_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'leads.company_id % does not reference an existing company', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'leads.organization_id (%) does not match parent company organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_set_organization_id_trigger
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_organization_id();

CREATE TABLE research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('company', 'contact')),
  subject_id uuid NOT NULL,
  summary text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source text,
  created_by text NOT NULL DEFAULT 'manual' CHECK (created_by IN ('agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_subject_idx ON research(subject_type, subject_id);
CREATE INDEX research_organization_id_idx ON research(organization_id);

CREATE OR REPLACE FUNCTION research_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  IF NEW.subject_type = 'company' THEN
    SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.subject_id;
  ELSIF NEW.subject_type = 'contact' THEN
    SELECT organization_id INTO parent_org_id FROM contacts WHERE id = NEW.subject_id;
  ELSE
    RAISE EXCEPTION 'research.subject_type must be ''company'' or ''contact''';
  END IF;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'research.subject_id % does not reference an existing %', NEW.subject_id, NEW.subject_type;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'research.organization_id (%) does not match subject organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER research_set_organization_id_trigger
  BEFORE INSERT ON research
  FOR EACH ROW EXECUTE FUNCTION research_set_organization_id();

CREATE TABLE lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  band text,
  reasoning text,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  scored_by text NOT NULL DEFAULT 'manual' CHECK (scored_by IN ('agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_scores_lead_id_idx ON lead_scores(lead_id);
CREATE INDEX lead_scores_organization_id_idx ON lead_scores(organization_id);

CREATE OR REPLACE FUNCTION lead_scores_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM leads WHERE id = NEW.lead_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'lead_scores.lead_id % does not reference an existing lead', NEW.lead_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'lead_scores.organization_id (%) does not match parent lead organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_scores_set_organization_id_trigger
  BEFORE INSERT ON lead_scores
  FOR EACH ROW EXECUTE FUNCTION lead_scores_set_organization_id();
