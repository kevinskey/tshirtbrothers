-- Thank-you code printed on every packing slip (client/src/lib/packingSlip.ts).
-- Registered here so the quote form's promo check accepts it. Tagged
-- holiday = 'packing_slip' so getActivePromotion() (emailTheme.js) never
-- picks this evergreen code over a seasonal email promotion.
INSERT INTO promotions (code, holiday, headline, subtext, discount_type, discount_value, active, ai_generated)
SELECT 'THANKYOU20', 'packing_slip', '20% off your next order',
       'Thank-you code printed on packing slips', 'percent', 20, TRUE, FALSE
 WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE UPPER(code) = 'THANKYOU20');
