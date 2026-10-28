// The rhinestone formula decides what a bling order costs, and the failure
// modes are quiet: a size multiplier that silently reads as 1.0 under-prices
// every SS16 job, and a NUMERIC-as-string settings row turns the whole total
// into string concatenation. Both are exercised here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRhinestoneQuote,
  resolveStoneRate,
  DEFAULT_RHINESTONE_SETTINGS as D,
} from './rhinestonePricing.js';

test('resolveStoneRate takes the highest matching break', () => {
  const breaks = D.stone_rate_breaks;
  assert.equal(resolveStoneRate(breaks, 1, 9), 0.055);
  assert.equal(resolveStoneRate(breaks, 11, 9), 0.055);
  assert.equal(resolveStoneRate(breaks, 12, 9), 0.042);
  assert.equal(resolveStoneRate(breaks, 47, 9), 0.028);
  assert.equal(resolveStoneRate(breaks, 10000, 9), 0.02);
  assert.equal(resolveStoneRate([], 50, 9), 9, 'empty breaks fall back');
});

test('transfer-only 800-stone SS10 design prices against the YCT benchmark', () => {
  // YCT charges $0.19/sq in at qty 24, so their 100 sq-in transfer is $19.00.
  const q = computeRhinestoneQuote(
    { quantity: 24, stoneBom: [{ size: 'SS10', n: 800 }] },
    D,
  );
  assert.equal(q.transferOnly, true);
  assert.equal(q.stoneCount, 800);
  assert.equal(q.stoneRatePerStone, 0.028);
  // 800 x $0.028 = $22.40 stones + $3 press = $25.40 per piece. Above YCT's
  // transfer, but YCT does not press it — this line includes application.
  assert.equal(q.breakdown.stone_charge_per_location, 22.4);
  assert.equal(q.pricePerPiece, 25.4);
  assert.equal(q.breakdown.digitizing_fee, 0, 'waived at 24+');
  assert.equal(q.total, 609.6);
});

test('finished tee at 24 lands in the $25-$40 retail band competitors hold', () => {
  const q = computeRhinestoneQuote(
    { quantity: 24, stoneBom: [{ size: 'SS10', n: 450 }], garmentCost: 3.5, garmentName: 'T-shirt' },
    D,
  );
  // 450 x $0.028 = $12.60 + $3 press = $15.60 decoration, + $7 garment.
  assert.equal(q.breakdown.garment_per_piece, 7);
  assert.equal(q.pricePerPiece, 22.6);
  assert.ok(q.effectivePerPiece >= 20 && q.effectivePerPiece <= 40, q.effectivePerPiece);
});

test('small run carries digitizing and the higher per-stone rate', () => {
  const q = computeRhinestoneQuote(
    { quantity: 6, stoneBom: [{ size: 'SS10', n: 450 }], garmentCost: 3.5 },
    D,
  );
  assert.equal(q.stoneRatePerStone, 0.055);
  assert.equal(q.breakdown.digitizing_fee, 25);
  // Spreading $25 over 6 pieces is ~$4.17 each on top of the piece price.
  assert.equal(q.effectivePerPiece, round2(q.pricePerPiece + 25 / 6));
});

test('size multipliers price SS16 above SS10 and SS6 below', () => {
  const mk = (size) =>
    computeRhinestoneQuote({ quantity: 50, stoneBom: [{ size, n: 500 }] }, D)
      .breakdown.stone_charge_per_location;
  assert.ok(mk('SS16') > mk('SS10'), 'SS16 must cost more');
  assert.ok(mk('SS6') < mk('SS10'), 'SS6 must cost less');
  assert.equal(mk('SS16'), round2(mk('SS10') * 1.5));
});

test('an unknown stone size falls back to the SS10 rate rather than free', () => {
  const q = computeRhinestoneQuote({ quantity: 50, stoneBom: [{ size: 'SS99', n: 500 }] }, D);
  assert.equal(q.breakdown.stone_charge_per_location, round2(500 * 0.023));
});

test('duplicate BOM rows collapse by size (StoneCut splits by size AND color)', () => {
  const split = computeRhinestoneQuote(
    {
      quantity: 50,
      stoneBom: [
        { size: 'SS10', n: 300 },
        { size: 'SS10', n: 200 },
      ],
    },
    D,
  );
  const whole = computeRhinestoneQuote({ quantity: 50, stoneBom: [{ size: 'SS10', n: 500 }] }, D);
  assert.equal(split.total, whole.total);
  assert.equal(split.stoneLines.length, 1);
});

test('NUMERIC-as-string settings do not turn the total into a string', () => {
  // node-postgres returns every NUMERIC column as a string. If any of these
  // reach the arithmetic unconverted the total silently becomes "38" + "3".
  const pgRow = {
    ...D,
    press_labor_per_piece: '3.00',
    digitizing_fee: '25.00',
    digitizing_waived_at_qty: 24,
    min_decoration_per_piece: '8.00',
    coverage_threshold: '0.7500',
    coverage_upcharge_pct: '0.1500',
    garment_markup: '2.000',
    rush_surcharge_pct: '0.2500',
    proof_fee: '0.00',
  };
  const a = computeRhinestoneQuote({ quantity: 24, stoneCount: 450, garmentCost: 3.5 }, pgRow);
  const b = computeRhinestoneQuote({ quantity: 24, stoneCount: 450, garmentCost: 3.5 }, D);
  assert.equal(typeof a.total, 'number');
  assert.equal(a.total, b.total);
});

test('high coverage adds the upcharge, normal coverage does not', () => {
  const dense = computeRhinestoneQuote(
    { quantity: 24, stoneCount: 800, coverage: 0.9 },
    D,
  );
  const normal = computeRhinestoneQuote({ quantity: 24, stoneCount: 800, coverage: 0.7 }, D);
  assert.equal(dense.highCoverage, true);
  assert.equal(normal.highCoverage, false);
  assert.equal(normal.breakdown.coverage_upcharge_per_location, 0);
  assert.equal(dense.breakdown.coverage_upcharge_per_location, round2(22.4 * 0.15));
});

test('a second location doubles stones and press, and digitizing', () => {
  const one = computeRhinestoneQuote({ quantity: 6, stoneCount: 450 }, D);
  const two = computeRhinestoneQuote({ quantity: 6, stoneCount: 450, numLocations: 2 }, D);
  assert.equal(two.breakdown.decoration_per_piece, round2(one.breakdown.decoration_per_piece * 2));
  assert.equal(two.breakdown.digitizing_fee, 50);
});

test('tiny accents are floored at the minimum decoration charge', () => {
  const q = computeRhinestoneQuote({ quantity: 50, stoneCount: 40 }, D);
  // 40 x $0.023 = $0.92 + $3 press = $3.92, below the $8 floor.
  assert.equal(q.breakdown.decoration_per_piece, 8);
  assert.equal(q.breakdown.min_applied, true);
});

test('rush applies to the whole order including one-time fees', () => {
  const q = computeRhinestoneQuote({ quantity: 6, stoneCount: 450, rush: true }, D);
  const base = computeRhinestoneQuote({ quantity: 6, stoneCount: 450 }, D);
  assert.equal(q.subtotal, base.subtotal);
  assert.equal(q.breakdown.rush_surcharge, round2(base.subtotal * 0.25));
  assert.equal(q.total, round2(base.subtotal * 1.25));
});

test('bad inputs are rejected rather than priced at zero', () => {
  assert.throws(() => computeRhinestoneQuote({ quantity: 0, stoneCount: 100 }, D), /quantity/);
  assert.throws(() => computeRhinestoneQuote({ quantity: 2.5, stoneCount: 100 }, D), /quantity/);
  assert.throws(() => computeRhinestoneQuote({ quantity: 10 }, D), /stoneBom or stoneCount/);
  assert.throws(() => computeRhinestoneQuote({ quantity: 10, stoneCount: 0 }, D), /stoneBom or stoneCount/);
  assert.throws(
    () => computeRhinestoneQuote({ quantity: 10, stoneCount: 100, numLocations: 0 }, D),
    /numLocations/,
  );
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
