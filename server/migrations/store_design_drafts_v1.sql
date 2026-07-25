-- store_design_drafts: tenant-submitted designs awaiting TSB review.
--
-- A group store admin (school rep, choir officer) opens the whitelabel
-- design studio via GleeWorld's "Design merch" button, composes a
-- design, and hits Save. Instead of writing to admin_designs (staff-
-- only), the design lands here as a pending draft. TSB staff reviews
-- via /admin/group-stores/<id> → "Pending designs", clicks Approve to
-- promote it into a store_products row.
--
-- Kept intentionally light: no complex approvals workflow, just three
-- states (pending/approved/rejected) and a foreign key to the store
-- so RLS-esque scoping stays trivial.

BEGIN;

CREATE TABLE IF NOT EXISTS store_design_drafts (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  submitted_by_admin_id INTEGER REFERENCES store_admins(id) ON DELETE SET NULL,
  submitted_by_email    VARCHAR(255),
                        -- snapshot in case the store_admin is deleted later
  name              VARCHAR(255) NOT NULL,
  notes             TEXT,
                        -- optional message from the tenant admin ("please
                        -- print in navy" etc.); staff sees this on review
  image_url         TEXT NOT NULL,
                        -- PNG uploaded via /api/quotes/upload-design; DO Spaces URL
  design_json       JSONB,
                        -- raw studio state so staff could open it in the
                        -- editor to tweak before publishing (phase-2)
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes      TEXT,
                        -- what the staff reviewer said when
                        -- approving/rejecting; visible to the tenant
  reviewed_by_email VARCHAR(255),
  reviewed_at       TIMESTAMP WITH TIME ZONE,
  approved_product_id INTEGER REFERENCES store_products(id) ON DELETE SET NULL,
                        -- set when status flips to 'approved' and a
                        -- store_products row is created from this draft
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_design_drafts_store_status_idx
  ON store_design_drafts (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS store_design_drafts_pending_idx
  ON store_design_drafts (created_at DESC)
  WHERE status = 'pending';

-- The Node API connects as tsbadmin; other store_* tables were created
-- as that role and inherit ownership. If this migration is applied by a
-- different role (e.g. `sudo -u postgres psql`), fix ownership so the
-- API's inserts don't fail with `permission denied for table`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tsbadmin') THEN
    EXECUTE 'ALTER TABLE store_design_drafts OWNER TO tsbadmin';
    EXECUTE 'ALTER SEQUENCE store_design_drafts_id_seq OWNER TO tsbadmin';
  END IF;
END $$;

COMMIT;
