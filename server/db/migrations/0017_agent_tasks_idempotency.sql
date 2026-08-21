ALTER TABLE agent_tasks ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX agent_tasks_org_idempotency_key_unique
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
