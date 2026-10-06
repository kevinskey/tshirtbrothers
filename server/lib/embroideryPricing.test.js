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

test('stitching retail is sheet cost at 50% margin (cost × 2)', () => {
  const q = priceEmbroidery({ stitchCount: 5000, quantity: 1 });
  const stitching = q.lines.find((l) => l.key === 'stitching');
  assert.equal(stitching.costCents, 1200);              // sheet cost
  assert.equal(stitching.retailCents, Math.round(1200 * (1 + EMBROIDERY_MARKUP))); // $24.00
  assert.equal(EMBROIDERY_MARKUP, 1.0);                 // 50% margin = ×2
});

test('digitizing is flat $25/design/size — standard deposit settles to zero', () => {
  // Any stitch count: retail is the $25 already collected → no settlement line.
  for (const stitchCount of [3000, 12000]) {
    const q = priceEmbroidery({ stitchCount, quantity: 1 });
    assert.equal(q.lines.find((l) => l.key === 'digitizing_settlement'), undefined);
  }
  // A design digitized at 2 sizes is two $25s; only one was collected → $25 balance.
  const twoSizes = priceEmbroidery({
    quantity: 1,
    designs: [{ stitchCount: 5000, quantity: 1, sizeCount: 2 }],
    depositCents: DIGITIZATION_FEE_CENTS,
  });
  const digi = twoSizes.lines.find((l) => l.key === 'digitizing_settlement');
  assert.equal(digi.retailCents, DIGITIZATION_FEE_CENTS);
  // Legacy over-collection credits back (small enough to keep the total ≥ 0).
  const over = priceEmbroidery({ stitchCount: 5000, quantity: 1, depositCents: 3000 });
  assert.equal(over.lines.find((l) => l.key === 'digitizing_settlement').retailCents, 2500 - 3000);
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
  // Stitching: 24–71 tier, 8k column = $6.35 × 24 = $152.40 cost, × 2 = $304.80.
  assert.equal(q.lines.find((l) => l.key === 'stitching').costCents, 635 * 24);
  assert.equal(q.lines.find((l) => l.key === 'stitching').retailCents, 635 * 24 * 2);
  // Digitizing: flat $25, already collected → no settlement line.
  assert.equal(q.lines.find((l) => l.key === 'digitizing_settlement'), undefined);
  // Garment rides through at retail.
  assert.equal(q.lines.find((l) => l.key === 'garment').retailCents, 2400 * 24);
  assert.equal(q.totalCents, 635 * 24 * 2 + 2400 * 24);
});

test("multi-design: each design is its own run, its own digitizing, its own $25", () => {
  // Kym's oxford: ribbon 6k + emblem 4k, each on 1 shirt. Two $25s collected.
  const q = priceEmbroidery({
    quantity: 1,
    designs: [
      { label: 'Ribbon', stitchCount: 6000, quantity: 1 },
      { label: 'Emblem', stitchCount: 4000, quantity: 1 },
    ],
    depositCents: 5000,
  });
  const runs = q.lines.filter((l) => l.key === 'stitching');
  assert.equal(runs.length, 2);
  // Cost column tiers at qty 1: 6k = $13.20, 4k (≤5k col) = $12.00.
  assert.equal(runs[0].costCents, 1320);
  assert.equal(runs[1].costCents, 1200);
  // Retail at 50% margin: cost × 2.
  assert.equal(runs[0].retailCents, 2640);
  assert.equal(runs[1].retailCents, 2400);
  // Digitizing: 2 × $25 retail, $50 collected → settles to zero, no line.
  assert.equal(q.lines.find((l) => l.key === 'digitizing_settlement'), undefined);
});

test('legacy single-design input still works unchanged', () => {
  const legacy = priceEmbroidery({ stitchCount: 5000, quantity: 1 });
  const viaDesigns = priceEmbroidery({ quantity: 1, designs: [{ stitchCount: 5000, quantity: 1 }], depositCents: 2500 });
  assert.equal(legacy.totalCents, viaDesigns.totalCents);
});
