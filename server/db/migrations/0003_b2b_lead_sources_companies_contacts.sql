CREATE TABLE lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  source_type text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_sources_org_code_unique UNIQUE (organization_id, code)
);
CREATE INDEX lead_sources_organization_id_idx ON lead_sources(organization_id);
CREATE TRIGGER lead_sources_set_updated_at BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  industry text,
  size_range text,
  country text,
  website text,
  linkedin_url text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_organization_id_idx ON companies(organization_id);
CREATE UNIQUE INDEX companies_org_domain_unique ON companies(organization_id, domain) WHERE domain IS NOT NULL;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  email text,
  phone text,
  linkedin_url text,
  is_primary boolean NOT NULL DEFAULT false,
  source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  opted_out boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_company_id_idx ON contacts(company_id);
CREATE INDEX contacts_organization_id_idx ON contacts(organization_id);
CREATE UNIQUE INDEX contacts_email_unique ON contacts(email) WHERE email IS NOT NULL;
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION contacts_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM companies WHERE id = NEW.company_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'contacts.company_id % does not reference an existing company', NEW.company_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'contacts.organization_id (%) does not match parent company organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_set_organization_id_trigger
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_organization_id();
