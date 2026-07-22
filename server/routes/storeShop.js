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
// Currently-sellable products for a store (looked up by slug OR subdomain).
router.get('/:handle/products', async (req, res, next) => {
  try {
    const store = await findActiveStore(req.params.handle);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const campaignRef = req.query.campaign_ref ? String(req.query.campaign_ref) : null;
    const params = [store.id];
    let where = `store_id = $1 AND is_active = true
                 AND (opens_at IS NULL OR opens_at <= NOW())
                 AND (closes_at IS NULL OR closes_at > NOW())`;
    if (campaignRef) {
      params.push(campaignRef);
      where += ` AND campaign_ref = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, title, slug, description, cover_image,
              retail_price_cents, variants_json, campaign_ref,
              opens_at, closes_at, published_at
         FROM store_products
        WHERE ${where}
        ORDER BY published_at DESC
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
      `SELECT id, title, slug, description, cover_image,
              retail_price_cents, variants_json, campaign_ref,
              opens_at, closes_at, published_at
         FROM store_products
        WHERE store_id = $1 AND slug = $2 AND is_active = true`,
      [store.id, req.params.product_slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
