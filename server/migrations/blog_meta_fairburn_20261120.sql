-- Blog meta copy still placed the shop in Tyrone (SEO audit 2026-11-20).
--
-- The PR #52 copy fix only touched source files; these lines live in
-- blog_posts.meta_description / excerpt, so Google and Bing kept showing the
-- old location. The shop is in Fairburn. "Same-day pickup" is also dropped —
-- it isn't a standing offer — and no turnaround claim replaces it.
--
-- Idempotent: each UPDATE is guarded on the stale text, so it is a no-op once
-- applied. Deliberately NOT a blanket find-and-replace of "Tyrone": one post
-- is legitimately about serving Tyrone customers, and its slug (which
-- contains the word) must not change. Only the exact stale phrases are
-- rewritten, only in these two columns; slugs and post bodies are untouched.

UPDATE blog_posts SET
  meta_description = REPLACE(REPLACE(meta_description,
    'in Tyrone and Fairburn', 'in Fairburn'),
    ' Same-day pickup.', ''),
  excerpt = REPLACE(REPLACE(excerpt,
    'in Tyrone and Fairburn', 'in Fairburn'),
    ' Same-day pickup.', '')
WHERE (meta_description LIKE '%in Tyrone and Fairburn%'
    OR excerpt          LIKE '%in Tyrone and Fairburn%'
    OR meta_description LIKE '%Same-day pickup.%'
    OR excerpt          LIKE '%Same-day pickup.%');

UPDATE blog_posts SET
  meta_description = REPLACE(meta_description, 'T-Shirt Brothers in Tyrone, GA', 'T-Shirt Brothers in Fairburn, GA'),
  excerpt          = REPLACE(excerpt,          'T-Shirt Brothers in Tyrone, GA', 'T-Shirt Brothers in Fairburn, GA')
WHERE (meta_description LIKE '%T-Shirt Brothers in Tyrone, GA%'
    OR excerpt LIKE '%T-Shirt Brothers in Tyrone, GA%');

UPDATE blog_posts SET
  meta_description = REPLACE(meta_description, 'in Tyrone/Fairburn, GA', 'in Fairburn, GA'),
  excerpt          = REPLACE(excerpt,          'in Tyrone/Fairburn, GA', 'in Fairburn, GA')
WHERE (meta_description LIKE '%in Tyrone/Fairburn, GA%'
    OR excerpt LIKE '%in Tyrone/Fairburn, GA%');
