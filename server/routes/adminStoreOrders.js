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
// Status ladder. These are the ONLY values store_orders_status_check
// permits — inventing in_production/ready/fulfilled here (2026-10-02)
// made every "Start printing" click fail against the constraint. The
// column is the contract:
//   paid → printing → shipped → delivered   (or refunded / cancelled)
import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getClient as easypostClient, FROM_ADDRESS } from './shipping.js';
import { parcelOunces } from '../lib/shippingRates.js';
import { sendStoreOrderShippedEmail } from '../services/email.js';

const router = Router();
router.use(authenticate, adminOnly);

export const STORE_ORDER_STATUSES = ['paid', 'printing', 'shipped', 'delivered', 'refunded', 'cancelled'];
/** Statuses that still need work from the shop. */
export const OPEN_STORE_ORDER_STATUSES = ['paid', 'printing'];

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
              o.buyer_name, o.buyer_phone, o.shipping_address,
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

// GET /api/admin/store-orders/:id — everything needed to pack and mail it.
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return next();
    const { rows } = await pool.query(
      `SELECT o.*, s.name AS store_name, s.slug AS store_slug,
              s.fulfillment_mode, s.pickup_location_json, s.brand_json,
              s.is_fundraiser, s.fundraiser_json,
              (SELECT json_agg(json_build_object(
                        'store_product_id', sp.id,
                        'title', sp.title,
                        'cover_image', sp.cover_image,
                        'qty', (l->>'qty')::int,
                        'variant', l->'variant',
                        'retail_cents', (l->>'retail_cents')::int,
                        'store_earnings_cents', (l->>'store_earnings_cents')::int))
                 FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines', '[]'::jsonb)) l
                 JOIN store_products sp ON sp.id = (l->>'store_product_id')::int
              ) AS lines
         FROM store_orders o
         JOIN stores s ON s.id = o.store_id
        WHERE o.id = $1`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/admin/store-orders/:id/rates
// Live EasyPost rates for this order, built from the address and blank
// weights we already hold — the operator shouldn't retype a parcel that
// the order fully describes.
router.post('/:id/rates', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query(
      `SELECT o.shipping_address, o.buyer_name,
              COALESCE((SELECT SUM(p.weight_oz * (l->>'qty')::int)
                          FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l
                          JOIN store_products sp ON sp.id = (l->>'store_product_id')::int
                          LEFT JOIN products p ON p.ss_id = sp.tsb_blank_ss_id), 0) AS garment_oz,
              COALESCE((SELECT SUM((l->>'qty')::int)
                          FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l), 1) AS units
         FROM store_orders o WHERE o.id = $1`,
      [id],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Store order not found' });
    const addr = order.shipping_address;
    if (!addr?.line1) {
      return res.status(409).json({ error: 'No shipping address on this order' });
    }

    // parcelOunces adds packaging; fall back to 6oz/garment when a blank
    // has no weight on file so a rate still comes back.
    const perUnit = Number(order.garment_oz) > 0
      ? Number(order.garment_oz) / Number(order.units)
      : 6;
    const weight = parcelOunces([{ weightOz: perUnit, qty: Number(order.units) }]);

    const client = easypostClient();
    const shipment = await client.Shipment.create({
      from_address: FROM_ADDRESS,
      to_address: {
        name: addr.name || order.buyer_name || 'Customer',
        street1: addr.line1,
        street2: addr.line2 || '',
        city: addr.city,
        state: addr.state,
        zip: addr.postal_code,
        country: addr.country || 'US',
        phone: addr.phone || '',
      },
      parcel: { length: 12, width: 10, height: 2, weight },
    });
    const rates = shipment.rates.map((r) => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rate: parseFloat(r.rate),
      deliveryDays: r.delivery_days,
    })).sort((a, b) => a.rate - b.rate);
    res.json({ shipmentId: shipment.id, weight_oz: weight, rates });
  } catch (err) { next(err); }
});

// PATCH /api/admin/store-orders/:id  { status, tracking_number?, tracking_carrier? }
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { status, tracking_number, tracking_carrier } = req.body ?? {};
    if (status !== undefined && !STORE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STORE_ORDER_STATUSES.join(', ')}` });
    }

    const sets = [];
    const params = [];
    const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (status !== undefined) push('status', status);
    if (tracking_number !== undefined) push('tracking_number', tracking_number || null);
    if (tracking_carrier !== undefined) push('tracking_carrier', tracking_carrier || null);
    // Shipped is the moment it left the building; a pickup order jumps
    // straight to delivered when the customer collects it.
    if (status === 'shipped' || status === 'delivered') {
      sets.push('shipped_at = COALESCE(shipped_at, NOW())');
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
    sets.push('updated_at = NOW()');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE store_orders SET ${sets.join(', ')}
        WHERE id = $${params.length}
       RETURNING id, store_id, status, tracking_number, tracking_carrier,
                 shipped_at, shipped_email_sent_at, buyer_email, updated_at`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Store order not found' });
    const order = rows[0];

    // Tell the buyer their order shipped — once. Deduped on
    // shipped_email_sent_at so re-marking fulfilled can't re-send, and
    // skipped entirely for a pickup order or one with no tracking yet.
    if (status === 'shipped' && order.tracking_number && !order.shipped_email_sent_at) {
      (async () => {
        try {
          const { rows: full } = await pool.query(
            `SELECT o.*, s.name AS store_name, s.slug AS store_slug,
                    (SELECT json_agg(json_build_object('title', sp.title, 'qty', (l->>'qty')::int,
                                                       'variant', l->'variant'))
                       FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l
                       JOIN store_products sp ON sp.id = (l->>'store_product_id')::int) AS lines
               FROM store_orders o JOIN stores s ON s.id = o.store_id
              WHERE o.id = $1`,
            [id],
          );
          if (!full[0]) return;
          await sendStoreOrderShippedEmail(full[0]);
          await pool.query(
            `UPDATE store_orders SET shipped_email_sent_at = NOW() WHERE id = $1`, [id],
          );
        } catch (err) {
          console.error('[adminStoreOrders] shipped email failed:', err.message);
        }
      })();
    }
    res.json(order);
  } catch (err) { next(err); }
});

export default router;
