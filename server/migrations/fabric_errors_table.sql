-- Phase 1 / deliverable #6 of the Fabric.js port.
--
-- Lightweight error log used by the new Fabric renderer to surface
-- production failures (hydration mismatches, font load errors, export
-- panics) without standing up a full Sentry / Bugsnag integration. The
-- client posts to /api/client-errors via the reportClientError() wrapper
-- — that wrapper is the only file we touch the day we replace this with
-- a proper APM tool.
--
-- Privacy: we DO NOT store the canvas JSON or the user's design content.
-- Only object count, object types, the first 500 chars of the stack, and
-- the user-agent. This keeps PII / IP exposure low and the table small.

BEGIN;

CREATE TABLE IF NOT EXISTS fabric_errors (
  id            BIGSERIAL    PRIMARY KEY,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  user_id       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  -- Source of the error. Known values so far:
  --   fabric.init     — Fabric canvas constructor / dispose
  --   fabric.hydrate  — v1 → Fabric conversion (hydrateLegacy)
  --   fabric.font     — opentype.js font load / decode
  --   fabric.export   — PNG / SVG export pipeline
  --   fabric.save     — save-to-server + sidecar elements_legacy write
  tag           VARCHAR(64)  NOT NULL,
  message       TEXT         NOT NULL,
  stack         TEXT,
  object_count  INTEGER,
  object_types  TEXT,
  user_agent    TEXT,
  url           TEXT
);

COMMENT ON TABLE fabric_errors IS
  'Client-side errors from the new Fabric renderer. Populated via /api/client-errors. Drives the flag-on go/no-go criterion (zero new Fabric errors over 7 days).';
COMMENT ON COLUMN fabric_errors.tag IS
  'Source tag — e.g. fabric.hydrate, fabric.font. Stable identifiers, indexed for trend queries.';
COMMENT ON COLUMN fabric_errors.stack IS
  'First 500 chars of the error stack. Truncated client-side so we never store full canvas dumps that may contain user content.';
COMMENT ON COLUMN fabric_errors.object_types IS
  'Comma-separated list of Fabric object types on the canvas at the time of the error (e.g. "Image,IText,Group"). Lets us correlate failures with content shapes without storing the content itself.';

CREATE INDEX IF NOT EXISTS idx_fabric_errors_created
  ON fabric_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fabric_errors_tag_created
  ON fabric_errors(tag, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fabric_errors_user
  ON fabric_errors(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMIT;
