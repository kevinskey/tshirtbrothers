-- Carry the S&S blank id the tenant already picked in the studio through
-- to the draft, so the reviewer doesn't have to re-select it in the
-- Approve modal. Nullable — a submission without a picked product still
-- lands (reviewer picks the blank at approve time as before).

ALTER TABLE store_design_drafts
  ADD COLUMN IF NOT EXISTS tsb_blank_ss_id VARCHAR(100);
