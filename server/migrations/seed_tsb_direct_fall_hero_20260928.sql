-- Turn on the fall seasonal hero for tsb-direct (shop.tshirtbrothers.com).
-- Idempotent: only seeds when the store has no seasonal config yet, so
-- later edits from the admin Seasonal Hero card are never clobbered.
UPDATE stores
   SET brand_json = brand_json || jsonb_build_object(
         'seasonal', jsonb_build_object(
           'theme',          'fall',
           'headline',       'Fall favorites, fresh off the press.',
           'subheadline',    'Sweater weather is here — Halloween tees, hoodies & crewnecks printed fresh by TShirt Brothers in Fairburn, GA.',
           'cta_text',       'Shop the Halloween drop',
           'collection_key', 'halloween',
           'until',          '2026-12-01'
         )
       )
 WHERE slug = 'tsb-direct'
   AND NOT (brand_json ? 'seasonal');
