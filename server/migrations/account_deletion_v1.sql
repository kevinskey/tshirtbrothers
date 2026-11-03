-- Customer-initiated account deletion (App Store Review Guideline 5.1.1(v):
-- any app that lets customers create an account must let them delete it from
-- inside the app — an email request is not enough, and the iOS 1.0 review on
-- 2026-10-30 asked for this flow on camera).
--
-- Model is anonymize-and-keep, not DELETE. The users row survives so quotes,
-- invoices, mockups and gang sheets keep their foreign key and the books stay
-- intact; every personal field on the row is scrubbed and the password hash is
-- replaced with one nobody can type. Rows the customer owns outright (push
-- tokens, favorites, saved designs, activity tracking) are hard-deleted by the
-- endpoint.
--
-- Run once on the droplet BEFORE deploying the code that uses it:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/account_deletion_v1.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index: the only query that cares is "is this account closed?", and
-- closed accounts are a rounding error next to live ones.
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)
  WHERE deleted_at IS NOT NULL;
