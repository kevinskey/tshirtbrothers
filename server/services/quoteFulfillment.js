// How is this order actually getting to the customer?
//
// Why this exists: `quotes.fulfillment_method` is binary — 'ship' or
// nothing, where nothing means pickup. Local courier delivery has no slot,
// so the shop records it the only way the editor allows: a fee line called
// "Courier/Delivery Fee". Nothing connects that line to the fulfillment
// method, so the quote stays 'pickup' and every downstream email says so.
//
// Quote #293 (2026-11-04): Cheryl paid $504 of shirts + a $35
// Courier/Delivery Fee, and the balance-paid notice told the shop
// "PICKUP at the shop · Hand it over and hit Mark Picked Up" on an order
// she had paid us to drive to her.
//
// Until fulfillment_method grows a third value (which means touching
// /fulfill, shipNotify, and the packing slip), a paid delivery fee IS the
// record of a delivery, and this module is the one place that says so.

import pool from '../db.js';

// Deliberately loose: an admin types this label by hand, so match the
// words rather than one exact string. 'ship'/'shipping' is NOT here —
// that's the carrier path, decided by fulfillment_method.
const DELIVERY_FEE_RE = /courier|delivery|deliver\b|drop[\s-]?off/i;

/** Does this item list contain a fee line the customer paid to be driven to? */
export function hasDeliveryFee(items) {
  return (Array.isArray(items) ? items : []).some(
    (it) => it
      && String(it.item_type || '') === 'fee'
      && DELIVERY_FEE_RE.test(String(it.product_name || '')),
  );
}

/**
 * Pure, so the rule is testable without a database.
 * @returns {'ship'|'delivery'|'pickup'}
 */
export function fulfillmentMode(quote, items = []) {
  if (!quote) return 'pickup';
  // An explicit carrier choice always wins — someone picked it on purpose.
  if (quote.fulfillment_method === 'ship' || quote.shipping_method === 'shipping') return 'ship';
  if (hasDeliveryFee(items)) return 'delivery';
  return 'pickup';
}

/**
 * Same decision, fetching the fee lines when the caller doesn't have them.
 * Falls back to the quote's own fields if the lookup fails — a fulfillment
 * label is never worth failing a send over.
 */
export async function resolveFulfillmentMode(quote) {
  if (!quote?.id) return fulfillmentMode(quote, []);
  if (Array.isArray(quote.items)) return fulfillmentMode(quote, quote.items);
  try {
    const { rows } = await pool.query(
      'SELECT product_name, item_type FROM quote_items WHERE quote_id = $1',
      [quote.id],
    );
    return fulfillmentMode(quote, rows);
  } catch (err) {
    console.error('[quoteFulfillment] item lookup failed:', err.message);
    return fulfillmentMode(quote, []);
  }
}
