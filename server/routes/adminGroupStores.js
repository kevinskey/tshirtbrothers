// TSB-internal admin API for Group Stores. Everything here requires a
// staff JWT (authenticate + adminOnly). This is the surface TSB uses to
// stand up a new group store for an organization, curate its product
// list from the S&S catalog, tweak the storefront brand, and manage the
// group admins.
//
// Group admins (school-side) never touch this — their UI lives on
// /api/group-store-admin/:slug.

import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchProducts } from '../services/ssActivewear.js';

const router = Router();
router.use(authenticate, adminOnly);

// ── GET /list ────────────────────────────────────────────────────────────
// Returns every group store with a couple of health-check numbers.
router.get('/list', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.slug, s.subdomain, s.name, s.status, s.owner_email,
              s.fulfillment_mode, s.is_fundraiser, s.created_at,
              s.brand_json, s.fundraiser_json,
              (SELECT COUNT(*) FROM store_products sp WHERE sp.store_id = s.id AND sp.is_active) AS active_product_count,
              (SELECT COUNT(*) FROM store_orders  so WHERE so.store_id = s.id)                    AS order_count,
              (SELECT COUNT(*) FROM store_admins  a  WHERE a.store_id  = s.id)                    AS admin_count
         FROM stores s
        WHERE s.store_type = 'group'
        ORDER BY s.created_at DESC`,
    );
    res.json({ stores: rows });
  } catch (err) { next(err); }
});

// ── POST / ───────────────────────────────────────────────────────────────
// Create a new group store. Body:
//   { slug, name, owner_email, brand_json?, fulfillment_mode?,
//     pickup_location_json?, is_fundraiser?, fundraiser_json?,
//     initial_admin?: { email, name?, role? } }
router.post('/', async (req, res, next) => {
  try {
    const {
      slug, name, owner_email, subdomain,
      brand_json, fulfillment_mode, pickup_location_json,
      is_fundraiser, fundraiser_json,
      initial_admin,
    } = req.body ?? {};
    if (!slug || !name || !owner_email) {
      return res.status(400).json({ error: 'slug + name + owner_email required' });
    }
    if (fulfillment_mode && !['ship_only', 'pickup_only', 'both'].includes(fulfillment_mode)) {
      return res.status(400).json({ error: 'invalid fulfillment_mode' });
    }
    if (subdomain && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      return res.status(400).json({ error: 'subdomain must be 2–63 lowercase letters/digits/hyphens' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storeIns = await client.query(
        `INSERT INTO stores
           (slug, name, owner_email, store_type, status, brand_json,
            fulfillment_mode, pickup_location_json, is_fundraiser, fundraiser_json,
            subdomain)
         VALUES ($1, $2, $3, 'group', 'active', $4, $5, $6, $7, $8, $9)
         RETURNING id, slug, subdomain, name, brand_json, fulfillment_mode,
                   is_fundraiser, created_at`,
        [
          slug, name, owner_email,
          brand_json ?? {},
          fulfillment_mode ?? 'ship_only',
          pickup_location_json ?? {},
          !!is_fundraiser,
          fundraiser_json ?? {},
          subdomain ? subdomain.toLowerCase() : null,
        ],
      );
      const store = storeIns.rows[0];

      // Every group store needs a default agreement so publishing
      // products doesn't blow up on the NOT NULL active_agreement_id.
      // Fundraiser split (if any) rides on this agreement.
      const feeConfig = is_fundraiser && fundraiser_json?.contribution_type
        ? {
            contribution_type: fundraiser_json.contribution_type,
            contribution_value: fundraiser_json.contribution_value,
          }
        : { contribution_type: 'percent', contribution_value: 0 };

      await client.query(
        `INSERT INTO store_agreements
           (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
         VALUES ($1, 'store', $2, $3, $4)`,
        [
          store.id,
          feeConfig,
          { cadence: 'per_campaign_close', method: 'ach' },
          owner_email,
        ],
      );

      // Seed the first admin (defaults to 'owner')
      if (initial_admin && initial_admin.email) {
        const role = ['viewer', 'bulk_buyer', 'owner'].includes(initial_admin.role)
          ? initial_admin.role
          : 'owner';
        await client.query(
          `INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (store_id, email) DO NOTHING`,
          [store.id, initial_admin.email, initial_admin.name ?? null, role, owner_email],
        );
      }

      await client.query('COMMIT');
      res.status(201).json(store);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: `slug "${slug}" already in use` });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ── PATCH /:id ───────────────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const allowed = ['name', 'brand_json', 'status', 'fulfillment_mode',
                     'pickup_location_json', 'is_fundraiser', 'fundraiser_json',
                     'subdomain'];
    if (req.body?.subdomain !== undefined && req.body.subdomain) {
      const s = String(req.body.subdomain).toLowerCase();
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) {
        return res.status(400).json({ error: 'subdomain must be 2–63 lowercase letters/digits/hyphens' });
      }
      req.body.subdomain = s;
    }
    const patches = [];
    const params = [];
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        params.push(req.body[key]);
        patches.push(`${key} = $${params.length}`);
      }
    }
    if (patches.length === 0) return res.status(400).json({ error: 'no fields to update' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE stores SET ${patches.join(', ')}
        WHERE id = $${params.length} AND store_type = 'group'
      RETURNING id, slug, name, status, brand_json, fulfillment_mode,
                pickup_location_json, is_fundraiser, fundraiser_json`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Group store not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /:id ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const store = await pool.query(
      `SELECT id, slug, subdomain, name, status, owner_email, brand_json,
              fulfillment_mode, pickup_location_json, is_fundraiser,
              fundraiser_json, created_at
         FROM stores WHERE id = $1 AND store_type = 'group'`,
      [id],
    );
    if (!store.rows[0]) return res.status(404).json({ error: 'Group store not found' });
    const products = await pool.query(
      `SELECT id, tsb_blank_ss_id, title, slug, retail_price_cents,
              blank_cost_cents, decoration_cost_cents, min_qty,
              is_active, opens_at, closes_at, cover_image, published_at
         FROM store_products
        WHERE store_id = $1
        ORDER BY published_at DESC`,
      [id],
    );
    const admins = await pool.query(
      `SELECT id, email, name, role, created_at, last_login_at
         FROM store_admins WHERE store_id = $1 ORDER BY created_at ASC`,
      [id],
    );
    res.json({ store: store.rows[0], products: products.rows, admins: admins.rows });
  } catch (err) { next(err); }
});

// ── POST /:id/products ───────────────────────────────────────────────────
// Publish a curated product to a group store. Body:
//   { tsb_blank_ss_id, title, slug, retail_price_cents,
//     description?, cover_image?, variants?, blank_cost_cents?,
//     decoration_cost_cents?, min_qty?, opens_at?, closes_at? }
router.post('/:id/products', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const {
      tsb_blank_ss_id, title, slug, retail_price_cents,
      description, cover_image, variants,
      blank_cost_cents, decoration_cost_cents, min_qty,
      opens_at, closes_at,
    } = req.body ?? {};

    if (!tsb_blank_ss_id) return res.status(400).json({ error: 'tsb_blank_ss_id required' });
    if (!title || !slug)  return res.status(400).json({ error: 'title + slug required' });
    if (!Number.isInteger(retail_price_cents) || retail_price_cents <= 0) {
      return res.status(400).json({ error: 'retail_price_cents (positive int) required' });
    }

    const storeRow = await pool.query(
      `SELECT id FROM stores WHERE id = $1 AND store_type = 'group'`, [id],
    );
    if (!storeRow.rows[0]) return res.status(404).json({ error: 'Group store not found' });

    const agr = await pool.query(
      `SELECT id FROM store_agreements
        WHERE store_id = $1 AND kind = 'store'
        ORDER BY accepted_at DESC LIMIT 1`,
      [id],
    );
    if (!agr.rows[0]) {
      return res.status(400).json({ error: 'Store missing default agreement (should be seeded at store creation)' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO store_products
           (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
            retail_price_cents, variants_json, active_agreement_id,
            blank_cost_cents, decoration_cost_cents, min_qty,
            opens_at, closes_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, slug, title, retail_price_cents, min_qty, is_active, published_at`,
        [
          id, tsb_blank_ss_id, title, slug, description ?? null, cover_image ?? null,
          retail_price_cents, variants ?? {}, agr.rows[0].id,
          blank_cost_cents ?? null, decoration_cost_cents ?? null, min_qty ?? 1,
          opens_at ?? null, closes_at ?? null,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: `slug "${slug}" already in use for this store` });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

// ── PATCH /:id/products/:productId ───────────────────────────────────────
router.patch('/:id/products/:productId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const productId = parseInt(req.params.productId, 10);
    if (!Number.isInteger(id) || !Number.isInteger(productId)) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const allowed = ['title', 'description', 'cover_image', 'retail_price_cents',
                     'variants_json', 'blank_cost_cents', 'decoration_cost_cents',
                     'min_qty', 'is_active', 'opens_at', 'closes_at'];
    const patches = [];
    const params = [];
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        params.push(req.body[key]);
        patches.push(`${key} = $${params.length}`);
      }
    }
    if (patches.length === 0) return res.status(400).json({ error: 'no fields to update' });
    params.push(productId, id);
    const { rows } = await pool.query(
      `UPDATE store_products SET ${patches.join(', ')}
        WHERE id = $${params.length - 1} AND store_id = $${params.length}
      RETURNING id, title, slug, retail_price_cents, is_active`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── S&S catalog picker ───────────────────────────────────────────────────
// GET /ss-catalog?q=hoodie&brand=Bella&limit=50
// Reads the local ss_catalog_cache. If empty, falls through to the live
// S&S API so admins can bootstrap without waiting for the nightly sync.
router.get('/ss-catalog', async (req, res, next) => {
  try {
    const q       = req.query.q     ? String(req.query.q).trim().toLowerCase() : '';
    const brand   = req.query.brand ? String(req.query.brand).trim()           : '';
    const limit   = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10), 1), 200);

    const params = [];
    const where = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(lower(name) LIKE $${params.length} OR lower(ss_id) LIKE $${params.length})`);
    }
    if (brand) {
      params.push(brand);
      where.push(`brand = $${params.length}`);
    }
    params.push(limit);
    const cache = await pool.query(
      `SELECT ss_id, brand, name, category, base_cost, colors, sizes, image_url
         FROM ss_catalog_cache
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY brand NULLS LAST, name
        LIMIT $${params.length}`,
      params,
    );

    if (cache.rows.length > 0) {
      return res.json({ source: 'cache', results: cache.rows });
    }

    // Cache miss: hit S&S live and shape into the same result form.
    try {
      const live = await fetchProducts({ limit });
      const filtered = (live.products || [])
        .filter((p) => {
          if (q && !(`${p.name} ${p.ss_id}`.toLowerCase().includes(q))) return false;
          if (brand && p.brand !== brand) return false;
          return true;
        })
        .slice(0, limit)
        .map((p) => ({
          ss_id: p.ss_id,
          brand: p.brand,
          name: p.name,
          category: p.category,
          base_cost: p.base_price,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          image_url: p.image_url ?? null,
        }));
      res.json({ source: 'live', results: filtered });
    } catch (err) {
      console.error('[adminGroupStores] S&S live fetch failed:', err.message);
      res.json({ source: 'empty', results: [] });
    }
  } catch (err) { next(err); }
});

// ── POST /:id/admins ─────────────────────────────────────────────────────
router.post('/:id/admins', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { email, name, role } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const roleFinal = ['viewer', 'bulk_buyer', 'owner'].includes(role) ? role : 'viewer';
    try {
      const { rows } = await pool.query(
        `INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
         VALUES ($1, $2, $3, $4, 'tsb-admin')
         RETURNING id, email, name, role, created_at`,
        [id, email, name ?? null, roleFinal],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'That email is already an admin for this store' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

// ── DELETE /:id/admins/:adminId ──────────────────────────────────────────
router.delete('/:id/admins/:adminId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const adminId = parseInt(req.params.adminId, 10);
    if (!Number.isInteger(id) || !Number.isInteger(adminId)) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM store_admins WHERE id = $1 AND store_id = $2`,
      [adminId, id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Admin not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
