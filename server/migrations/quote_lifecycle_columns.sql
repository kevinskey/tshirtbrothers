-- Lifecycle columns the code already reads/writes but that were only ever
-- ALTERed into prod by hand — a fresh database throws "column does not
-- exist" on the status PATCH, the mockup respond handler, the triage
-- worker, and both follow-up crons. Idempotent: prod already has these.

-- Stage-entry stamps (PATCH /api/quotes/:id and mockup respond)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_sent_at     TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_approved_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_rejected_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS in_production_at   TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ready_at           TIMESTAMPTZ;

-- Customer's rejection note from the mockup approval page
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_feedback TEXT;

-- One-shot notification dedupe stamps (review request, abandoned-quote cron)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_sent_at      TIMESTAMPTZ;

-- AI triage result (JSON string from DeepSeek, stored verbatim)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS triage TEXT;

-- Intake fields written by POST /api/quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS date_needed      DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipping_method  TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipping_address JSONB;
