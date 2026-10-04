// Run: node --test server/lib/embroideryPricing.test.js
//
// Fixtures are the Lighthouse sheet's own numbers — if the vendor reprints
// the sheet, update QTY_TIERS and these tests together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  priceEmbroidery,
  vendorPerPieceCents,
  vendorDigitizingCents,
  EMBROIDERY_MARKUP,
  DIGITIZATION_FEE_CENTS,
} from './embroideryPricing.js';

test('vendor per-piece matches the sheet corners', () => {
  assert.equal(vendorPerPieceCents(1, 5000), 1200);     // qty 1, ≤5k = $12.00
  assert.equal(vendorPerPieceCents(1, 5001), 1320);     // tips into the 6k column
  assert.equal(vendorPerPieceCents(1, 10000), 1800);    // qty 1, 10k = $18.00
  assert.equal(vendorPerPieceCents(5, 8000), 1200);     // 2–5, 8k = $12.00
  assert.equal(vendorPerPieceCents(23, 10000), 900);    // 6–23, 10k = $9.00
  assert.equal(vendorPerPieceCents(100, 7000), 460);    // 72–143, 7k = $4.60
  assert.equal(vendorPerPieceCents(500, 5000), 300);    // 500–999, ≤5k = $3.00
});

test('past 10k stitches adds the per-additional-1000 rate, ceilinged', () => {
  // qty 1: $18.00 + $1.20/extra 1k. 12,500 → 3 extra thousands (ceil).
  assert.equal(vendorPerPieceCents(1, 12500), 1800 + 3 * 120);
  // qty 144–499: $4.75 + $0.25. 11,000 → exactly 1 extra thousand.
  assert.equal(vendorPerPieceCents(200, 11000), 475 + 25);
});

test('digitizing is $3 per 1,000 stitches, ceilinged', () => {
  assert.equal(vendorDigitizingCents(1000), 300);
  assert.equal(vendorDigitizingCents(7500), 2400);   // 8 thousands
  assert.equal(vendorDigitizingCents(12000), 3600);
});

test('markup is applied to vendor cost on every line', () => {
  const q = priceEmbroidery({ stitchCount: 5000, quantity: 1 });
  const stitching = q.lines.find((l) => l.key === 'stitching');
  assert.equal(stitching.costCents, 1200);
  assert.equal(stitching.retailCents, Math.round(1200 * (1 + EMBROIDERY_MARKUP))); // $20.40
});

test('digitizing deposit settles in BOTH directions', () => {
  // 12k stitches: formula retail = 3600 × 1.7 = 6120 > 2500 deposit → balance 3620.
  const big = priceEmbroidery({ stitchCount: 12000, quantity: 1 });
  const bigDigi = big.lines.find((l) => l.key === 'digitizing_settlement');
  assert.equal(bigDigi.retailCents, Math.round(3600 * 1.7) - DIGITIZATION_FEE_CENTS);
  assert.ok(bigDigi.retailCents > 0);

  // 3k stitches: formula retail = 900 × 1.7 = 1530 < 2500 deposit → credit −970.
  const small = priceEmbroidery({ stitchCount: 3000, quantity: 1 });
  const smallDigi = small.lines.find((l) => l.key === 'digitizing_settlement');
  assert.equal(smallDigi.retailCents, Math.round(900 * 1.7) - DIGITIZATION_FEE_CENTS);
  assert.ok(smallDigi.retailCents < 0, 'small designs credit the unused deposit');
});

test('cap surcharges, lettering and personalization come off the sheet', () => {
  const q = priceEmbroidery({
    stitchCount: 2500, quantity: 12, isCap: true, capBack: true,
    letteringLines: 2,
    personalizations: [{ sizeInches: '1', count: 12, secondLine: true }],
  });
  assert.equal(q.lines.find((l) => l.key === 'caps').costCents, 75 * 12);
  assert.equal(q.lines.find((l) => l.key === 'cap_back').costCents, 200 * 12);
  assert.equal(q.lines.find((l) => l.key === 'lettering').costCents, 500 * 2);
  // 1" line 1 = $20 + 2nd line $7, × 12 names.
  assert.equal(q.lines.find((l) => l.key === 'personalization').costCents, (2000 + 700) * 12);
});

test('cap backs refuse designs over 3k stitches, like the sheet says', () => {
  const q = priceEmbroidery({ stitchCount: 3001, quantity: 1, capBack: true });
  assert.ok(q.error);
});

test('rush percentages apply to the marked-up work, not the garment', () => {
  const base = priceEmbroidery({ stitchCount: 5000, quantity: 10, garmentCentsPerPiece: 2000 });
  const rushed = priceEmbroidery({ stitchCount: 5000, quantity: 10, garmentCentsPerPiece: 2000, rush: 'same_day' });
  const garment = 2000 * 10;
  const baseWork = base.totalCents - garment;
  // Same day = +100% on the work; the $200 of garments is untouched.
  assert.equal(rushed.totalCents, baseWork * 2 + garment);
});

test('over 1000 pieces refuses to auto-quote — vendor says call', () => {
  const q = priceEmbroidery({ stitchCount: 5000, quantity: 1001 });
  assert.ok(q.error);
});

test('a realistic order: 24 polos, 7.5k-stitch left chest, $24 garments', () => {
  const q = priceEmbroidery({ stitchCount: 7500, quantity: 24, garmentCentsPerPiece: 2400 });
  // Stitching: 24–71 tier, 8k column = $6.35 → ×24 = $152.40 cost, ×1.7 = $259.08.
  assert.equal(q.lines.find((l) => l.key === 'stitching').retailCents, Math.round(635 * 24 * 1.7));
  // Digitizing: 8k thousands × $3 = $24 cost → $40.80 retail − $25 deposit = $15.80 balance.
  assert.equal(q.lines.find((l) => l.key === 'digitizing_settlement').retailCents, Math.round(2400 * 1.7) - 2500);
  // Garment rides through at retail.
  assert.equal(q.lines.find((l) => l.key === 'garment').retailCents, 2400 * 24);
  assert.equal(q.totalCents, Math.round(635 * 24 * 1.7) + (Math.round(2400 * 1.7) - 2500) + 2400 * 24);
});
