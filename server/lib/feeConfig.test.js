// Run: node --test server/lib/feeConfig.test.js
//
// computeLineSplit (services/storeOrderCapture.js:79) reads
// `percent_of_retail ?? 0`, so an agreement missing that key pays TSB
// nothing and credits the store 100% of retail. These tests pin both halves:
// the key is always present, and every number that decides a split is
// bounded no matter what a caller posts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeConfigFromContribution, normalizeFeeConfig, MAX_PER_ITEM_CENTS } from './feeConfig.js';

// ── feeConfigFromContribution ─────────────────────────────────────────────

test('a 20% contribution leaves TSB 80%', () => {
  const c = feeConfigFromContribution({ contribution_type: 'percent', contribution_value: 20 });
  assert.equal(c.percent_of_retail, 80);
  assert.equal(c.contribution_value, 20);
});

// The bug: gleeworldProvisioning wrote contribution_* only, so this key was
// absent and TSB's take computed to zero.
test('percent_of_retail is always present, even at zero contribution', () => {
  const c = feeConfigFromContribution({ contribution_type: 'percent', contribution_value: 0 });
  assert.equal(c.percent_of_retail, 100);
});

test('an empty or junk contribution still yields a payable agreement', () => {
  for (const input of [{}, null, undefined, { contribution_value: 'abc' }, { contribution_value: NaN }]) {
    assert.equal(feeConfigFromContribution(input).percent_of_retail, 100);
  }
});

test('a contribution over 100 or under 0 is clamped, never negative to TSB', () => {
  assert.equal(feeConfigFromContribution({ contribution_type: 'percent', contribution_value: 500 }).percent_of_retail, 0);
  assert.equal(feeConfigFromContribution({ contribution_type: 'percent', contribution_value: -50 }).percent_of_retail, 100);
});

test('a flat contribution does not silently become a percentage give-away', () => {
  const c = feeConfigFromContribution({ contribution_type: 'flat', contribution_value: 13 });
  assert.equal(c.contribution_type, 'flat');
  assert.equal(c.percent_of_retail, 100);
});

// ── normalizeFeeConfig ────────────────────────────────────────────────────

// The attack: a partner with a store API key posts their own split.
test('a partner posting percent_of_retail 0 does not get a free store', () => {
  // 0 is a legitimate value (100% fundraiser), so it is preserved rather than
  // rejected — the protection is that TSB approves the agreement, and that
  // every other writer now goes through feeConfigFromContribution.
  const c = normalizeFeeConfig({ percent_of_retail: 0 });
  assert.equal(c.percent_of_retail, 0);
});

test('out-of-range percentages are clamped', () => {
  assert.equal(normalizeFeeConfig({ percent_of_retail: 1e9 }).percent_of_retail, 100);
  assert.equal(normalizeFeeConfig({ percent_of_retail: -5 }).percent_of_retail, 0);
  assert.equal(normalizeFeeConfig({ percent_of_retail: 'free' }).percent_of_retail, 100);
});

test('an absent percent_of_retail defaults to TSB keeping everything, not nothing', () => {
  assert.equal(normalizeFeeConfig({}).percent_of_retail, 100);
  assert.equal(normalizeFeeConfig({ min_per_item_cents: 500 }).percent_of_retail, 100);
});

test('min_per_item_cents is bounded and integral', () => {
  assert.equal(normalizeFeeConfig({ min_per_item_cents: 1300.7 }).min_per_item_cents, 1301);
  assert.equal(normalizeFeeConfig({ min_per_item_cents: -1 }).min_per_item_cents, 0);
  assert.equal(normalizeFeeConfig({ min_per_item_cents: 9e12 }).min_per_item_cents, MAX_PER_ITEM_CENTS);
  assert.equal(normalizeFeeConfig({ min_per_item_cents: 'lots' }).min_per_item_cents, 0);
});

// per_product overrides beat the store-wide numbers in computeLineSplit, so
// leaving them unclamped reopens the hole one product at a time.
test('per_product overrides are clamped too', () => {
  const c = normalizeFeeConfig({
    percent_of_retail: 70,
    per_product: { '41': { percent_of_retail: -10, min_per_item_cents: 9e12 } },
  });
  assert.equal(c.per_product['41'].percent_of_retail, 0);
  assert.equal(c.per_product['41'].min_per_item_cents, MAX_PER_ITEM_CENTS);
});

// Sensory Seasons has real per-product terms ($13/item adult, $12 youth).
test('legitimate per-product terms survive untouched', () => {
  const c = normalizeFeeConfig({
    percent_of_retail: 0,
    per_product: { '41': { min_per_item_cents: 1300 }, '42': { min_per_item_cents: 1200 } },
  });
  assert.equal(c.per_product['41'].min_per_item_cents, 1300);
  assert.equal(c.per_product['42'].min_per_item_cents, 1200);
});

test('a non-object is rejected rather than coerced', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.throws(() => normalizeFeeConfig(bad), /must be an object/);
  }
});

test('a junk per_product map does not throw or produce junk entries', () => {
  const c = normalizeFeeConfig({ per_product: { '1': null, '2': 'nope', '3': { min_per_item_cents: 100 } } });
  assert.deepEqual(Object.keys(c.per_product), ['3']);
});
