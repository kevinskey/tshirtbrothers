-- Offer 34 ft gang sheets.
--
-- The store settings row capped length at 10 ft. Nothing else had to
-- change to support 34: /compose derives sharp's limitInputPixels from
-- max_ft (6,600 x 34ft*3,600 = 808M px, inside the 40 ft / 950M px
-- ceiling the admin form already allows), the customer checkout handoff
-- renders server-side so the browser's canvas area limit never applies,
-- and the builder's Export PNG splits anything over 5 ft into segments.
--
-- Guarded on `< 34` so this is a one-way raise: if an admin later lowers
-- the ceiling in /admin, a replay of this file can't quietly undo it.
-- (The runner tracks applied filenames, so it only runs once anyway.)
UPDATE gang_sheet_store_settings
   SET max_ft = 34,
       updated_at = now()
 WHERE id = 1
   AND max_ft < 34;
