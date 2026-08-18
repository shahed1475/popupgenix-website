-- server/db/migrations/0004_b2b_strategies.sql
CREATE TABLE strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX strategies_organization_id_idx ON strategies(organization_id);
CREATE TRIGGER strategies_set_updated_at BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_snapshot jsonb,
  notes text,
  created_by text NOT NULL DEFAULT 'manual' CHECK (created_by IN ('system', 'agent', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_versions_strategy_version_unique UNIQUE (strategy_id, version_number)
);
CREATE INDEX strategy_versions_strategy_id_idx ON strategy_versions(strategy_id);
CREATE INDEX strategy_versions_organization_id_idx ON strategy_versions(organization_id);

ALTER TABLE strategies
  ADD CONSTRAINT strategies_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES strategy_versions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION strategy_versions_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM strategies WHERE id = NEW.strategy_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'strategy_versions.strategy_id % does not reference an existing strategy', NEW.strategy_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'strategy_versions.organization_id (%) does not match parent strategy organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER strategy_versions_set_organization_id_trigger
  BEFORE INSERT ON strategy_versions
  FOR EACH ROW EXECUTE FUNCTION strategy_versions_set_organization_id();
