-- PopupGenix chat agent — D1 schema.
-- Apply with:  npx wrangler d1 execute popupgenix-chat --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT    NOT NULL,
  ip         TEXT    NOT NULL,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

-- Rate limiting reads (ip, created_at); transcript reads read by session.
CREATE INDEX IF NOT EXISTS idx_messages_ip_time  ON chat_messages (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session  ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS chat_leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT    NOT NULL UNIQUE,
  ip         TEXT    NOT NULL,
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  project    TEXT,
  budget     TEXT,
  service    TEXT,
  status     TEXT    NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_time   ON chat_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON chat_leads (status, created_at DESC);
