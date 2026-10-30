-- Who printed the gang sheets for a job, and when they got the file.
--
-- "Gang sheets ordered" was a checkbox on the production checklist with
-- nothing behind it: ticking it recorded a timestamp but no fact about the
-- world. A sheet laid out from a quote (?fromQuote=) now carries the quote
-- id through to /admin/vendor-send, which stamps the step automatically and
-- records the vendor here — so the job board can answer "who has the prints
-- and when did they get them" without anyone searching their sent mail.
--
-- Blanks already had this via purchase_orders; this is the print half.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS print_vendor_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS print_vendor_sent_at TIMESTAMPTZ;
