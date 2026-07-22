-- Newsletter subscribers: emails captured from the site footer and
-- from group-store "coming soon" signup forms. Missing migration —
-- the /api/newsletter/subscribe route was shipped without one.

BEGIN;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  source          VARCHAR(100),
                    -- 'footer' by default; group-store signups use
                    -- 'group-store:<slug>' so we know which store to
                    -- notify at launch.
  subscribed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_source_idx
  ON newsletter_subscribers (source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_idx
  ON newsletter_subscribers (subscribed_at DESC)
  WHERE unsubscribed_at IS NULL;

COMMIT;
