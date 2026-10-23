// Public buyer-facing storefront read API. No auth — anyone can browse.
// Serves data to a store's public shop page (e.g., a GleeWorld tenant's
// /store/custom page, or a TSB-hosted store URL later).
//
// Only returns fields the buyer needs. Split configuration, agreement
// details, ledger, and payouts are NOT exposed here — those live behind
// the store API key on /api/stores/:slug/*.
//
// The :slug path param accepts EITHER stores.slug OR stores.subdomain,
// so `/api/store-shop/sandycreekpto` and `/api/store-shop/sandy-creek-high-school-pto`
// both work. This lets the SPA on <sub>.tshirtbrothers.com just pass the
// subdomain label straight through without knowing which is which.

import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Helper — look up a store row by slug OR subdomain (case-insensitive),
// active only. Returns null if none match.
async function findActiveStore(handle) {
  const { rows } = await pool.query(
    `SELECT id, slug, name, brand_json, store_type, subdomain,
            fulfillment_mode, pickup_location_json,
            is_fundraiser, fundraiser_json
       FROM stores
      WHERE status = 'active'
        AND (slug = $1 OR lower(subdomain) = lower($1))
      LIMIT 1`,
    [handle],
  );
  return rows[0] ?? null;
}

// GET /api/store-shop/:handle
// Store profile for the storefront header. Accepts slug OR subdomain.
router.get('/:handle', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.set('Cache-Control', 'public, max-age=60');
    // Strip id from response — internal only
    const { id, ...publicFields } = store;
    void id;
    res.json(publicFields);
  } catch (err) { next(err); }
});

// GET /api/store-shop
// Directory of active group stores. Powers tshirtbrothers.com/stores.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, subdomain, name, brand_json, is_fundraiser, fundraiser_json
         FROM stores
        WHERE store_type = 'group' AND status = 'active'
        ORDER BY name ASC
        LIMIT 200`,
    );
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ stores: rows });
  } catch (err) { next(err); }
});

// GET /api/store-shop/:handle/products
// Editable storefront content, grouped by slot. The storefront asks for a
// slot ('hero') and renders the blocks in order; an empty array means the
// store has not customized it and the page should fall back to its own
// defaults rather than render nothing.
router.get('/:handle/content', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { rows } = await pool.query(
      `SELECT key, body, sort_order
         FROM store_content
        WHERE store_id = $1 AND active
        ORDER BY key, sort_order`,
      [store.id],
    );

    const content = {};
    for (const row of rows) (content[row.key] ??= []).push(row.body);

    res.set('Cache-Control', 'public, max-age=30');
    res.json({ content });
  } catch (err) { next(err); }
});

// A store's own categories, with the count of live products in each so the
// storefront can hide empty ones.
router.get('/:handle/categories', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { rows } = await pool.query(
      `SELECT c.name, c.slug, c.description, c.image_url, c.sort_order,
              COUNT(p.id)::int AS product_count
         FROM store_categories c
         LEFT JOIN store_product_categories pc ON pc.store_category_id = c.id
         LEFT JOIN store_products p
                ON p.id = pc.store_product_id
               AND p.is_active
               AND (p.opens_at IS NULL OR p.opens_at <= NOW())
               AND (p.closes_at IS NULL OR p.closes_at > NOW())
        WHERE c.store_id = $1 AND c.active
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`,
      [store.id],
    );

    res.set('Cache-Control', 'public, max-age=30');
    res.json({ categories: rows });
  } catch (err) { next(err); }
});

// Currently-sellable products for a store (looked up by slug OR subdomain).
router.get('/:handle/products', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const campaignRef = req.query.campaign_ref ? String(req.query.campaign_ref) : null;
    const params = [store.id];
    let where = `p.store_id = $1 AND p.is_active = true
                 AND (p.opens_at IS NULL OR p.opens_at <= NOW())
                 AND (p.closes_at IS NULL OR p.closes_at > NOW())`;
    if (campaignRef) {
      params.push(campaignRef);
      where += ` AND p.campaign_ref = $${params.length}`;
    }
    // sort_order is the store's own merchandising order; published_at keeps
    // the previous behaviour as the tie-break, so stores that have never
    // reordered (every row at the 0 default) look exactly as before.
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.slug, p.description, p.cover_image,
              p.retail_price_cents, p.compare_at_cents, p.gallery_json,
              p.variants_json, p.campaign_ref, p.sort_order,
              p.opens_at, p.closes_at, p.published_at,
              COALESCE(
                ARRAY_REMOVE(ARRAY_AGG(c.slug ORDER BY pc.sort_order), NULL),
                '{}'
              ) AS category_slugs
         FROM store_products p
         LEFT JOIN store_product_categories pc ON pc.store_product_id = p.id
         LEFT JOIN store_categories c
                ON c.id = pc.store_category_id AND c.active
        WHERE ${where}
        GROUP BY p.id
        -- p.id last so the order is deterministic. Seeded stores share one
        -- published_at to the microsecond, which left sort_order and
        -- published_at both tied and the result order up to the planner —
        -- it visibly reshuffled when this query gained its GROUP BY.
        ORDER BY p.sort_order, p.published_at DESC, p.id
        LIMIT 200`,
      params,
    );
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ products: rows });
  } catch (err) { next(err); }
});

// GET /api/store-shop/:handle/product/:product_slug
// Single product detail.
router.get('/:handle/product/:product_slug', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Product not found' });
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.slug, p.description, p.cover_image,
              p.retail_price_cents, p.compare_at_cents, p.gallery_json,
              p.variants_json, p.campaign_ref, p.sort_order,
              p.opens_at, p.closes_at, p.published_at,
              COALESCE(
                ARRAY_REMOVE(ARRAY_AGG(c.slug ORDER BY pc.sort_order), NULL),
                '{}'
              ) AS category_slugs
         FROM store_products p
         LEFT JOIN store_product_categories pc ON pc.store_product_id = p.id
         LEFT JOIN store_categories c
                ON c.id = pc.store_category_id AND c.active
        WHERE p.store_id = $1 AND p.slug = $2 AND p.is_active = true
        GROUP BY p.id`,
      [store.id, req.params.product_slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
