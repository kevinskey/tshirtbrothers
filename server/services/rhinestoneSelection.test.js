import test from 'node:test';
import assert from 'node:assert/strict';
import { priceRhinestoneSelection } from './rhinestoneSelection.js';
import { computeRhinestoneQuote } from './rhinestonePricing.js';
const base = { sizeKey: 'standard', garmentKey: 'tee', quantity: 24, numLocations: 1, rush: false };
test('calculator handoff preserves the displayed 24-shirt estimate and ignores client prices', () => {
  const { inputs, calc } = priceRhinestoneSelection({ ...base, total: 1, garmentCost: 0, stoneCount: 1 });
  assert.equal(inputs.stoneCount, 500);
  assert.equal(inputs.garmentCost, 3.5);
  assert.equal(calc.total, 576);
  assert.equal(calc.per_shirt, 24);
  assert.equal(inputs.methodName, 'Rhinestone');
});
test('transfer, two placements and rush retain the rhinestone pricing formula', () => {
  const selection = { ...base, garmentKey: 'transfer', sizeKey: 'full', quantity: 12, numLocations: 2, rush: true };
  const { inputs, calc } = priceRhinestoneSelection(selection);
  const expected = computeRhinestoneQuote(inputs);
  assert.equal(calc.total, expected.total);
  assert.equal(calc.transferOnly, true);
  assert.equal(inputs.locations.back, true);
  assert.equal(calc.stoneCount, 900);
  assert.ok(calc.breakdown.rush_surcharge > 0);
});
test('invalid selections cannot create priced quote lines', () => {
  for (const overrides of [{ sizeKey: 'fake' }, { garmentKey: 'free' }, { quantity: 0 }, { quantity: 251 }, { quantity: 2.5 }, { numLocations: 3 }]) {
    assert.throws(() => priceRhinestoneSelection({ ...base, ...overrides }));
  }
});
