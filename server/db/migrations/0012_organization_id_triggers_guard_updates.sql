-- server/db/migrations/0012_organization_id_triggers_guard_updates.sql
-- The 11 organization_id propagation triggers added in 0003-0008 were defined BEFORE INSERT
-- only, so UPDATEing a derived row's parent FK (e.g. moving a contact to a different
-- company) left organization_id stale/unguarded. The trigger FUNCTION bodies already
-- recompute the parent org and reject a mismatch against NEW.organization_id correctly for
-- this case — the only missing piece was the trigger DEFINITION's event list. This migration
-- only redefines triggers to also fire on UPDATE of the relevant parent-FK column(s); it does
-- not touch any function body or table structure.

-- contacts (parent FK: company_id)
DROP TRIGGER contacts_set_organization_id_trigger ON contacts;
CREATE TRIGGER contacts_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF company_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_set_organization_id();

-- leads (parent FK: company_id)
DROP TRIGGER leads_set_organization_id_trigger ON leads;
CREATE TRIGGER leads_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF company_id ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_organization_id();

-- lead_scores (parent FK: lead_id)
DROP TRIGGER lead_scores_set_organization_id_trigger ON lead_scores;
CREATE TRIGGER lead_scores_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF lead_id ON lead_scores
  FOR EACH ROW EXECUTE FUNCTION lead_scores_set_organization_id();

-- strategy_versions (parent FK: strategy_id)
DROP TRIGGER strategy_versions_set_organization_id_trigger ON strategy_versions;
CREATE TRIGGER strategy_versions_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF strategy_id ON strategy_versions
  FOR EACH ROW EXECUTE FUNCTION strategy_versions_set_organization_id();

-- campaign_leads (two parent FKs: campaign_id, lead_id)
DROP TRIGGER campaign_leads_set_organization_id_trigger ON campaign_leads;
CREATE TRIGGER campaign_leads_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF campaign_id, lead_id ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION campaign_leads_set_organization_id();

-- outreach_messages (parent FK: campaign_lead_id)
DROP TRIGGER outreach_messages_set_organization_id_trigger ON outreach_messages;
CREATE TRIGGER outreach_messages_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF campaign_lead_id ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION outreach_messages_set_organization_id();

-- outreach_message_events (parent FK: message_id)
DROP TRIGGER outreach_message_events_set_organization_id_trigger ON outreach_message_events;
CREATE TRIGGER outreach_message_events_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF message_id ON outreach_message_events
  FOR EACH ROW EXECUTE FUNCTION outreach_message_events_set_organization_id();

-- replies (parent FK: lead_id)
DROP TRIGGER replies_set_organization_id_trigger ON replies;
CREATE TRIGGER replies_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF lead_id ON replies
  FOR EACH ROW EXECUTE FUNCTION replies_set_organization_id();

-- meetings (parent FK: lead_id)
DROP TRIGGER meetings_set_organization_id_trigger ON meetings;
CREATE TRIGGER meetings_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF lead_id ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_set_organization_id();

-- agent_runs (parent FK: task_id)
DROP TRIGGER agent_runs_set_organization_id_trigger ON agent_runs;
CREATE TRIGGER agent_runs_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF task_id ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION agent_runs_set_organization_id();

-- research (polymorphic parent: subject_type, subject_id)
DROP TRIGGER research_set_organization_id_trigger ON research;
CREATE TRIGGER research_set_organization_id_trigger
  BEFORE INSERT OR UPDATE OF subject_type, subject_id ON research
  FOR EACH ROW EXECUTE FUNCTION research_set_organization_id();
