-- Attempt counter for group-store admin login codes.
--
-- POST /api/group-store-admin/login/verify took a 6-digit code with a
-- 15-minute window, no attempt counter and no rate limiter, and winning
-- yields a 14-day session over that store's orders, buyer emails, prices,
-- promo codes and Stripe onboarding. 10^6 is nothing to a script, and
-- /login/request was unlimited too -- each call inserted ANOTHER valid row,
-- so an attacker could keep many codes live at once and shrink the keyspace
-- further.
--
-- Rate limiting alone caps the rate; this caps the total, so a slow
-- distributed grind can't simply wait out the window.

ALTER TABLE store_admin_login_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- The verify path looks up outstanding codes by (store_id, email); the
-- failure path now writes to the same set.
CREATE INDEX IF NOT EXISTS idx_store_login_codes_outstanding
  ON store_admin_login_codes (store_id, lower(email))
  WHERE consumed_at IS NULL;
