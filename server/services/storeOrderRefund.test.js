// How much of a refund comes out of a partner's earnings.
//
// Two failure modes this guards: paying a partner their share of money the
// buyer got back, and clawing back the same refund twice because Stripe
// resent the event. Both are real money moving the wrong way, and neither
// is visible until a payout run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refundSplit } from './storeOrderRefund.js';

// A $124.99 joggers set at Leora's 20%: $25.00 hers, plus $6.95 shipping
// that is TSB's, so gross is $131.94.
const order = {
  gross_total_cents: 13194,
  store_earnings_cents: 2500,
  refunded_cents: 0,
};

test('a full refund reverses the store share exactly', () => {
  const r = refundSplit(order, 13194);
  assert.equal(r.fullyRefunded, true);
  assert.equal(r.storeShareCents, 2500);
  assert.equal(r.deltaCents, 2500);
});

test('a full refund never leaves a stray cent credited', () => {
  // Deliberately awkward numbers: a proportional calculation here rounds to
  // 2499, which would leave a cent with the partner on a fully refunded
  // order. Full refunds bypass the ratio for exactly this reason.
  const odd = { gross_total_cents: 9999, store_earnings_cents: 3333, refunded_cents: 0 };
  const r = refundSplit(odd, 9999);
  assert.equal(r.storeShareCents, 3333);
  assert.equal(r.deltaCents, 3333);
});

test('a partial refund reverses proportionally', () => {
  // Half the order back → half the store's share reversed.
  const r = refundSplit(order, 6597);
  assert.equal(r.fullyRefunded, false);
  assert.equal(r.storeShareCents, 1250);
  assert.equal(r.deltaCents, 1250);
});

test('replaying the same event posts nothing — Stripe retries webhooks', () => {
  const alreadyDone = { ...order, refunded_cents: 13194 };
  const r = refundSplit(alreadyDone, 13194);
  assert.equal(r.deltaCents, 0, 'a replay must not claw back twice');
});

test('successive partial refunds each post only what is new', () => {
  // Stripe sends the CUMULATIVE amount_refunded every time, not the delta.
  const first = refundSplit(order, 3000);
  assert.equal(first.deltaCents, first.storeShareCents);

  const second = refundSplit({ ...order, refunded_cents: 3000 }, 6000);
  assert.equal(second.storeShareCents, Math.round(2500 * 6000 / 13194));
  assert.equal(second.deltaCents, second.storeShareCents - first.storeShareCents);

  // The three deltas must sum to the full reversal, with nothing lost or
  // double-counted to rounding.
  const third = refundSplit({ ...order, refunded_cents: 6000 }, 13194);
  assert.equal(first.deltaCents + second.deltaCents + third.deltaCents, 2500);
});

test('the reversal never exceeds what the store earned', () => {
  // A refund larger than the charge should not invent partner debt.
  const r = refundSplit(order, 999999);
  assert.equal(r.storeShareCents, 2500);
  assert.ok(r.deltaCents <= 2500);
});

test('a store earning nothing has nothing reversed', () => {
  // TSB-keeps-everything stores, which is every store before a split is set.
  const r = refundSplit({ gross_total_cents: 13194, store_earnings_cents: 0, refunded_cents: 0 }, 13194);
  assert.equal(r.storeShareCents, 0);
  assert.equal(r.deltaCents, 0);
});

test('a zero-gross order does not divide by zero', () => {
  const r = refundSplit({ gross_total_cents: 0, store_earnings_cents: 500, refunded_cents: 0 }, 500);
  assert.equal(Number.isFinite(r.storeShareCents), true);
  assert.equal(r.storeShareCents, 500);
});

test('a refund of zero changes nothing', () => {
  const r = refundSplit(order, 0);
  assert.equal(r.deltaCents, 0);
  assert.equal(r.fullyRefunded, false);
});
