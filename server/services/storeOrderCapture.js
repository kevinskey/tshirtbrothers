// Franchise store order capture — runs when a checkout.session.completed
// event arrives with metadata.store_id set. Idempotent: safe to call
// multiple times for the same session id (Stripe retries webhooks).
//
// Flow:
//   1. Idempotency check on store_orders.tsb_order_ref = session.id
//   2. Load store_product + active_agreement (agreement is frozen at
//      publish time on the product)
//   3. Compute split per line using the frozen agreement's fee_config
//   4. INSERT store_orders (frozen split_snapshot_json) +
//      store_ledger credit inside a single transaction
//   5. Fire order.created outbound webhook via dispatchStoreEvent —
//      fire-and-forget, delivery failure never fails the capture
//
// Shipping + tax handling: for MVP, both are absorbed by TSB (single line
// = retail × qty, no shipping/tax collected via Stripe here). When
// shipping_options / tax collection get wired up, the shipping/tax
// amounts land wholly in tsb_earnings and split_snapshot_json records
// them separately from the sale amount.

import Stripe from 'stripe';
import pool from '../db.js';
import { dispatchStoreEvent } from './storeWebhookDispatcher.js';

let _stripe = null;
function stripeClient() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// When the session carried checkout upsells (metadata.upsell_map maps
// Stripe price id → store_product_id), pull the real line items to learn
// which upsells the buyer added and at what quantity. Returns [] on any
// failure — the main product line still captures.
async function fetchUpsellLines(session) {
  const map = tryParseJson(session.metadata?.upsell_map || '');
  const stripe = stripeClient();
  if (!map || !stripe) return [];
  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
    return items.data
      .filter((li) => li.price?.id && map[li.price.id] != null && (li.quantity ?? 0) > 0)
      .map((li) => ({
        store_product_id: parseInt(String(map[li.price.id]), 10),
        qty: li.quantity ?? 1,
      }))
      .filter((l) => Number.isInteger(l.store_product_id));
  } catch (err) {
    console.error('[captureStoreOrder] listLineItems failed (capturing main line only):', err.message);
    return [];
  }
}

/** Compute per-line split. Returns { tsb_earnings_cents, store_earnings_cents }. */
export function computeLineSplit({ retail_cents, qty, fee_config }) {
  const line_retail = retail_cents * qty;
  const percent = Number(fee_config?.percent_of_retail ?? 0);
  const min_per_item = Number(fee_config?.min_per_item_cents ?? 0);

  const percent_take = Math.round(line_retail * percent / 100);
  const min_take     = min_per_item * qty;
  const tsb_earnings = Math.max(percent_take, min_take);
  const store_earnings = line_retail - tsb_earnings;
  return {
    tsb_earnings_cents: tsb_earnings,
    store_earnings_cents: store_earnings,
    fee_percent: percent,
    fee_min_per_item_cents: min_per_item,
  };
}

/**
 * Capture a completed Stripe Checkout Session as a franchise store order.
 * Called from routes/payments.js webhook handler when the session has
 * metadata.store_id.
 *
 * @param {object} session Stripe Checkout Session (as delivered by the webhook)
 */
export async function captureStoreOrder(session) {
  const storeId       = parseInt(session.metadata?.store_id, 10);
  const storeProductId = parseInt(session.metadata?.store_product_id, 10);
  const qty            = parseInt(session.metadata?.qty || '1', 10);
  const variantRaw     = session.metadata?.variant || null;
  const buyerEmail     = session.customer_details?.email || session.customer_email || 'unknown';

  if (!storeId || !storeProductId) {
    console.error('[captureStoreOrder] missing store_id / store_product_id in metadata', session.id);
    return;
  }

  // ── 1. Idempotency check ────────────────────────────────────────────────
  const existing = await pool.query(
    `SELECT id FROM store_orders WHERE tsb_order_ref = $1`,
    [session.id],
  );
  if (existing.rows[0]) {
    console.log(`[captureStoreOrder] session ${session.id} already captured as order ${existing.rows[0].id}`);
    return;
  }

  // ── 2. Load product + frozen agreement ──────────────────────────────────
  const productRes = await pool.query(
    `SELECT sp.id, sp.store_id, sp.retail_price_cents, sp.campaign_ref,
            sa.id AS agreement_id, sa.fee_config_json
       FROM store_products sp
       JOIN store_agreements sa ON sa.id = sp.active_agreement_id
      WHERE sp.id = $1 AND sp.store_id = $2`,
    [storeProductId, storeId],
  );
  const product = productRes.rows[0];
  if (!product) {
    console.error(`[captureStoreOrder] product ${storeProductId} for store ${storeId} not found`);
    return;
  }

  const split = computeLineSplit({
    retail_cents: product.retail_price_cents,
    qty,
    fee_config: product.fee_config_json,
  });

  const lines = [
    {
      store_product_id: storeProductId,
      qty,
      variant: variantRaw ? tryParseJson(variantRaw) : null,
      retail_cents: product.retail_price_cents,
      line_retail_cents: product.retail_price_cents * qty,
      store_earnings_cents: split.store_earnings_cents,
      tsb_earnings_cents: split.tsb_earnings_cents,
    },
  ];

  // Checkout upsells the buyer added on the Stripe page. Same frozen
  // agreement (same store) applies.
  for (const up of await fetchUpsellLines(session)) {
    const upRes = await pool.query(
      `SELECT id, retail_price_cents FROM store_products WHERE id = $1 AND store_id = $2`,
      [up.store_product_id, storeId],
    );
    const upProduct = upRes.rows[0];
    if (!upProduct) continue;
    const upSplit = computeLineSplit({
      retail_cents: upProduct.retail_price_cents,
      qty: up.qty,
      fee_config: product.fee_config_json,
    });
    lines.push({
      store_product_id: upProduct.id,
      qty: up.qty,
      variant: null,
      retail_cents: upProduct.retail_price_cents,
      line_retail_cents: upProduct.retail_price_cents * up.qty,
      store_earnings_cents: upSplit.store_earnings_cents,
      tsb_earnings_cents: upSplit.tsb_earnings_cents,
    });
  }

  const subtotal_cents  = lines.reduce((s, l) => s + l.line_retail_cents, 0);
  const store_earnings_total = lines.reduce((s, l) => s + l.store_earnings_cents, 0);
  const tsb_earnings_total   = lines.reduce((s, l) => s + l.tsb_earnings_cents, 0);
  const shipping_cents  = session.shipping_cost?.amount_total || 0;
  const tax_cents       = session.total_details?.amount_tax || 0;
  const gross_total     = session.amount_total ?? (subtotal_cents + shipping_cents + tax_cents);

  const split_snapshot = {
    agreement_id: product.agreement_id,
    fee_percent: split.fee_percent,
    fee_min_per_item_cents: split.fee_min_per_item_cents,
    lines,
    // Shipping + tax land in TSB's earnings — TSB collects and remits.
    shipping_cents,
    tax_cents,
    shipping_to_tsb: shipping_cents,
    tax_to_tsb: tax_cents,
  };

  // ── 3. Insert order + ledger credit atomically ──────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      `INSERT INTO store_orders
         (store_id, tsb_order_ref, buyer_email,
          subtotal_cents, shipping_cents, tax_cents, gross_total_cents,
          split_snapshot_json, store_earnings_cents, tsb_earnings_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'paid')
       RETURNING id, created_at`,
      [
        storeId, session.id, buyerEmail,
        subtotal_cents, shipping_cents, tax_cents, gross_total,
        split_snapshot, store_earnings_total,
        tsb_earnings_total + shipping_cents + tax_cents,
      ],
    );
    const orderId = orderRes.rows[0].id;

    await client.query(
      `INSERT INTO store_ledger (store_id, entry_type, amount_cents, order_id, memo)
       VALUES ($1, 'sale', $2, $3, $4)`,
      [
        storeId,
        store_earnings_total,
        orderId,
        `Sale: ${lines.map((l) => `store_product ${l.store_product_id} × ${l.qty}`).join(', ')}`,
      ],
    );
    await client.query('COMMIT');

    // ── 4. Fire outbound webhook (fire-and-forget) ────────────────────────
    dispatchStoreEvent(storeId, 'order.created', {
      order_id: orderId,
      tsb_order_ref: session.id,
      buyer_email: buyerEmail,
      subtotal_cents,
      shipping_cents,
      tax_cents,
      gross_total_cents: gross_total,
      store_earnings_cents: store_earnings_total,
      lines: split_snapshot.lines,
      status: 'paid',
    }).catch((err) => {
      console.error('[captureStoreOrder] webhook dispatch error:', err);
    });

    console.log(
      `[captureStoreOrder] captured order ${orderId} for store ${storeId}: ` +
      `store earns ${store_earnings_total}¢, TSB earns ${tsb_earnings_total + shipping_cents + tax_cents}¢`
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[captureStoreOrder] insert failed for session ${session.id}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

function tryParseJson(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}
