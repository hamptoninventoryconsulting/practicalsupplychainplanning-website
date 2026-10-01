-- Consent, do-not-email, and rate-limit tables for the simulator results email.
-- Applied by the Pages Function (CREATE IF NOT EXISTS) and safe to run by hand.
-- No SKU names, forecasts, prices, charts, or result numbers belong in these tables.

CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  form_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  wording_version TEXT NOT NULL,
  wording_text TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  results_box INTEGER NOT NULL,
  articles_box INTEGER NOT NULL,
  resend_message_id TEXT,
  unsubscribe_token TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS consent_email_created ON consent (email, created_at);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resend_event_id TEXT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_hits_email_created ON rate_hits (email, created_at);
CREATE INDEX IF NOT EXISTS rate_hits_ip_created ON rate_hits (ip, created_at);
