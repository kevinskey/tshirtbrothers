-- New businesses discovered in South Atlanta from public open-data sources.
-- One row per business license / registration. Auto-applied on server boot.

CREATE TABLE IF NOT EXISTS local_businesses (
  id              SERIAL PRIMARY KEY,
  source          VARCHAR(64)  NOT NULL,           -- e.g. 'atl_open_data'
  external_id     VARCHAR(128) NOT NULL,           -- license # / record id
  name            VARCHAR(500) NOT NULL,
  business_type   VARCHAR(255),
  address         VARCHAR(500),
  city            VARCHAR(128),
  state           VARCHAR(8),
  zip             VARCHAR(16),
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  opened_at       DATE,                            -- license issue / open date
  raw             JSONB,                           -- original record for debugging
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_local_businesses_zip       ON local_businesses(zip);
CREATE INDEX IF NOT EXISTS idx_local_businesses_opened_at ON local_businesses(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_businesses_first_seen ON local_businesses(first_seen_at DESC);
