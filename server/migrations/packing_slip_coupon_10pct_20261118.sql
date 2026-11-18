-- The packing-slip thank-you code drops from 20% to 10% (Doc, 2026-11-18).
-- client/src/lib/packingSlip.ts now prints THANKYOU10; this registers it so
-- the quote form's promo check accepts the code the slip advertises.
--
-- THANKYOU20 is deliberately left ACTIVE. Slips carrying it are already in
-- customers' hands, and a printed promise we refuse at the counter costs
-- more than the ten points. It simply stops being printed. Retire it with
--   UPDATE promotions SET active = FALSE WHERE UPPER(code) = 'THANKYOU20';
-- once enough time has passed that none are still in circulation.
--
-- holiday = 'packing_slip' keeps getActivePromotion() (emailTheme.js) from
-- picking this evergreen code over a seasonal email promotion.
INSERT INTO promotions (code, holiday, headline, subtext, discount_type, discount_value, active, ai_generated)
SELECT 'THANKYOU10', 'packing_slip', '10% off your next order',
       'Thank-you code printed on packing slips', 'percent', 10, TRUE, FALSE
 WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE UPPER(code) = 'THANKYOU10');
