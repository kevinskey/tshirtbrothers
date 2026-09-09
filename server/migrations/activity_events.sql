-- First-party activity tracking (2026-09-09): one row per notable customer
-- action (design studio opened, quote wizard opened/submitted, DTF store
-- visit, order paid...). Umami stays for anonymous page stats; this table
-- exists so activity can be tied to a customer email/account and shown on
-- the admin Customers page.
CREATE TABLE IF NOT EXISTS activity_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL,
  email text,
  user_id integer,
  anon_id text,
  path text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_email_idx ON activity_events (lower(email));
CREATE INDEX IF NOT EXISTS activity_events_user_idx ON activity_events (user_id);
CREATE INDEX IF NOT EXISTS activity_events_event_idx ON activity_events (event, created_at);
