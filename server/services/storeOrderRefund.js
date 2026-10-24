// Refunds on franchise store orders.
//
// The gap this closes: nothing subscribed to or handled charge.refunded, so
// refunding a store order in the Stripe dashboard left store_orders reading
// 'paid' and left the partner's ledger crediting them their full share of
// money the buyer had got back. The next payout run would have paid it out.
//
// Idempotency is the whole problem here. Stripe fires charge.refunded again
// for every additional partial refund, and each event carries the CUMULATIVE
// charge.amount_refunded rather than that refund's own amount — and webhooks
// retry. So the handler stores the cumulative figure and reverses only the
// difference between what the charge now says and what we already recorded.
// Replaying the same event is then a no-op, and three partial refunds post
// three correct deltas.

import pool from '../db.js';

/**
 * How much of a refund comes out of the store's share. Pure, so the money
 * arithmetic is testable without Stripe or a database.
 *
 * The rule: the store's earnings are reversed in proportion to how much of
 * the order's gross total the buyer got back. A full refund reverses the
 * store's share exactly; a half refund reverses half.
 *
 * This is an approximation for PARTIAL refunds, and deliberately a simple
 * one. Shipping, tax and extended-size upcharges are TSB's rather than the
 * store's, so a partial refund of, say, shipping alone arguably should not
 * touch the store at all. Modelling that would mean knowing which line a
 * refund belonged to, which Stripe does not tell us. Proportional is
 * predictable and explainable to a partner; where a specific case needs
 * different treatment, staff can post a store_ledger 'adjustment'.
 *
 * @param {object} order           store_orders row
 * @param {number} refundedCents   CUMULATIVE amount refunded on the charge
 * @returns {{ storeShareCents: number, deltaCents: number, fullyRefunded: boolean }}
 *          deltaCents is what is NEW since we last recorded — the amount to
 *          post to the ledger. Zero or negative means nothing to do.
 */
export function refundSplit(order, refundedCents) {
  const gross = Number(order.gross_total_cents) || 0;
  const storeEarnings = Number(order.store_earnings_cents) || 0;
  const alreadyRefunded = Number(order.refunded_cents) || 0;

  // Never reverse more than was charged, whatever Stripe reports.
  const cumulative = Math.max(0, Math.min(Math.round(refundedCents), gross || refundedCents));
  const fullyRefunded = gross > 0 && cumulative >= gross;

  // A full refund reverses the store's share exactly rather than via the
  // ratio, so a rounded fraction can never leave a cent credited on an
  // order that was entirely given back.
  const storeShareCents = fullyRefunded || gross === 0
    ? storeEarnings
    : Math.min(storeEarnings, Math.round(storeEarnings * (cumulative / gross)));

  const priorShare = gross > 0 && alreadyRefunded > 0
    ? (alreadyRefunded >= gross
        ? storeEarnings
        : Math.min(storeEarnings, Math.round(storeEarnings * (alreadyRefunded / gross))))
    : 0;

  return {
    storeShareCents,
    deltaCents: storeShareCents - priorShare,
    fullyRefunded,
    cumulativeCents: cumulative,
  };
}

/**
 * Apply a Stripe refund to the store order it belongs to.
 *
 * Never throws — a refund that fails to record must not take down the
 * webhook, and Stripe will retry. Returns what it did so the caller can log.
 *
 * @param {object} charge  Stripe Charge from charge.refunded
 * @param {object} deps    { findSessionId } — maps a payment intent to the
 *                         checkout session id we store as tsb_order_ref.
 *                         Injected so this is testable without Stripe.
 */
export async function applyStoreRefund(charge, { findSessionId }) {
  try {
    const paymentIntent = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
    if (!paymentIntent) return { applied: false, reason: 'no_payment_intent' };

    const sessionId = await findSessionId(paymentIntent);
    if (!sessionId) return { applied: false, reason: 'no_session' };

    const { rows } = await pool.query(
      `SELECT id, store_id, gross_total_cents, store_earnings_cents,
              refunded_cents, status
         FROM store_orders WHERE tsb_order_ref = $1`,
      [sessionId],
    );
    const order = rows[0];
    // Not a store order — quotes and gang sheets also check out through
    // Stripe and have no partner ledger to correct.
    if (!order) return { applied: false, reason: 'not_a_store_order' };

    const split = refundSplit(order, charge.amount_refunded ?? 0);

    if (split.cumulativeCents <= (Number(order.refunded_cents) || 0)) {
      // Replay of an event we have already recorded.
      return { applied: false, reason: 'already_recorded', order_id: order.id };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE store_orders
            SET refunded_cents = $1,
                refunded_at = COALESCE(refunded_at, NOW()),
                status = CASE WHEN $2 THEN 'refunded' ELSE status END,
                updated_at = NOW()
          WHERE id = $3`,
        [split.cumulativeCents, split.fullyRefunded, order.id],
      );

      // Negative 'sale' money, posted as its own entry rather than by
      // editing the original — the ledger is a history, not a balance.
      if (split.deltaCents > 0) {
        await client.query(
          `INSERT INTO store_ledger (store_id, entry_type, amount_cents, order_id, memo)
           VALUES ($1, 'refund', $2, $3, $4)`,
          [
            order.store_id,
            -split.deltaCents,
            order.id,
            `Refund on order ${order.id}`
              + (split.fullyRefunded ? ' (full)' : ` (partial — $${(split.cumulativeCents / 100).toFixed(2)} of $${(order.gross_total_cents / 100).toFixed(2)})`),
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(
      `[storeRefund] order ${order.id}: refunded ${split.cumulativeCents}c cumulative, `
      + `reversed ${split.deltaCents}c of store earnings`
      + (split.fullyRefunded ? ', marked refunded' : ''),
    );
    return { applied: true, order_id: order.id, ...split };
  } catch (err) {
    console.error('[storeRefund] failed:', err.message);
    return { applied: false, reason: 'error' };
  }
}
