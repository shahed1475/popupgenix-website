CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  subject_type text,
  subject_id uuid,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_event_type_idx ON analytics_events(event_type);
CREATE INDEX analytics_events_occurred_at_idx ON analytics_events(occurred_at DESC);
CREATE INDEX analytics_events_subject_idx ON analytics_events(subject_type, subject_id);
CREATE INDEX analytics_events_organization_id_idx ON analytics_events(organization_id);
