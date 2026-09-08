-- Allow the in-flight 'sending' status.
ALTER TABLE newsletters DROP CONSTRAINT IF EXISTS newsletters_status_check;
ALTER TABLE newsletters ADD CONSTRAINT newsletters_status_check
  CHECK (status IN ('draft', 'sending', 'sent'));
