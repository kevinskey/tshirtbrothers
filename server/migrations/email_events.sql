-- Per-recipient email events for marketing analytics. One row per
-- open / click / unsubscribe so we can compute rates without re-counting
-- via per-campaign aggregates.
CREATE TABLE IF NOT EXISTS email_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click', 'unsubscribe')),
  url TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(LOWER(recipient_email));

-- Track which campaign drove an unsubscribe so we can show "5 people
-- unsubscribed from this campaign" in the dashboard.
ALTER TABLE email_unsubscribes ADD COLUMN IF NOT EXISTS source_campaign_id INT;
