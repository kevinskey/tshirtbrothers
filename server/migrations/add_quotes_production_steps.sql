-- Production sub-stages within a job (Doc, 2026-09-28): "in production"
-- really means blanks ordered -> print ordered -> press in progress ->
-- pressed, then balance paid and picked up / mailed. Balance already
-- lives in balance_paid_at; the rest is a per-step timestamp map:
--   { "blanks_ordered": iso, "print_ordered": iso, "press_in_progress": iso,
--     "pressed": iso, "delivered": "pickup"|"mailed", "delivered_at": iso }
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS production_steps jsonb NOT NULL DEFAULT '{}'::jsonb;
