-- Admin-only library of "fixed" graphics: customer-supplied artwork that the
-- admin has cleaned up (background removed, upscaled, etc.) and staged for
-- the gang-sheet step. These are NOT exposed to customers — unlike
-- admin_designs (which is surfaced publicly via /api/design/art-library) or
-- customer_assets (which the owning customer can see via /my-assets). The
-- entire table is only read/written by admin-guarded endpoints.

CREATE TABLE IF NOT EXISTS admin_fixed_graphics (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(255) NOT NULL,
  image_url          TEXT NOT NULL,
  original_source    TEXT,                     -- e.g. original quote design_url, for provenance
  source_customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_type          VARCHAR(50),
  width              INTEGER,
  height             INTEGER,
  size_bytes         BIGINT,
  notes              TEXT,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_fixed_graphics_created_at
  ON admin_fixed_graphics(created_at DESC);
