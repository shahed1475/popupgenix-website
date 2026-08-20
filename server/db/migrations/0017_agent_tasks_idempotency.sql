ALTER TABLE agent_tasks ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_agent_tasks_idempotency_key
  ON agent_tasks (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
