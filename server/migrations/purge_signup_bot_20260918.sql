-- Purge the 2026-09-12..09-18 signup-bot accounts. Same crew as the
-- 2026-09-09 wave (see purge_signup_bot_20260909.sql) but they adapted to
-- the signup-token defense: fetch the token, wait out the 3s minimum age,
-- resubmit — one signup per hour, each from a fresh proxy/Tor IP.
--
-- Signature is unchanged: role customer, single-token gibberish name,
-- raw 10-digit phone, and no real activity anywhere. Bots do leave
-- activity_events rows (they replay the client flow far enough to trip
-- the studio-open tracker), so those are cleaned up here too —
-- activity_events has no FK and would otherwise keep orphan rows.
WITH victims AS (
  SELECT u.id, u.email
    FROM users u
   WHERE u.created_at >= '2026-09-12T00:00:00Z'
     AND u.role = 'customer'
     AND u.name ~ '^[A-Z][a-z]{3,12}$'
     AND u.phone ~ '^[0-9]{10}$'
     AND NOT EXISTS (SELECT 1 FROM quotes q  WHERE q.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM quotes q2 WHERE LOWER(q2.customer_email) = LOWER(u.email))
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE LOWER(i.customer_email) = LOWER(u.email))
     AND NOT EXISTS (SELECT 1 FROM user_favorites f WHERE f.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM saved_designs d WHERE d.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM mockups m WHERE m.customer_id = u.id
                        OR LOWER(m.customer_email) = LOWER(u.email))
     AND NOT EXISTS (SELECT 1 FROM gang_sheets g WHERE g.created_by = u.id)
     AND NOT EXISTS (SELECT 1 FROM gang_sheet_orders go WHERE LOWER(go.customer_email) = LOWER(u.email))
     AND NOT EXISTS (SELECT 1 FROM store_admins sa WHERE LOWER(sa.email) = LOWER(u.email))
),
purged_events AS (
  DELETE FROM activity_events a
   USING victims v
   WHERE a.user_id = v.id OR LOWER(a.email) = LOWER(v.email)
)
DELETE FROM users u USING victims v WHERE u.id = v.id;
