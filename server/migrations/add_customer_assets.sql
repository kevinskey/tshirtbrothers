-- Customer-private asset library. Each asset is tied to a single user (a
-- customer) so only that user — and admins — can see it. Used for admin-
-- uploaded graphics that are specific to a given customer (logos, brand
-- marks, etc.) and shouldn't show up in the public library.

CREATE TABLE IF NOT EXISTS customer_assets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  image_url   TEXT NOT NULL,
  file_type   VARCHAR(50),
  width       INTEGER,
  height      INTEGER,
  size_bytes  BIGINT,
  notes       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_assets_user ON customer_assets(user_id);
