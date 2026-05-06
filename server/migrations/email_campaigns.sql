-- Email campaigns sent from the admin Campaigns section.
-- One row per blast. recipient_filter is a JSON snapshot of the picker
-- so we can audit who was targeted even after customer state changes.
CREATE TABLE IF NOT EXISTS email_campaigns (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  example_image_urls JSONB DEFAULT '[]'::jsonb,
  recipient_filter JSONB NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- People who clicked the unsubscribe link in any campaign email.
-- We never send a marketing email to a row in this table again.
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  campaign_id INT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);
