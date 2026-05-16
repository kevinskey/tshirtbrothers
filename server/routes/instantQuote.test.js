// Run: node --test server/routes/instantQuote.test.js
//
// computeQuote is pure — exercises every formula branch without touching
// Postgres or Express. Fixture mirrors the seed data from migrations/
// instant_quote_pricing.sql, with NUMERIC values as strings exactly the way
// node-postgres returns them (so the Number() coercion gets exercised too).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote } from './instantQuote.js';

const FIXTURE = {
  garments: [
    { name: 'T-shirt', quality_tier: 'Standard', base_cost: '3.50',  active: true },
    { name: 'T-shirt', quality_tier: 'Premium',  base_cost: '6.00',  active: true },
    { name: 'Hoodie',  quality_tier: 'Premium',  base_cost: '18.00', active: true },
    { name: 'T-shirt', quality_tier: 'Disabled', base_cost: '5.00',  active: false },
  ],
  printMethods: [
    { name: 'Screen Print', setup_fee_per_color: '25.00', base_per_piece_cost: '1.50', charges_per_color: true,  active: true },
    { name: 'DTF',          setup_fee_per_color: '0.00',  base_per_piece_cost: '4.00', charges_per_color: false, active: true },
    { name: 'DTG',          setup_fee_per_color: '0.00',  base_per_piece_cost: '6.00', charges_per_color: false, active: true },
    { name: 'Embroidery',   setup_fee_per_color: '45.00', base_per_piece_cost: '5.50', charges_per_color: false, active: true },
  ],
  quantityTiers: [
    { min_qty: 1,   max_qty: 10,   discount_pct: '0.0000' },
    { min_qty: 11,  max_qty: 25,   discount_pct: '0.0500' },
    { min_qty: 26,  max_qty: 50,   discount_pct: '0.1000' },
    { min_qty: 51,  max_qty: 100,  discount_pct: '0.1500' },
    { min_qty: 101, max_qty: 250,  discount_pct: '0.2200' },
    { min_qty: 251, max_qty: 500,  discount_pct: '0.3000' },
    { min_qty: 501, max_qty: null, discount_pct: '0.3500' },
  ],
  settings: {
    markup_multiplier: '2.0000',
    rush_surcharge_pct: '0.2500',
    standard_turnaround: 10,
    rush_turnaround: 5,
    size_upcharges: { '2XL': 2, '3XL': 4, '4XL': 6, '5XL': 8, '6XL': 10 },
  },
};

const baseInputs = {
  quantity: 50,
  garmentName: 'T-shirt',
  qualityTier: 'Standard',
  methodName: 'Screen Print',
  numLocations: 1,
  colorsPerLocation: 1,
  rush: false,
};

test('50 standard t-shirts, 1-color screen print, no rush, 1 location', () => {
  const r = computeQuote(baseInputs, FIXTURE);
  // base = (3.50 + 1.50 × 1) × 50 = 250
  // setup = 25 × 1 × 1 = 25
  // discount = 250 × 0.10 = 25       (tier 26-50)
  // rush = 0
  // subtotal = 250 - 25 + 25 + 0 = 250
  // total = 250 × 2.0 = 500
  // per_shirt = 500 / 50 = 10.00
  assert.equal(r.total, 500);
  assert.equal(r.per_shirt, 10);
  assert.equal(r.turnaround_days, 10);
  assert.equal(r.breakdown.base, 250);
  assert.equal(r.breakdown.setup, 25);
  assert.equal(r.breakdown.quantity_discount, 25);
  assert.equal(r.breakdown.rush_surcharge, 0);
});

test('screen print: setup multiplies by colors AND locations', () => {
  // 100 shirts, 4-color front + 4-color back = 4 colors × 2 locations
  const r = computeQuote(
    { ...baseInputs, quantity: 100, numLocations: 2, colorsPerLocation: 4 },
    FIXTURE
  );
  // base = (3.50 + 1.50 × 2) × 100 = 650
  // setup = 25 × 4 × 2 = 200
  // discount = 650 × 0.15 = 97.50  (tier 51-100)
  // subtotal = 650 - 97.50 + 200 = 752.50
  // total = 752.50 × 2.0 = 1505
  assert.equal(r.breakdown.base, 650);
  assert.equal(r.breakdown.setup, 200);
  assert.equal(r.breakdown.quantity_discount, 97.5);
  assert.equal(r.total, 1505);
  assert.equal(r.per_shirt, 15.05);
});

test('embroidery: setup is per-design (per-location), NOT per-color', () => {
  // 50 hoodies, embroidery on left chest + back = 2 locations
  // colorsPerLocation should be IGNORED for embroidery (charges_per_color: false)
  const r = computeQuote(
    {
      quantity: 50, garmentName: 'Hoodie', qualityTier: 'Premium',
      methodName: 'Embroidery', numLocations: 2, colorsPerLocation: 12, rush: false,
    },
    FIXTURE
  );
  // base = (18 + 5.50 × 2) × 50 = 1450
  // setup = 45 × 2 = 90  (NOT 45 × 12 × 2)
  // discount = 1450 × 0.10 = 145
  // subtotal = 1450 - 145 + 90 = 1395
  // total = 1395 × 2.0 = 2790
  assert.equal(r.breakdown.setup, 90);
  assert.equal(r.total, 2790);
});

test('DTF: zero setup regardless of colors', () => {
  const r = computeQuote(
    { ...baseInputs, methodName: 'DTF', colorsPerLocation: 6 },
    FIXTURE
  );
  // base = (3.50 + 4 × 1) × 50 = 375
  // setup = 0
  // discount = 375 × 0.10 = 37.50
  // total = (375 - 37.50) × 2 = 675
  assert.equal(r.breakdown.setup, 0);
  assert.equal(r.total, 675);
});

test('rush adds 25% of base', () => {
  const r = computeQuote({ ...baseInputs, rush: true }, FIXTURE);
  // base = 250, rush_surcharge = 250 × 0.25 = 62.50
  // subtotal = 250 - 25 + 25 + 62.50 = 312.50
  // total = 312.50 × 2.0 = 625
  assert.equal(r.breakdown.rush_surcharge, 62.5);
  assert.equal(r.total, 625);
  assert.equal(r.turnaround_days, 5);
});

test('open-ended top quantity tier (501+) applies', () => {
  const r = computeQuote({ ...baseInputs, quantity: 1000, methodName: 'DTF' }, FIXTURE);
  // base = (3.50 + 4 × 1) × 1000 = 7500
  // discount = 7500 × 0.35 = 2625   (tier 501+)
  // total = (7500 - 2625) × 2 = 9750
  assert.equal(r.breakdown.discount_pct, 0.35);
  assert.equal(r.total, 9750);
});

test('lowest tier: 1-10 has zero discount', () => {
  const r = computeQuote({ ...baseInputs, quantity: 5, methodName: 'DTF' }, FIXTURE);
  assert.equal(r.breakdown.discount_pct, 0);
  assert.equal(r.breakdown.quantity_discount, 0);
});

test('multiple locations multiply per-piece print cost', () => {
  // Same quantity/method, locations 1 → 3 should triple the print contribution
  const a = computeQuote({ ...baseInputs, methodName: 'DTF', numLocations: 1 }, FIXTURE);
  const b = computeQuote({ ...baseInputs, methodName: 'DTF', numLocations: 3 }, FIXTURE);
  // a base = (3.50 + 4 × 1) × 50 = 375
  // b base = (3.50 + 4 × 3) × 50 = 775
  assert.equal(a.breakdown.base, 375);
  assert.equal(b.breakdown.base, 775);
});

test('per-size quantities sum to total qty and pick the right discount tier', () => {
  const r = computeQuote(
    { ...baseInputs, quantity: undefined, methodName: 'DTF',
      sizes: [{ size: 'M', quantity: 10 }, { size: 'L', quantity: 10 }, { size: 'XL', quantity: 5 }] },
    FIXTURE
  );
  // 25 shirts → tier 11-25 → 5% discount. No size upcharges (S-XL).
  // base = (3.50 + 4 × 1) × 25 = 187.50
  // discount = 187.50 × 0.05 = 9.375
  // total = (187.50 - 9.375) × 2 = 356.25
  assert.equal(r.quantity, 25);
  assert.equal(r.breakdown.base, 187.5);
  assert.equal(r.breakdown.discount_pct, 0.05);
  assert.equal(r.total, 356.25);
});

test('2XL+ upcharge adds to each shirt of that size', () => {
  // 10 M + 5 2XL = 15 shirts → tier 11-25 → 5% discount
  const r = computeQuote(
    { ...baseInputs, quantity: undefined, methodName: 'DTF',
      sizes: [{ size: 'M', quantity: 10 }, { size: '2XL', quantity: 5 }] },
    FIXTURE
  );
  // M:    (3.50 + 0 + 4) × 10 = 75
  // 2XL:  (3.50 + 2 + 4) ×  5 = 47.50
  // base = 122.50
  // upcharge_total = 2 × 5 = 10
  // discount = 122.50 × 0.05 = 6.125
  // total = (122.50 - 6.125) × 2 = 232.75
  assert.equal(r.breakdown.base, 122.5);
  assert.equal(r.breakdown.size_upcharge_total, 10);
  assert.equal(r.total, 232.75);
});

test('back-compat: bare quantity (no sizes) behaves like before', () => {
  // Same call shape as the original tests — no `sizes`, just `quantity`.
  const r = computeQuote({ ...baseInputs, methodName: 'DTF' }, FIXTURE);
  assert.equal(r.quantity, 50);
  assert.equal(r.breakdown.base, 375);
  assert.equal(r.breakdown.size_upcharge_total, 0);
});

test('pickedProduct overrides the tier — your_price drives the garment portion', () => {
  // your_price = 5.90 (= wholesale 2.95 × 2). Formula divides by markup
  // and re-multiplies, so the garment portion of retail = exactly 5.90.
  // 1 shirt + DTF $4 1 location, markup 2.0:
  //   garment_cost = 5.90 / 2 = 2.95
  //   base = (2.95 + 4 × 1) × 1 = 6.95
  //   total = 6.95 × 2 = 13.90
  const r = computeQuote(
    { ...baseInputs, quantity: undefined,
      sizes: [{ size: 'M', quantity: 1 }],
      methodName: 'DTF',
      pickedProduct: { ss_id: '12345', name: 'Some Tee', your_price: 5.90 } },
    FIXTURE
  );
  assert.equal(r.breakdown.base, 6.95);
  assert.equal(r.total, 13.9);
});

test('throws on unknown garment', () => {
  assert.throws(
    () => computeQuote({ ...baseInputs, garmentName: 'Nonexistent' }, FIXTURE),
    /Unknown garment/
  );
});

test('inactive garments are not selectable', () => {
  assert.throws(
    () => computeQuote({ ...baseInputs, qualityTier: 'Disabled' }, FIXTURE),
    /Unknown garment/
  );
});

test('throws on quantity < 1', () => {
  assert.throws(
    () => computeQuote({ ...baseInputs, quantity: 0 }, FIXTURE),
    /quantity must be a positive integer/
  );
});

test('throws on non-integer quantity', () => {
  assert.throws(
    () => computeQuote({ ...baseInputs, quantity: 5.5 }, FIXTURE),
    /quantity must be a positive integer/
  );
});

test('throws on numLocations < 1', () => {
  assert.throws(
    () => computeQuote({ ...baseInputs, numLocations: 0 }, FIXTURE),
    /numLocations must be a positive integer/
  );
});

test('rounding: per_shirt has 2 decimals even on awkward divisors', () => {
  // 7 shirts, screen print 1 color 1 location, no rush
  // base = 5 × 7 = 35; setup = 25; discount = 0 (tier 1-10); subtotal = 60; total = 120
  // per_shirt = 120 / 7 = 17.142857... → 17.14
  const r = computeQuote({ ...baseInputs, quantity: 7 }, FIXTURE);
  assert.equal(r.per_shirt, 17.14);
});

test('boundary: quantity exactly at tier edge', () => {
  // qty 11 falls into tier 11-25 (5% off), not tier 1-10 (0% off)
  const r = computeQuote({ ...baseInputs, quantity: 11, methodName: 'DTF' }, FIXTURE);
  assert.equal(r.breakdown.discount_pct, 0.05);
});
