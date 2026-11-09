// Run: node --test server/lib/garmentTier.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierForWholesale, garmentFamilyFor } from './garmentTier.js';

// The live T-shirt grid, NUMERIC as strings the way node-postgres returns it.
const TEES = [
  { quality_tier: 'Ultra',    base_cost: '6.29', active: true },
  { quality_tier: 'Standard', base_cost: '2.95', active: true },
  { quality_tier: 'Premium',  base_cost: '4.03', active: true },
  { quality_tier: 'Premium',  base_cost: '9.99', active: false }, // stale row, must be ignored
];

test('each anchor classifies as its own tier', () => {
  assert.equal(tierForWholesale('2.95', TEES).quality_tier, 'Standard');
  assert.equal(tierForWholesale(4.03, TEES).quality_tier, 'Premium');
  assert.equal(tierForWholesale(6.29, TEES).quality_tier, 'Ultra');
});

test('boundaries sit at the midpoints between adjacent anchors', () => {
  const { boundaries } = tierForWholesale(1, TEES);
  assert.deepEqual(boundaries, [
    { below: 3.49, tier: 'Standard' },
    { below: 5.16, tier: 'Premium' },
  ]);
  assert.equal(tierForWholesale(3.48, TEES).quality_tier, 'Standard');
  assert.equal(tierForWholesale(3.49, TEES).quality_tier, 'Premium');
  assert.equal(tierForWholesale(5.15, TEES).quality_tier, 'Premium');
  assert.equal(tierForWholesale(5.16, TEES).quality_tier, 'Ultra');
});

test('below the bottom anchor is Standard, above the top is Ultra', () => {
  assert.equal(tierForWholesale(0.5, TEES).quality_tier, 'Standard');
  assert.equal(tierForWholesale(40, TEES).quality_tier, 'Ultra');
});

test('a family with only two tiers still splits at their midpoint', () => {
  const two = [
    { quality_tier: 'Standard', base_cost: 8 },
    { quality_tier: 'Ultra', base_cost: 28 },
  ];
  assert.equal(tierForWholesale(17, two).quality_tier, 'Standard');
  assert.equal(tierForWholesale(18.5, two).quality_tier, 'Ultra');
});

test('tiers keep their names even when the grid is priced out of order', () => {
  const odd = [
    { quality_tier: 'Standard', base_cost: 5 },
    { quality_tier: 'Premium',  base_cost: 4 }, // mis-entered
    { quality_tier: 'Ultra',    base_cost: 9 },
  ];
  // Still Standard < Premium < Ultra by label; boundaries 4.5 and 6.5.
  assert.equal(tierForWholesale(4.4, odd).quality_tier, 'Standard');
  assert.equal(tierForWholesale(6, odd).quality_tier, 'Premium');
});

test('unusable wholesale or no anchors yields null, never a guess', () => {
  assert.equal(tierForWholesale(null, TEES), null);
  assert.equal(tierForWholesale('', TEES), null);
  assert.equal(tierForWholesale(0, TEES), null);
  assert.equal(tierForWholesale('abc', TEES), null);
  assert.equal(tierForWholesale(3, []), null);
  assert.equal(tierForWholesale(3, [{ quality_tier: 'Premium', base_cost: 'n/a' }]), null);
});

test('garment family from catalog name and category', () => {
  assert.equal(garmentFamilyFor('Unisex Heavy Blend Hooded Sweatshirt', 'Fleece - Core - Hood'), 'Hoodie');
  assert.equal(garmentFamilyFor('Heavy Blend Crewneck Sweatshirt', 'Fleece - Core - Crew'), 'Sweatshirt');
  assert.equal(garmentFamilyFor('Garment-Dyed Heavyweight T-Shirt', 'T-Shirts - Premium'), 'T-shirt');
  assert.equal(garmentFamilyFor('Long Sleeve Tee', 'T-Shirts - Long Sleeve'), 'Long-sleeve');
  assert.equal(garmentFamilyFor('Unisex Jersey Tank', 'Tank Tops'), 'Tank');
  assert.equal(garmentFamilyFor('Six-Panel Trucker Cap', 'Headwear'), 'Hat');
  assert.equal(garmentFamilyFor('Pique Polo', 'Polos'), 'Polo');
  assert.equal(garmentFamilyFor(undefined, undefined), 'T-shirt');
});
