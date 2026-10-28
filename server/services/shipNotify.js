// "Your order shipped" — one way in, for every path that can set tracking.
//
// Why this exists: tracking lands on an order from three places —
//   1. POST /api/shipping/buy          (EasyPost, one label at a time)
//   2. POST /api/post-office/...       (the bulk label queue)
//   3. POST /api/quotes/admin/:id/fulfill, PATCH /api/admin/store-orders/:id
// Only (3) emailed anyone. Buying a label through (1) or (2) recorded the
// tracking number and told the customer nothing, so whether a buyer heard
// from us depended on which screen the label was bought from.
//
// Three rules this module enforces, which is the reason it's a module and
// not a copy-pasted block:
//
//   * Read tracking from the DB, never from the caller. The fulfill
//     endpoint used to email whatever was in the request body, so an admin
//     who bought the label first and then clicked Fulfill (the normal
//     order of operations) sent a shipped email with no tracking number in
//     it at all.
//   * Send once. Deduped on shipped_email_sent_at, claimed with a
//     conditional UPDATE so two concurrent callers can't both win.
//   * Never send without a tracking number, and never for a pickup order.
//     An email that says "on its way" with nothing to click is worse than
//     no email.

import pool from '../db.js';
import { sendStoreOrderShippedEmail, sendOrderShippedToCustomer, quoteLang } from './email.js';

/**
 * Should this row get a shipped email? Pure, so the decision is testable
 * without a database or an outbound send.
 *
 * @returns {{ send: boolean, reason: string }}
 */
export function shippedEmailDecision(row, { force = false } = {}) {
  if (!row) return { send: false, reason: 'not_found' };
  if (!row.email) return { send: false, reason: 'no_email' };
  // 'pickup' orders are collected in Fairburn — nothing ships, so a
  // tracking email would be nonsense.
  if (row.fulfillment_type === 'pickup' || row.fulfillment_method === 'pickup') {
    return { send: false, reason: 'pickup' };
  }
  if (!row.tracking_number) return { send: false, reason: 'no_tracking' };
  if (row.shipped_email_sent_at && !force) return { send: false, reason: 'already_sent' };
  return { send: true, reason: force && row.shipped_email_sent_at ? 'resend_forced' : 'ok' };
}

const SUBJECTS = {
  store_order: {
    table: 'store_orders',
    // Enough to decide; the full payload is loaded only if we're sending.
    probe: `SELECT o.id, o.buyer_email AS email, o.tracking_number,
                   o.shipped_email_sent_at, o.fulfillment_type
              FROM store_orders o WHERE o.id = $1`,
  },
  quote: {
    table: 'quotes',
    probe: `SELECT id, customer_email AS email, tracking_number,
                   shipped_email_sent_at, fulfillment_method
              FROM quotes WHERE id = $1`,
  },
};

/**
 * Email the customer their tracking, at most once.
 *
 * Safe to call from anywhere that might have just set a tracking number,
 * including twice for the same order and including when nothing shipped —
 * it decides for itself and reports what it did.
 *
 * Never throws: a notification must not fail the label purchase or the
 * status change that triggered it. A customer with no email beats a
 * label that didn't get bought.
 *
 * @param {'store_order'|'quote'} kind
 * @param {number} id
 * @param {{ force?: boolean }} [opts] force re-sends an already-sent notice
 * @returns {Promise<{ sent: boolean, reason: string }>}
 */
export async function notifyShipped(kind, id, { force = false } = {}) {
  const subject = SUBJECTS[kind];
  if (!subject) return { sent: false, reason: 'unknown_kind' };

  try {
    const { rows } = await pool.query(subject.probe, [id]);
    const decision = shippedEmailDecision(rows[0], { force });
    if (!decision.send) return { sent: false, reason: decision.reason };

    // Claim the send before doing it. Two label purchases racing on the
    // same order both pass the check above; only one wins this UPDATE, so
    // only one email goes out. Stamping first means a send that throws
    // won't retry on its own — deliberate, since the alternative is a
    // customer getting the same notice on every retry.
    const claim = await pool.query(
      `UPDATE ${subject.table}
          SET shipped_email_sent_at = NOW()
        WHERE id = $1 ${force ? '' : 'AND shipped_email_sent_at IS NULL'}
        RETURNING id`,
      [id],
    );
    if (!claim.rows[0]) return { sent: false, reason: 'already_sent' };

    if (kind === 'store_order') {
      const { rows: full } = await pool.query(
        `SELECT o.*, s.name AS store_name, s.slug AS store_slug,
                (SELECT json_agg(json_build_object('title', sp.title,
                                                   'qty', (l->>'qty')::int,
                                                   'variant', l->'variant'))
                   FROM jsonb_array_elements(COALESCE(o.split_snapshot_json->'lines','[]'::jsonb)) l
                   JOIN store_products sp ON sp.id = (l->>'store_product_id')::int) AS lines
           FROM store_orders o JOIN stores s ON s.id = o.store_id
          WHERE o.id = $1`,
        [id],
      );
      if (!full[0]) return { sent: false, reason: 'not_found' };
      await sendStoreOrderShippedEmail(full[0]);
    } else {
      const { rows: full } = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
      const quote = full[0];
      if (!quote) return { sent: false, reason: 'not_found' };
      // Tracking comes off the row, so a label bought before Fulfill was
      // clicked still reaches the customer.
      await sendOrderShippedToCustomer(
        quote,
        { carrier: quote.tracking_carrier, trackingNumber: quote.tracking_number },
        quoteLang(quote),
      );
    }

    console.log(`[shipNotify] ${kind} ${id}: shipped email sent`);
    return { sent: true, reason: 'ok' };
  } catch (err) {
    console.error(`[shipNotify] ${kind} ${id} failed:`, err.message);
    return { sent: false, reason: 'error' };
  }
}
