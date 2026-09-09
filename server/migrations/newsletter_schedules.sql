-- Scheduled + recurring newsletter sends, executed by services/scheduler.js.
CREATE TABLE IF NOT EXISTS newsletter_schedules (
  id SERIAL PRIMARY KEY,
  newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  filter VARCHAR(40) NOT NULL DEFAULT 'all',
  recurrence VARCHAR(10) NOT NULL DEFAULT 'once'
    CHECK (recurrence IN ('once', 'weekly', 'monthly')),
  next_run_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_newsletter_schedules_due
  ON newsletter_schedules(active, next_run_at);

-- Run as postgres: hand ownership to the app role.
ALTER TABLE newsletter_schedules OWNER TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE newsletter_schedules_id_seq TO tsbadmin;
