-- Purge the 2026-09-09 signup-bot accounts. Signature: created on/after
-- 2026-09-09, role customer, single-token gibberish name, raw 10-digit
-- phone, and zero activity anywhere (no quotes, favorites, or saved gang
-- sheets). Any row a foreign key still references would fail the DELETE,
-- which is the desired failure mode — bots have no linked rows.
DELETE FROM users u
WHERE u.created_at >= '2026-09-09T00:00:00Z'
  AND u.role = 'customer'
  AND u.name ~ '^[A-Z][a-z]{3,12}$'
  AND u.phone ~ '^[0-9]{10}$'
  AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM quotes q2 WHERE q2.customer_email = u.email)
  AND NOT EXISTS (SELECT 1 FROM user_favorites f WHERE f.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM gang_sheets g WHERE g.created_by = u.id);
