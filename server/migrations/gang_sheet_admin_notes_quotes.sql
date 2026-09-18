-- DTF gang sheet orders: admin workflow additions (2026-09-18).
--
--   admin_note     - shop-side note, editable from /admin/dtf-orders
--                    (customer's checkout note stays in `note`)
--   quote_sent_at  - when a quote/requote email was last sent
--   white_bg_flag  - compose-time detection: at least one placed image is
--                    fully opaque with a near-white border (DTF prints
--                    white backgrounds as white ink — almost always a
--                    customer mistake, e.g. order #17)
ALTER TABLE gang_sheet_orders  ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE gang_sheet_orders  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ;
ALTER TABLE gang_sheet_orders  ADD COLUMN IF NOT EXISTS white_bg_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE gang_sheet_layouts ADD COLUMN IF NOT EXISTS white_bg_flag BOOLEAN NOT NULL DEFAULT false;
