-- Phase 1 / deliverable #1 of the Fabric.js port.
--
-- Adds the safety net the runtime port relies on. Ships *before* any code
-- that reads or writes these columns / tables, so the application can start
-- consuming them as soon as the port code merges.
--
-- Two concerns:
--   1. Saved designs use a positioned-div JSON shape today. After the port,
--      the new shape is Fabric's canvas.toJSON() output. We never overwrite
--      a v1 row with v2 absent an explicit user edit, and when we do, we
--      keep the original v1 payload in `elements_legacy` for rollback.
--   2. The admin restore-legacy endpoint (and any future admin action that
--      mutates a customer's saved design) writes an audit trail to
--      `design_audit_log` so a destructive call can be inspected after the
--      fact.

BEGIN;

-- ── saved_designs: schema version + legacy snapshot ────────────────────────
ALTER TABLE saved_designs
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS elements_legacy JSONB,
  ADD COLUMN IF NOT EXISTS legacy_archived_at TIMESTAMPTZ;

COMMENT ON COLUMN saved_designs.schema_version IS
  '1 = positioned-div DesignElement[] (pre-Fabric port). 2 = Fabric canvas.toJSON() shape.';
COMMENT ON COLUMN saved_designs.elements_legacy IS
  'Snapshot of the v1 elements payload taken at the moment of v1→v2 conversion. Populated only on the first save that flips schema_version from 1 to 2. Read-only thereafter.';
COMMENT ON COLUMN saved_designs.legacy_archived_at IS
  'When elements_legacy was populated. The 90-day cleanup job nulls elements_legacy after this timestamp + 90 days.';

-- Cheap index for the cleanup job.
CREATE INDEX IF NOT EXISTS idx_saved_designs_legacy_archived
  ON saved_designs(legacy_archived_at)
  WHERE elements_legacy IS NOT NULL;

-- ── design_audit_log: admin actions that mutate a saved_design ────────────
CREATE TABLE IF NOT EXISTS design_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  design_id       INTEGER     NOT NULL REFERENCES saved_designs(id) ON DELETE CASCADE,
  admin_user_id   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(50) NOT NULL,
  before_payload  JSONB,
  after_payload   JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE design_audit_log IS
  'Append-only log of admin actions that mutate a saved_design. before_payload captures the state being thrown away; after_payload captures what replaced it.';
COMMENT ON COLUMN design_audit_log.action IS
  'Free-form string. Known values so far: restore-legacy, reassign-owner, force-resync.';
COMMENT ON COLUMN design_audit_log.before_payload IS
  'For restore-legacy this is the v2 elements being overwritten — i.e. the state being thrown away. Critical: this is the state we lose visibility into otherwise.';
COMMENT ON COLUMN design_audit_log.after_payload IS
  'The state that replaced before_payload after the action. For restore-legacy: the v1 payload being restored.';

CREATE INDEX IF NOT EXISTS idx_design_audit_log_design
  ON design_audit_log(design_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_audit_log_admin
  ON design_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_audit_log_action
  ON design_audit_log(action);

COMMIT;
