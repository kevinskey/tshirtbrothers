// Handling margin is money: a quiet regression here either eats the
// shop's postage margin or overcharges every storefront buyer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withHandling, tierForOunces, rateForOunces, shippingChoicesForOunces,
  parcelOunces, HANDLING_PCT, PACKAGING_OZ, DEFAULT_ITEM_OZ,
} from './shippingRates.js';

test('handling adds 20% and rounds up to the nearest nickel', () => {
  assert.equal(HANDLING_PCT, 0.20);
  assert.equal(withHandling(495), 595);   // 594 → 595
  assert.equal(withHandling(695), 835);   // 834 → 835
  assert.equal(withHandling(995), 1195);  // 1194 → 1195
  assert.equal(withHandling(2495), 2995); // 2994 → 2995
});

test('handling never rounds DOWN below postage + 20%', () => {
  for (const cents of [100, 333, 495, 695, 1295, 1795, 2495, 8995]) {
    assert.ok(withHandling(cents) >= cents * 1.2, `${cents} lost margin`);
    assert.equal(withHandling(cents) % 5, 0, `${cents} is not a round nickel`);
  }
});

test('quoted tiers carry handling and report postage separately', () => {
  const t = tierForOunces(12.6);          // two shirts + mailer
  assert.equal(t.postage.ground, 695);     // table value, untouched
  assert.equal(t.ground, 835);             // what the buyer pays
  assert.ok(t.ground > t.postage.ground);
});

test('every quoting helper applies handling, not just one', () => {
  assert.equal(rateForOunces(12.6).cents, 835);
  assert.equal(shippingChoicesForOunces(12.6)[0].cents, 835);
});

test('overweight parcels still quote above postage', () => {
  const t = tierForOunces(5000);
  assert.equal(t.postage.ground, 2495);
  assert.equal(t.ground, 2995);
});

test('parcel weight counts every garment plus the mailer', () => {
  assert.equal(parcelOunces([{ weightOz: 6, qty: 2 }]), 12 + PACKAGING_OZ);
  // A blank with no weight on file must never quote as weightless.
  assert.equal(parcelOunces([{ weightOz: null, qty: 1 }]), DEFAULT_ITEM_OZ + PACKAGING_OZ);
});
