// The Post Office — one place to mail everything TSB mails.
//
// Shipping was scattered: a tracking_number column on quotes, another on
// store_orders, a two-endpoint EasyPost helper used by one screen, and no
// record anywhere of the label itself — what it cost, whether it was
// refunded, where the parcel actually is. This router exposes the whole
// EasyPost surface we pay for, against a queue of everything waiting to
// go out:
//
//   GET  /queue                  what's waiting to ship, with addresses
//   POST /verify-address         USPS address verification + corrections
//   POST /rates                  live rates for a queue item or an address
//   POST /buy                    buy a label, record it, stamp the order
//   POST /buy-cheapest           same, for a whole selection at once
//   GET  /shipments              the postage ledger
//   POST /shipments/:id/refund   void a label
//   POST /refresh-tracking       pull tracker status for open parcels
//   POST /scan-form              one SCAN form for a day's handoff
//   GET/POST/DELETE /pickups     schedule a carrier pickup
import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getClient, FROM_ADDRESS } from './shipping.js';
import { parcelOunces, DEFAULT_ITEM_OZ } from '../lib/shippingRates.js';

const router = Router();
router.use(authenticate, adminOnly);

const dollarsToCents = (v) => Math.round(parseFloat(v || 0) * 100);

/** Quote and store-order addresses were written by different flows and
 *  disagree on key names (street1 vs address, zip vs postal_code). One
 *  shape goes to EasyPost. */
function normalizeAddress(raw, fallbackName) {
  if (!raw || typeof raw !== 'object') return null;
  const street1 = raw.street1 || raw.line1 || raw.address || raw.address1 || null;
  if (!street1) return null;
  return {
    name: raw.name || fallbackName || 'Customer',
    street1,
    street2: raw.street2 || raw.line2 || raw.address2 || '',
    city: raw.city || '',
    state: raw.state || '',
    zip: raw.zip || raw.postal_code || '',
    country: raw.country || 'US',
    phone: raw.phone || '',
  };
}

/** Everything the Post Office needs about one shippable thing. */
async function loadSubject(type, id) {
  if (type === 'store_order') {
    const { rows } = await pool.query(
      `SELECT o.id, o.buyer_email, o.buyer_name, o.shipping_address, o.fulfillment_type,
              s.name AS store_name,
              COALESCE((SELECT SUM(p.weight_oz * (l->>'qty')::int)
                          FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l
                          JOIN store_products sp ON sp.id = (l->>'store_product_id')::int
                          LEFT JOIN products p ON p.ss_id = sp.tsb_blank_ss_id), 0) AS garment_oz,
              COALESCE((SELECT SUM((l->>'qty')::int)
                          FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l), 1) AS units
         FROM store_orders o JOIN stores s ON s.id = o.store_id
        WHERE o.id = $1`,
      [id],
    );
    const o = rows[0];
    if (!o) return null;
    const perUnit = Number(o.garment_oz) > 0 ? Number(o.garment_oz) / Number(o.units) : DEFAULT_ITEM_OZ;
    return {
      type, id: o.id,
      label: `${o.store_name} order #${o.id}`,
      customer: o.buyer_name || o.buyer_email,
      email: o.buyer_email,
      address: normalizeAddress(o.shipping_address, o.buyer_name),
      weight_oz: parcelOunces([{ weightOz: perUnit, qty: Number(o.units) }]),
      units: Number(o.units),
    };
  }
  if (type === 'quote') {
    const { rows } = await pool.query(
      `SELECT id, customer_name, customer_email, product_name, quantity,
              shipping_address, shipping_method, status
         FROM quotes WHERE id = $1`,
      [id],
    );
    const q = rows[0];
    if (!q) return null;
    return {
      type, id: q.id,
      label: `Quote #${q.id} — ${q.product_name || 'Custom order'}`,
      customer: q.customer_name,
      email: q.customer_email,
      address: normalizeAddress(q.shipping_address, q.customer_name),
      // Quotes carry no per-item weight, so assume a mid-weight garment.
      weight_oz: parcelOunces([{ weightOz: null, qty: Number(q.quantity) || 1 }]),
      units: Number(q.quantity) || 1,
    };
  }
  return null;
}

/** Write the bought label back onto whatever it was bought for, so the
 *  order screens show tracking without consulting this table. */
async function stampSubject(type, id, { tracking, carrier }) {
  if (type === 'store_order') {
    await pool.query(
      `UPDATE store_orders SET tracking_number = $1, tracking_carrier = $2, updated_at = NOW() WHERE id = $3`,
      [tracking, carrier, id],
    );
  } else if (type === 'quote') {
    await pool.query(
      `UPDATE quotes SET tracking_number = $1, tracking_carrier = $2 WHERE id = $3`,
      [tracking, carrier, id],
    );
  }
}

// ── Queue ────────────────────────────────────────────────────────────
// Everything paid for, not yet labelled, and going in the mail.
router.get('/queue', async (req, res, next) => {
  try {
    const [storeRows, quoteRows] = await Promise.all([
      pool.query(
        `SELECT o.id, o.created_at, o.buyer_email, o.buyer_name, o.shipping_address,
                o.status, s.name AS store_name,
                COALESCE((SELECT SUM((l->>'qty')::int)
                            FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l), 1) AS units,
                (SELECT string_agg(sp.title, ' + ')
                   FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l
                   JOIN store_products sp ON sp.id = (l->>'store_product_id')::int) AS items
           FROM store_orders o JOIN stores s ON s.id = o.store_id
          WHERE o.status IN ('paid', 'printing')
            AND COALESCE(o.fulfillment_type, 'ship') <> 'pickup'
            AND o.tracking_number IS NULL
          ORDER BY o.created_at ASC`,
      ),
      pool.query(
        `SELECT id, created_at, customer_name, customer_email, shipping_address,
                product_name, quantity, status, date_needed
           FROM quotes
          WHERE archived_at IS NULL
            AND shipping_method = 'ship'
            AND tracking_number IS NULL
            AND status IN ('approved', 'in_production', 'ready')
          ORDER BY COALESCE(date_needed, created_at) ASC`,
      ),
    ]);

    const items = [
      ...storeRows.rows.map((o) => ({
        subject_type: 'store_order',
        subject_id: o.id,
        created_at: o.created_at,
        label: `${o.store_name} #${o.id}`,
        items: o.items || 'Store order',
        customer: o.buyer_name || o.buyer_email,
        email: o.buyer_email,
        qty: Number(o.units),
        status: o.status,
        address: normalizeAddress(o.shipping_address, o.buyer_name),
        due: null,
      })),
      ...quoteRows.rows.map((q) => ({
        subject_type: 'quote',
        subject_id: q.id,
        created_at: q.created_at,
        label: `Quote #${q.id}`,
        items: q.product_name || 'Custom order',
        customer: q.customer_name,
        email: q.customer_email,
        qty: Number(q.quantity) || 1,
        status: q.status,
        address: normalizeAddress(q.shipping_address, q.customer_name),
        due: q.date_needed,
      })),
    ];
    res.json({ items });
  } catch (err) { next(err); }
});

// ── Address verification ─────────────────────────────────────────────
// USPS-validated, with the corrected version returned so a typo'd street
// is fixed before a label is bought rather than after it bounces.
router.post('/verify-address', async (req, res, next) => {
  try {
    const addr = normalizeAddress(req.body?.address, req.body?.name);
    if (!addr) return res.status(400).json({ error: 'address with a street is required' });
    const client = getClient();
    const verified = await client.Address.createAndVerify({ ...addr, verify: ['delivery'] });
    res.json({
      verified: {
        name: verified.name, street1: verified.street1, street2: verified.street2,
        city: verified.city, state: verified.state, zip: verified.zip, country: verified.country,
      },
      messages: verified.verifications?.delivery?.errors ?? [],
      success: verified.verifications?.delivery?.success ?? null,
    });
  } catch (err) {
    // A failed verification is an answer, not a server error.
    res.status(200).json({ verified: null, success: false, messages: [err.message] });
  }
});

// ── Rates ────────────────────────────────────────────────────────────
// Three ways in, all the same endpoint:
//   1. a queue item — address and weight from our own data;
//   2. a queue item PLUS weight_oz/length/width/height — the scale and
//      the box on the bench beat anything derived from a blank's spec;
//   3. a free-typed address — the one-off labels a shop always needs,
//      with no order behind them.
router.post('/rates', async (req, res, next) => {
  try {
    const { subject_type, subject_id, address, weight_oz, length, width, height } = req.body ?? {};
    let to = normalizeAddress(address);
    let weight = Number(weight_oz) || 0;

    if (subject_type && subject_id) {
      const subject = await loadSubject(subject_type, Number(subject_id));
      if (!subject) return res.status(404).json({ error: 'Not found' });
      if (!subject.address) return res.status(409).json({ error: 'No shipping address on this order' });
      to = to || subject.address;
      weight = weight || subject.weight_oz;
    }
    if (!to) return res.status(400).json({ error: 'address or subject required' });
    if (!weight) weight = DEFAULT_ITEM_OZ + 4;

    const client = getClient();
    const shipment = await client.Shipment.create({
      from_address: FROM_ADDRESS,
      to_address: to,
      parcel: {
        length: Number(length) || 12,
        width: Number(width) || 10,
        height: Number(height) || 2,
        weight,
      },
    });
    res.json({
      shipmentId: shipment.id,
      weight_oz: weight,
      to,
      rates: (shipment.rates || []).map((r) => ({
        id: r.id,
        carrier: r.carrier,
        service: r.service,
        rate: parseFloat(r.rate),
        deliveryDays: r.delivery_days,
      })).sort((a, b) => a.rate - b.rate),
    });
  } catch (err) { next(err); }
});

/** Buy one label and record it. Shared by /buy and /buy-cheapest. */
async function purchase({ shipmentId, rateId, subjectType, subjectId, insuranceDollars, userId, subject, reference }) {
  const client = getClient();
  const bought = await client.Shipment.buy(shipmentId, rateId);

  let insured = 0;
  if (insuranceDollars > 0) {
    try {
      await client.Shipment.insure(bought.id, insuranceDollars);
      insured = Math.round(insuranceDollars * 100);
    } catch (err) {
      console.error('[postOffice] insurance failed (label still bought):', err.message);
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO shipments
       (subject_type, subject_id, easypost_shipment_id, tracking_code, carrier, service,
        rate_cents, insurance_cents, label_url, tracker_id, tracking_status,
        est_delivery_date, to_name, to_address, weight_oz, created_by, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)
     ON CONFLICT (easypost_shipment_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [
      subjectType, subjectId || null, bought.id, bought.tracking_code,
      bought.selected_rate?.carrier ?? null, bought.selected_rate?.service ?? null,
      dollarsToCents(bought.selected_rate?.rate), insured,
      bought.postage_label?.label_url ?? null, bought.tracker?.id ?? null,
      bought.tracker?.status ?? 'pre_transit',
      bought.tracker?.est_delivery_date ?? null,
      bought.to_address?.name ?? subject?.customer ?? null,
      JSON.stringify(bought.to_address ?? subject?.address ?? {}),
      bought.parcel?.weight ?? null, userId ?? null,
      reference || subject?.label || null,
    ],
  );
  if (subjectType && subjectId) {
    await stampSubject(subjectType, Number(subjectId), {
      tracking: bought.tracking_code,
      carrier: bought.selected_rate?.carrier ?? null,
    });
  }
  return rows[0];
}

// POST /buy { shipmentId, rateId, subject_type?, subject_id?, insurance? }
router.post('/buy', async (req, res, next) => {
  try {
    const { shipmentId, rateId, subject_type, subject_id, insurance, reference } = req.body ?? {};
    if (!shipmentId || !rateId) return res.status(400).json({ error: 'shipmentId and rateId required' });
    const subject = subject_type && subject_id ? await loadSubject(subject_type, Number(subject_id)) : null;
    const shipment = await purchase({
      shipmentId, rateId,
      subjectType: subject_type || 'manual',
      subjectId: subject_id ? Number(subject_id) : null,
      insuranceDollars: Number(insurance) || 0,
      userId: req.user?.id, subject,
      reference: reference ? String(reference).slice(0, 200) : null,
    });
    res.json(shipment);
  } catch (err) { next(err); }
});

// POST /buy-cheapest { items: [{subject_type, subject_id}], carrier?, service? }
// The bulk button: rate and buy every selected order in one pass, cheapest
// first. One failure never stops the rest — the response reports each.
router.post('/buy-cheapest', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (items.length === 0) return res.status(400).json({ error: 'items required' });
    const carrierFilter = req.body?.carrier ? String(req.body.carrier).toLowerCase() : null;
    const client = getClient();

    const results = [];
    for (const it of items) {
      const subjectType = String(it.subject_type || '');
      const subjectId = Number(it.subject_id);
      try {
        const subject = await loadSubject(subjectType, subjectId);
        if (!subject) throw new Error('not found');
        if (!subject.address) throw new Error('no shipping address');
        const shipment = await client.Shipment.create({
          from_address: FROM_ADDRESS,
          to_address: subject.address,
          parcel: { length: 12, width: 10, height: 2, weight: subject.weight_oz },
        });
        const rates = (shipment.rates || [])
          .filter((r) => !carrierFilter || String(r.carrier).toLowerCase() === carrierFilter)
          .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
        if (rates.length === 0) throw new Error('no rates available');
        const row = await purchase({
          shipmentId: shipment.id, rateId: rates[0].id,
          subjectType, subjectId,
          insuranceDollars: 0, userId: req.user?.id, subject,
        });
        results.push({ subject_type: subjectType, subject_id: subjectId, ok: true, shipment: row });
      } catch (err) {
        results.push({ subject_type: subjectType, subject_id: subjectId, ok: false, error: err.message });
      }
    }
    res.json({ results, bought: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  } catch (err) { next(err); }
});

// ── The postage ledger ───────────────────────────────────────────────
router.get('/shipments', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const params = [];
    let where = '1=1';
    if (status === 'open') {
      where = `s.status = 'purchased' AND COALESCE(s.tracking_status, '') <> 'delivered'`;
    } else if (status && status !== 'all') {
      params.push(status);
      where = `s.status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT s.*,
              CASE s.subject_type
                WHEN 'store_order' THEN (SELECT st.name || ' #' || so.id
                                           FROM store_orders so JOIN stores st ON st.id = so.store_id
                                          WHERE so.id = s.subject_id)
                WHEN 'quote' THEN (SELECT 'Quote #' || q.id FROM quotes q WHERE q.id = s.subject_id)
                ELSE 'One-off label'
              END AS subject_label
         FROM shipments s
        WHERE ${where}
        ORDER BY s.created_at DESC
        LIMIT 200`,
      params,
    );
    const totals = await pool.query(
      `SELECT COALESCE(SUM(rate_cents), 0)::int AS spent_cents,
              COUNT(*) FILTER (WHERE status = 'purchased')::int AS live,
              COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded
         FROM shipments WHERE created_at >= date_trunc('month', NOW())`,
    );
    res.json({ shipments: rows, month: totals.rows[0] });
  } catch (err) { next(err); }
});

// POST /shipments/:id/refund — void an unused label.
router.post('/shipments/:id/refund', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [id]);
    const shipment = rows[0];
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    const client = getClient();
    const refunded = await client.Shipment.refund(shipment.easypost_shipment_id);
    const refundStatus = refunded.refund_status || 'submitted';
    const { rows: updated } = await pool.query(
      `UPDATE shipments
          SET refund_status = $1,
              status = CASE WHEN $1 IN ('refunded', 'submitted') THEN 'refund_requested' ELSE status END,
              updated_at = NOW()
        WHERE id = $2 RETURNING *`,
      [refundStatus, id],
    );
    // Drop the tracking from the order so it returns to the queue.
    if (shipment.subject_type && shipment.subject_id) {
      await stampSubject(shipment.subject_type, shipment.subject_id, { tracking: null, carrier: null });
    }
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// POST /refresh-tracking — pull current status for every live parcel.
router.post('/refresh-tracking', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tracker_id, tracking_code FROM shipments
        WHERE status = 'purchased' AND COALESCE(tracking_status,'') <> 'delivered'
        ORDER BY created_at DESC LIMIT 100`,
    );
    const client = getClient();
    let updated = 0;
    for (const s of rows) {
      try {
        const tracker = s.tracker_id
          ? await client.Tracker.retrieve(s.tracker_id)
          : await client.Tracker.create({ tracking_code: s.tracking_code });
        const detail = tracker.tracking_details?.[tracker.tracking_details.length - 1];
        await pool.query(
          `UPDATE shipments
              SET tracker_id = COALESCE(tracker_id, $2),
                  tracking_status = $3,
                  tracking_detail = $4,
                  est_delivery_date = COALESCE($5, est_delivery_date),
                  delivered_at = CASE WHEN $3 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                  updated_at = NOW()
            WHERE id = $1`,
          [s.id, tracker.id, tracker.status || null,
           detail ? `${detail.message || ''}${detail.tracking_location?.city ? ` — ${detail.tracking_location.city}, ${detail.tracking_location.state}` : ''}` : null,
           tracker.est_delivery_date || null],
        );
        updated += 1;
      } catch (err) {
        console.error(`[postOffice] tracker ${s.tracking_code} failed:`, err.message);
      }
    }
    res.json({ checked: rows.length, updated });
  } catch (err) { next(err); }
});

// POST /scan-form { shipment_ids } — the single sheet the carrier scans
// at handoff instead of scanning every parcel.
router.post('/scan-form', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.shipment_ids) ? req.body.shipment_ids.map(Number).filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'shipment_ids required' });
    const { rows } = await pool.query(
      `SELECT id, easypost_shipment_id FROM shipments
        WHERE id = ANY($1) AND status = 'purchased' AND scan_form_id IS NULL`,
      [ids],
    );
    if (rows.length === 0) return res.status(409).json({ error: 'Nothing eligible — already on a form, or refunded' });
    const client = getClient();
    const form = await client.ScanForm.create({
      shipments: rows.map((r) => ({ id: r.easypost_shipment_id })),
    });
    await pool.query(
      `UPDATE shipments SET scan_form_id = $1, scan_form_url = $2, updated_at = NOW() WHERE id = ANY($3)`,
      [form.id, form.form_url ?? null, rows.map((r) => r.id)],
    );
    res.json({ id: form.id, url: form.form_url, shipments: rows.length });
  } catch (err) { next(err); }
});

// ── Pickups ──────────────────────────────────────────────────────────
router.get('/pickups', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shipment_pickups ORDER BY created_at DESC LIMIT 25`,
    );
    res.json({ pickups: rows });
  } catch (err) { next(err); }
});

// POST /pickups { shipment_ids, min_datetime, max_datetime, instructions? }
// Rates the pickup and buys the cheapest — a shop wants the truck to come,
// not a menu of ways for it to come.
router.post('/pickups', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.shipment_ids) ? req.body.shipment_ids.map(Number).filter(Boolean) : [];
    const { min_datetime, max_datetime, instructions } = req.body ?? {};
    if (ids.length === 0) return res.status(400).json({ error: 'shipment_ids required' });
    if (!min_datetime || !max_datetime) return res.status(400).json({ error: 'min_datetime and max_datetime required' });

    const { rows } = await pool.query(
      `SELECT id, easypost_shipment_id FROM shipments WHERE id = ANY($1) AND status = 'purchased'`,
      [ids],
    );
    if (rows.length === 0) return res.status(409).json({ error: 'No live labels in that selection' });

    const client = getClient();
    const pickup = await client.Pickup.create({
      address: FROM_ADDRESS,
      shipment: { id: rows[0].easypost_shipment_id },
      reference: `TSB pickup ${rows.length} parcel${rows.length === 1 ? '' : 's'}`,
      min_datetime, max_datetime,
      instructions: instructions || 'Parcels at the front counter.',
      is_account_address: true,
    });
    const rates = (pickup.pickup_rates || []).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
    if (rates.length === 0) return res.status(409).json({ error: 'No carrier offered a pickup for that window' });
    const bought = await client.Pickup.buy(pickup.id, rates[0].carrier, rates[0].service);

    const { rows: saved } = await pool.query(
      `INSERT INTO shipment_pickups
         (easypost_pickup_id, carrier, service, rate_cents, min_datetime, max_datetime,
          status, confirmation, shipment_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [bought.id, bought.carrier ?? rates[0].carrier, bought.service ?? rates[0].service,
       dollarsToCents(rates[0].rate), min_datetime, max_datetime,
       bought.status ?? 'scheduled', bought.confirmation ?? null, rows.map((r) => r.id)],
    );
    res.json(saved[0]);
  } catch (err) { next(err); }
});

router.post('/pickups/:id/cancel', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(`SELECT * FROM shipment_pickups WHERE id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pickup not found' });
    const client = getClient();
    const cancelled = await client.Pickup.cancel(rows[0].easypost_pickup_id);
    const { rows: updated } = await pool.query(
      `UPDATE shipment_pickups SET status = $1 WHERE id = $2 RETURNING *`,
      [cancelled.status || 'canceled', id],
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

export default router;
