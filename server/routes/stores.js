// Franchise store API — read/write access for a store's own data. Auth
// via x-store-api-key header (see middleware/storeApiKey.js). The
// authenticated store slug is on req.store_slug; all queries are scoped
// to that store's rows so a leaked key can't read another store's data.
//
// Week 1 scope: enough surface to prove the pipeline.
//   GET  /api/stores/:slug                        — store profile + brand
//   GET  /api/stores/:slug/orders                 — order mirror
//   GET  /api/stores/:slug/agreements/active      — current fee + payout terms
//   POST /api/stores/:slug/agreements             — record an accepted agreement
//   POST /api/stores/:slug/return-requests        — buyer submitted a return form
//   GET  /api/stores/:slug/payouts                — payout history
//
// Everything else (product publishing, self-serve signup, ledger export,
// admin approvals, buyer-facing storefront) lives in later weeks.

import { Router } from 'express';
import pool from '../db.js';
import { storeApiKey } from '../middleware/storeApiKey.js';

const router = Router();

// ── Public routes (no auth) ──────────────────────────────────────────────
// Register BEFORE the storeApiKey middleware so they stay open.

// GET /api/stores/:slug/public-brand
// Returns only publicly-safe fields (name, brand_json). Used by TSB's
// whitelabel design studio + storefront to skin the UI for a specific
// store. Does NOT reveal owner_email, gleeworld_tenant_slug, status, etc.
router.get('/:slug/public-brand', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name, brand_json
         FROM stores
        WHERE slug = $1 AND status = 'active'`,
      [req.params.slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store not found' });
    // Strong caching — brand config changes rarely and the endpoint is
    // hit on every studio page load.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Authenticated routes ─────────────────────────────────────────────────
// All /stores/:slug/* routes below require the store API key.
router.use('/:slug', storeApiKey);

// Helper: look up store id from slug (single-row).
async function findStoreId(slug) {
  const { rows } = await pool.query(
    `SELECT id FROM stores WHERE slug = $1 AND status = 'active'`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

// ── GET /api/stores/:slug ────────────────────────────────────────────────
router.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, owner_email, brand_json, gleeworld_tenant_slug,
              status, created_at
         FROM stores
        WHERE slug = $1`,
      [req.store_slug],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/stores/:slug/orders ─────────────────────────────────────────
// Optional query params:
//   ?since=<iso8601>   only orders created after this timestamp
//   ?limit=<n>         cap the response (default 100, max 500)
router.get('/:slug/orders', async (req, res, next) => {
  try {
    const storeId = await findStoreId(req.store_slug);
    if (!storeId) return res.status(404).json({ error: 'Store not found' });

    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100')), 1), 500);
    const params = [storeId];
    let where = 'store_id = $1';
    if (since && !isNaN(since.getTime())) {
      params.push(since.toISOString());
      where += ` AND created_at > $${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT id, tsb_order_ref, buyer_email, subtotal_cents, shipping_cents,
              tax_cents, gross_total_cents, store_earnings_cents,
              tsb_earnings_cents, status, created_at, updated_at,
              split_snapshot_json
         FROM store_orders
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// ── GET /api/stores/:slug/agreements/active ──────────────────────────────
// Returns the store-level agreement plus, if ?campaign_ref=X is set, the
// campaign-specific override if one exists.
router.get('/:slug/agreements/active', async (req, res, next) => {
  try {
    const storeId = await findStoreId(req.store_slug);
    if (!storeId) return res.status(404).json({ error: 'Store not found' });

    const campaignRef = req.query.campaign_ref ? String(req.query.campaign_ref) : null;

    const storeAgreement = await pool.query(
      `SELECT id, kind, campaign_ref, fee_config_json, payout_terms_json,
              accepted_by_email, accepted_at
         FROM store_agreements
        WHERE store_id = $1 AND kind = 'store'
        ORDER BY accepted_at DESC
        LIMIT 1`,
      [storeId],
    );

    let campaignAgreement = null;
    if (campaignRef) {
      const r = await pool.query(
        `SELECT id, kind, campaign_ref, fee_config_json, payout_terms_json,
                accepted_by_email, accepted_at
           FROM store_agreements
          WHERE store_id = $1 AND kind = 'campaign' AND campaign_ref = $2
          ORDER BY accepted_at DESC
          LIMIT 1`,
        [storeId, campaignRef],
      );
      campaignAgreement = r.rows[0] ?? null;
    }

    res.json({
      store: storeAgreement.rows[0] ?? null,
      campaign: campaignAgreement,
    });
  } catch (err) { next(err); }
});

// ── POST /api/stores/:slug/agreements ────────────────────────────────────
// Body: { kind: 'store'|'campaign', campaign_ref?, fee_config_json,
//         payout_terms_json, accepted_by_email }
// Insert-only — agreements are immutable. New acceptance = new row.
router.post('/:slug/agreements', async (req, res, next) => {
  try {
    const storeId = await findStoreId(req.store_slug);
    if (!storeId) return res.status(404).json({ error: 'Store not found' });

    const {
      kind, campaign_ref, fee_config_json, payout_terms_json, accepted_by_email,
    } = req.body ?? {};

    if (!kind || !['store', 'campaign'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be "store" or "campaign"' });
    }
    if (kind === 'campaign' && !campaign_ref) {
      return res.status(400).json({ error: 'campaign_ref required when kind=campaign' });
    }
    if (!fee_config_json || typeof fee_config_json !== 'object') {
      return res.status(400).json({ error: 'fee_config_json is required' });
    }
    if (!payout_terms_json || typeof payout_terms_json !== 'object') {
      return res.status(400).json({ error: 'payout_terms_json is required' });
    }
    if (!accepted_by_email) {
      return res.status(400).json({ error: 'accepted_by_email is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO store_agreements
         (store_id, kind, campaign_ref, fee_config_json, payout_terms_json, accepted_by_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, campaign_ref, fee_config_json, payout_terms_json,
                 accepted_by_email, accepted_at`,
      [storeId, kind, campaign_ref ?? null, fee_config_json, payout_terms_json, accepted_by_email],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/stores/:slug/return-requests ───────────────────────────────
// Buyer submits a return form on the tenant site; the tenant site posts
// here. TSB support triages via admin UI (later week). Body:
//   { order_id, buyer_email, reason, photos?: [urls] }
router.post('/:slug/return-requests', async (req, res, next) => {
  try {
    const storeId = await findStoreId(req.store_slug);
    if (!storeId) return res.status(404).json({ error: 'Store not found' });

    const { order_id, buyer_email, reason, photos } = req.body ?? {};
    if (!order_id || !Number.isInteger(order_id)) {
      return res.status(400).json({ error: 'order_id (int) is required' });
    }
    if (!buyer_email) return res.status(400).json({ error: 'buyer_email is required' });
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ error: 'reason is required' });
    }

    // Enforce that the order belongs to the authenticated store — prevents
    // a leaked key from filing returns against another store's order.
    const owns = await pool.query(
      `SELECT 1 FROM store_orders WHERE id = $1 AND store_id = $2`,
      [order_id, storeId],
    );
    if (!owns.rows[0]) {
      return res.status(404).json({ error: 'Order not found for this store' });
    }

    const { rows } = await pool.query(
      `INSERT INTO store_return_requests
         (store_id, order_id, buyer_email, reason, photos_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`,
      [storeId, order_id, buyer_email, String(reason).trim(), Array.isArray(photos) ? photos : []],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/stores/:slug/payouts ────────────────────────────────────────
router.get('/:slug/payouts', async (req, res, next) => {
  try {
    const storeId = await findStoreId(req.store_slug);
    if (!storeId) return res.status(404).json({ error: 'Store not found' });

    const { rows } = await pool.query(
      `SELECT id, period_start, period_end, amount_cents, method, status,
              reference, created_at, paid_at
         FROM store_payouts
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [storeId],
    );
    res.json({ payouts: rows });
  } catch (err) { next(err); }
});

export default router;
