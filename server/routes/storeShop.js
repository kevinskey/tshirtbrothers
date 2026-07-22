// Public buyer-facing storefront read API. No auth — anyone can browse.
// Serves data to a store's public shop page (e.g., a GleeWorld tenant's
// /store/custom page, or a TSB-hosted store URL later).
//
// Only returns fields the buyer needs. Split configuration, agreement
// details, ledger, and payouts are NOT exposed here — those live behind
// the store API key on /api/stores/:slug/*.

import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/store-shop/:slug
// Store profile for the storefront header (name, public brand fields).
router.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, brand_json
         FROM stores
        WHERE slug = $1 AND status = 'active'`,
      [req.params.slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store not found' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/store-shop/:slug/products
// Currently-sellable products: is_active AND within opens_at/closes_at
// window (if set). Optional query param ?campaign_ref=X restricts to a
// campaign's items only (drives the /fundraiser/<slug> page).
router.get('/:slug/products', async (req, res, next) => {
  try {
    const store = await pool.query(
      `SELECT id FROM stores WHERE slug = $1 AND status = 'active'`,
      [req.params.slug],
    );
    if (!store.rows[0]) return res.status(404).json({ error: 'Store not found' });

    const campaignRef = req.query.campaign_ref ? String(req.query.campaign_ref) : null;
    const params = [store.rows[0].id];
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

// GET /api/store-shop/:slug/product/:product_slug
// Single product detail — used by the checkout page for price + variants.
router.get('/:slug/product/:product_slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sp.id, sp.title, sp.slug, sp.description, sp.cover_image,
              sp.retail_price_cents, sp.variants_json, sp.campaign_ref,
              sp.opens_at, sp.closes_at, sp.published_at
         FROM store_products sp
         JOIN stores s ON s.id = sp.store_id
        WHERE s.slug = $1 AND s.status = 'active'
          AND sp.slug = $2 AND sp.is_active = true`,
      [req.params.slug, req.params.product_slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
