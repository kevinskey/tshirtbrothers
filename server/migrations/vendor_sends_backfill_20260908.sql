-- Backfill the one vendor send that happened in the ~10-minute window
-- between the send-files lane going live and the vendor_sends log table
-- deploying (2026-09-08 12:39 UTC, confirmed delivered in Resend).
INSERT INTO vendor_sends (vendor_name, vendor_email, source, reference, files, sent_at)
SELECT
  'KolorMatrix',
  'order@kolormatrix.com',
  'upload',
  '2 files',
  '[{"name":"Sam reup 9-4-26-01.png","key":"vendor-files/2026-09/5bb5a25d-465b-474c-a02d-b7f20f1a271a-Sam reup 9-4-26-01.png","bytes":20869354},
    {"name":"Sam reup 9-4-26-02.png","key":"vendor-files/2026-09/e25b4354-1ae2-487e-a0f1-598b8bae8437-Sam reup 9-4-26-02.png","bytes":45816296}]'::jsonb,
  '2026-09-08T12:39:38Z'
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_sends
  WHERE vendor_email = 'order@kolormatrix.com'
    AND sent_at = '2026-09-08T12:39:38Z'
);
