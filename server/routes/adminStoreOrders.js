// TSB-internal view of group/fundraiser store orders.
//
// A storefront sale captured by storeOrderCapture lands in store_orders
// and nowhere else: it was invisible in the Workflow pipeline and on the
// dashboard, so shirts people had already paid for had no production
// trail and nobody was told to print them (Sensory Seasons had 3 such
// orders sitting at 'paid' for days, 2026-10-02).
//
// These endpoints give the pipeline something to render and advance:
//   GET   /api/admin/store-orders?status=open|all
//   PATCH /api/admin/store-orders/:id   { status }
//
// Status ladder, deliberately shorter than the quote ladder — there is no
// mockup round trip on a store order, the design is already published:
//   paid → in_production → ready → fulfilled   (or cancelled)
import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, adminOnly);

export const STORE_ORDER_STATUSES = ['paid', 'in_production', 'ready', 'fulfilled', 'cancelled'];
/** Statuses that still need work from the shop. */
export const OPEN_STORE_ORDER_STATUSES = ['paid', 'in_production', 'ready'];

// GET /api/admin/store-orders?status=open (default) | all | <status>
router.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'open');
    const params = [];
    let where = '1=1';
    if (status === 'open') {
      where = `o.status = ANY($1)`;
      params.push(OPEN_STORE_ORDER_STATUSES);
    } else if (status !== 'all') {
      where = `o.status = $1`;
      params.push(status);
    }
    const { rows } = await pool.query(
      `SELECT o.id, o.store_id, s.name AS store_name, s.slug AS store_slug,
              o.buyer_email, o.status, o.fulfillment_type, o.is_bulk,
              o.subtotal_cents, o.shipping_cents, o.gross_total_cents,
              o.store_earnings_cents, o.tsb_earnings_cents,
              o.split_snapshot_json, o.tsb_order_ref, o.created_at, o.updated_at,
              -- Line titles for the pipeline row: the buyer bought named
              -- products, not an abstract "store order".
              (SELECT json_agg(json_build_object(
                        'store_product_id', sp.id,
                        'title', sp.title,
                        'cover_image', sp.cover_image,
                        'qty', (l->>'qty')::int,
                        'variant', l->'variant'))
                 FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines', '[]'::jsonb)) l
                 JOIN store_products sp ON sp.id = (l->>'store_product_id')::int
              ) AS lines
         FROM store_orders o
         JOIN stores s ON s.id = o.store_id
        WHERE ${where}
        ORDER BY o.created_at ASC
        LIMIT 200`,
      params,
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// PATCH /api/admin/store-orders/:id  { status }
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { status } = req.body ?? {};
    if (!STORE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STORE_ORDER_STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `UPDATE store_orders SET status = $1, updated_at = NOW()
        WHERE id = $2
       RETURNING id, store_id, status, updated_at`,
      [status, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
