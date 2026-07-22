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

import pool from '../db.js';
import { dispatchStoreEvent } from './storeWebhookDispatcher.js';

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

  const subtotal_cents  = product.retail_price_cents * qty;
  const shipping_cents  = session.shipping_cost?.amount_total || 0;
  const tax_cents       = session.total_details?.amount_tax || 0;
  const gross_total     = session.amount_total ?? (subtotal_cents + shipping_cents + tax_cents);

  const split_snapshot = {
    agreement_id: product.agreement_id,
    fee_percent: split.fee_percent,
    fee_min_per_item_cents: split.fee_min_per_item_cents,
    lines: [
      {
        store_product_id: storeProductId,
        qty,
        variant: variantRaw ? tryParseJson(variantRaw) : null,
        retail_cents: product.retail_price_cents,
        line_retail_cents: subtotal_cents,
        store_earnings_cents: split.store_earnings_cents,
        tsb_earnings_cents: split.tsb_earnings_cents,
      },
    ],
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
        split_snapshot, split.store_earnings_cents,
        split.tsb_earnings_cents + shipping_cents + tax_cents,
      ],
    );
    const orderId = orderRes.rows[0].id;

    await client.query(
      `INSERT INTO store_ledger (store_id, entry_type, amount_cents, order_id, memo)
       VALUES ($1, 'sale', $2, $3, $4)`,
      [
        storeId,
        split.store_earnings_cents,
        orderId,
        `Sale: store_product ${storeProductId} × ${qty}`,
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
      store_earnings_cents: split.store_earnings_cents,
      lines: split_snapshot.lines,
      status: 'paid',
    }).catch((err) => {
      console.error('[captureStoreOrder] webhook dispatch error:', err);
    });

    console.log(
      `[captureStoreOrder] captured order ${orderId} for store ${storeId}: ` +
      `store earns ${split.store_earnings_cents}¢, TSB earns ${split.tsb_earnings_cents + shipping_cents + tax_cents}¢`
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
