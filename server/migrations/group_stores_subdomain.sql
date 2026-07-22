-- Group Stores: add an optional short subdomain label so a store can be
-- reached at <subdomain>.tshirtbrothers.com (independent of its slug —
-- e.g., slug 'sandy-creek-high-school-pto' but subdomain 'sandycreekpto').
--
-- If subdomain is null the store is only reachable via /stores/:slug.
-- Wildcard DNS + wildcard TLS on *.tshirtbrothers.com is a droplet-side
-- one-time setup; see docs/group-stores-subdomains.md.

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS subdomain VARCHAR(80);

-- Case-insensitive uniqueness — DNS labels are lowercase in practice
CREATE UNIQUE INDEX IF NOT EXISTS stores_subdomain_lower_key
  ON stores (lower(subdomain))
  WHERE subdomain IS NOT NULL;

-- Only allow DNS-safe labels: lowercase letters, digits, hyphens; no
-- leading/trailing hyphens; length 2–63.
ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_subdomain_shape;
ALTER TABLE stores
  ADD  CONSTRAINT stores_subdomain_shape
  CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');

COMMIT;
