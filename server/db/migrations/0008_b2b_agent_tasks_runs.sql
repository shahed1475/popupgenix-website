CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN (
    'strategy','lead_finder','research','qualification','outreach',
    'reply','booking','notification','analytics'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','claimed','in_progress','succeeded','failed','cancelled'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject_type text,
  subject_id uuid,
  priority integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_tasks_status_idx ON agent_tasks(status);
CREATE INDEX agent_tasks_scheduled_for_idx ON agent_tasks(scheduled_for);
CREATE INDEX agent_tasks_subject_idx ON agent_tasks(subject_type, subject_id);
CREATE INDEX agent_tasks_organization_id_idx ON agent_tasks(organization_id);
CREATE TRIGGER agent_tasks_set_updated_at BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  provider text CHECK (provider IS NULL OR provider IN ('mock', 'claude')),
  started_at timestamptz,
  finished_at timestamptz,
  output jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_task_id_idx ON agent_runs(task_id);
CREATE INDEX agent_runs_organization_id_idx ON agent_runs(organization_id);

CREATE OR REPLACE FUNCTION agent_runs_set_organization_id() RETURNS TRIGGER AS $$
DECLARE
  parent_org_id uuid;
BEGIN
  SELECT organization_id INTO parent_org_id FROM agent_tasks WHERE id = NEW.task_id;
  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'agent_runs.task_id % does not reference an existing agent_task', NEW.task_id;
  END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> parent_org_id THEN
    RAISE EXCEPTION 'agent_runs.organization_id (%) does not match parent organization_id (%)', NEW.organization_id, parent_org_id;
  END IF;
  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_runs_set_organization_id_trigger
  BEFORE INSERT ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION agent_runs_set_organization_id();
