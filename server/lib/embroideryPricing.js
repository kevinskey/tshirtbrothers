// Embroidery pricing — built from the Lighthouse Promotions contract sheet
// (349 Glynn St N, Fayetteville — "Contract Embroidery Pricing, For Resellers
// Only", effective 1/1/22, with Kevin's handwritten personalization updates).
// Those numbers are OUR COST; retail is cost × (1 + EMBROIDERY_MARKUP).
//
// Kevin, 2026-10-03: "this is my supplier charges so be sure i have a markup;
// also use all the points they use in this document including spoilage etc."
//
// Everything on the sheet is encoded here, in cents:
//   • per-piece price by quantity tier × stitch band, +$ per additional 1,000
//     stitches past 10k
//   • digitizing at $3 per 1,000 stitches (customer-supplied camera-ready art)
//   • keyboard lettering setups $5 (min) per line
//   • personalization / monogramming per size (handwritten updated column:
//     ½" $15 · 1" $20 · 2" $25 · 3" $30 · 4" $35; 2nd line $6/7/9/11/12)
//   • caps +$0.75/pc; cap backs +$2.00 (designs up to 3k stitches)
//   • rush: same day +100%, next day +75%, 2–3 days +50%, 4 days +25%
//   • spoilage: 2% allowance on customer-supplied goods (terms, not a price —
//     surfaced to the customer, not charged)
//   • over 1000 pieces: "call" — refuse to auto-quote, same as the vendor.

export const EMBROIDERY_MARKUP = 0.70; // house convention, same as blanks

// ── Vendor cost tables (cents) ──────────────────────────────────────────────

// Rows: [minQty, maxQty, [≤5000, ≤6000, ≤7000, ≤8000, ≤9000, ≤10000], perAddl1000]
const QTY_TIERS = [
  [1,    1,   [1200, 1320, 1440, 1560, 1680, 1800], 120],
  [2,    5,   [ 900, 1000, 1100, 1200, 1300, 1400], 100],
  [6,    23,  [ 600,  660,  720,  780,  840,  900],  60],
  [24,   71,  [ 500,  545,  590,  635,  680,  725],  45],
  [72,   143, [ 400,  430,  460,  490,  520,  550],  30],
  [144,  499, [ 350,  375,  400,  425,  450,  475],  25],
  [500,  999, [ 300,  325,  350,  375,  400,  425],  25],
];
export const MAX_AUTO_QUOTE_QTY = 999; // over 1000 the vendor says "call"

const DIGITIZING_COST_PER_1000 = 300;        // $3 / 1,000 stitches
export const DIGITIZATION_FEE_CENTS = 2500;  // flat customer gate fee, collected upfront

const LETTERING_SETUP_PER_LINE = 500;        // $5 (min) per line

// Personalization (per piece, per name/monogram). Handwritten updates win.
const PERSONALIZATION_LINE1 = { '0.5': 1500, '1': 2000, '2': 2500, '3': 3000, '4': 3500 };
const PERSONALIZATION_LINE2 = { '0.5':  600, '1':  700, '2':  900, '3': 1100, '4': 1200 };

const CAP_SURCHARGE_PER_PIECE = 75;          // caps add $.75/piece
const CAP_BACK_SURCHARGE = 200;              // +$2.00, designs up to 3k stitches
export const CAP_BACK_MAX_STITCHES = 3000;

export const RUSH_LEVELS = {
  standard:  { label: 'Standard (5–7 business days)', pct: 0 },
  four_day:  { label: '4 business days', pct: 25 },
  two_three: { label: '2–3 business days', pct: 50 },
  next_day:  { label: 'Next business day', pct: 75 },
  same_day:  { label: 'Same business day', pct: 100 },
};

export const SPOILAGE_TERMS =
  'Customer-supplied goods: customer assumes liability for workmanship. '
  + 'Please allow up to 2% for spoilage; spoilage beyond 2% is credited.';

export const ARTWORK_TERMS =
  'Best formats: .ai, .cdr, .eps. Acceptable: .jpg, .tiff, .bmp. '
  + 'Artwork that is not camera-ready incurs art charges at $40/hr.';

// ── Engine ──────────────────────────────────────────────────────────────────

function markupCents(costCents) {
  return Math.round(costCents * (1 + EMBROIDERY_MARKUP));
}

/** Vendor per-piece stitching cost for one piece. */
export function vendorPerPieceCents(quantity, stitchCount) {
  const tier = QTY_TIERS.find(([lo, hi]) => quantity >= lo && quantity <= hi);
  if (!tier) return null; // over 1000 → call
  const [, , bands, perAddl] = tier;
  if (stitchCount <= 5000) return bands[0];
  if (stitchCount <= 10000) {
    // 5001–6000 → ≤6000 column, etc. — bands are "up to" columns.
    const idx = Math.ceil((stitchCount - 5000) / 1000); // 1..5
    return bands[idx];
  }
  const extraThousands = Math.ceil((stitchCount - 10000) / 1000);
  return bands[5] + extraThousands * perAddl;
}

/** Vendor digitizing cost for a design: $3 per 1,000 stitches (ceil). */
export function vendorDigitizingCents(stitchCount) {
  return Math.ceil(stitchCount / 1000) * DIGITIZING_COST_PER_1000;
}

/**
 * Full quote. All money in cents. Returns { lines, costCents, retailCents,
 * totalCents } or { error } when it can't be auto-quoted (vendor says call).
 *
 * input = {
 *   stitchCount, quantity,
 *   garmentCentsPerPiece = 0,     // retail garment price we charge (0 = customer-supplied)
 *   isCap = false,                // caps add $.75/pc vendor-side
 *   capBack = false,              // back-of-cap design (≤3k stitches), +$2 vendor-side
 *   letteringLines = 0,           // keyboard lettering setups, $5/line vendor-side
 *   personalizations = [],        // [{ sizeInches: '0.5'|'1'|'2'|'3'|'4', count, secondLine }]
 *   rush = 'standard',
 * }
 */
export function priceEmbroidery(input) {
  // Designs: one order can carry several designs, each with its own stitch
  // count and its own run quantity (Kym's oxford: ribbon left chest + school
  // emblem right chest = TWO runs on ONE shirt). Each design prices as its
  // own vendor run — tier by ITS quantity — and each design is its own
  // digitization. The legacy single stitchCount/quantity pair is just the
  // one-design case.
  const designs = Array.isArray(input.designs) && input.designs.length > 0
    ? input.designs
    : [{ label: null, stitchCount: input.stitchCount, quantity: input.quantity }];
  if (designs.length > 6) return { error: 'six designs max per quote — split larger jobs' };
  for (const d of designs) {
    const dq = Number(d.quantity);
    const ds = Number(d.stitchCount);
    if (!Number.isInteger(dq) || dq < 1) return { error: 'each design needs a positive run quantity' };
    if (!Number.isInteger(ds) || ds < 1) return { error: 'each design needs a positive stitch count' };
    if (dq > MAX_AUTO_QUOTE_QTY) return { error: `Over ${MAX_AUTO_QUOTE_QTY} pieces the vendor prices by phone — quote this one manually` };
    if (input.capBack && ds > CAP_BACK_MAX_STITCHES) {
      return { error: `Cap backs only go up to ${CAP_BACK_MAX_STITCHES} stitches` };
    }
  }
  // qty = total garment pieces (for garment lines and the cap surcharges);
  // falls back to the largest design run when not supplied.
  const qty = Number(input.quantity) || Math.max(...designs.map((d) => Number(d.quantity)));
  if (!Number.isInteger(qty) || qty < 1) return { error: 'quantity must be a positive integer' };
  if (qty > MAX_AUTO_QUOTE_QTY) return { error: `Over ${MAX_AUTO_QUOTE_QTY} pieces the vendor prices by phone — quote this one manually` };
  const rush = RUSH_LEVELS[input.rush || 'standard'];
  if (!rush) return { error: 'unknown rush level' };

  const lines = [];
  let vendorCost = 0;

  // Stitching: one vendor run per design, tiered by that design's quantity.
  for (const d of designs) {
    const dq = Number(d.quantity);
    const ds = Number(d.stitchCount);
    const perPiece = vendorPerPieceCents(dq, ds);
    const runCost = perPiece * dq;
    vendorCost += runCost;
    lines.push({
      key: 'stitching',
      label: `Embroidery${d.label ? ` — ${d.label}` : ''} — ${ds.toLocaleString()} stitches × ${dq}`,
      costCents: runCost,
      retailCents: markupCents(runCost),
    });
  }

  // Cap surcharges.
  if (input.isCap) {
    const c = CAP_SURCHARGE_PER_PIECE * qty;
    vendorCost += c;
    lines.push({ key: 'caps', label: `Cap surcharge × ${qty}`, costCents: c, retailCents: markupCents(c) });
  }
  if (input.capBack) {
    const c = CAP_BACK_SURCHARGE * qty;
    vendorCost += c;
    lines.push({ key: 'cap_back', label: `Cap back design × ${qty}`, costCents: c, retailCents: markupCents(c) });
  }

  // Keyboard lettering setups.
  const letteringLines = Number(input.letteringLines) || 0;
  if (letteringLines > 0) {
    const c = LETTERING_SETUP_PER_LINE * letteringLines;
    vendorCost += c;
    lines.push({ key: 'lettering', label: `Lettering setup × ${letteringLines} line${letteringLines > 1 ? 's' : ''}`, costCents: c, retailCents: markupCents(c) });
  }

  // Personalization / monogramming.
  for (const p of input.personalizations || []) {
    const size = String(p.sizeInches);
    const base = PERSONALIZATION_LINE1[size];
    if (!base) return { error: `unknown personalization size: ${size}"` };
    const count = Number(p.count) || 0;
    if (count <= 0) continue;
    let c = base * count;
    let label = `Personalization ${size}" × ${count}`;
    if (p.secondLine) {
      c += PERSONALIZATION_LINE2[size] * count;
      label += ' (2 lines)';
    }
    vendorCost += c;
    lines.push({ key: 'personalization', label, costCents: c, retailCents: markupCents(c) });
  }

  // Digitizing: the Lighthouse formula, marked up (Kevin, 2026-10-03: "use
  // lighthouse formula for digitizing also"). The $25 collected upfront is a
  // DEPOSIT, not the price — it exists because $3/1k can't be computed until
  // digitizing reveals the stitch count. The quote settles the difference in
  // either direction: a 12k jacket back carries a balance, a 3k cap design
  // carries a credit.
  // skipDigitizing: the customer brought their own stitch file — no vendor
  // digitizing cost, no $25 deposit, no settlement line at all.
  if (input.skipDigitizing) {
    // Customer brought their own stitch file(s) — nothing to digitize.
  } else {
    // EVERY design is its own digitization: its own $25 charge at checkout
    // (Kevin, 2026-10-04: "that's two separate $25 embroidery charges") and
    // its own $3/1k at the vendor. The deposit that settles here is
    // therefore $25 x designs — or whatever the caller says was actually
    // collected, which matters for converted/legacy requests.
    const depositCents = Number.isInteger(input.depositCents)
      ? input.depositCents
      : DIGITIZATION_FEE_CENTS * designs.length;
    const digiCost = designs.reduce((t, d) => t + vendorDigitizingCents(Number(d.stitchCount)), 0);
    const digiRetail = markupCents(digiCost);
    const digiDelta = digiRetail - depositCents;
    vendorCost += digiCost;
    if (digiDelta !== 0) {
      const kDesc = designs.map((d) => `${Math.ceil(Number(d.stitchCount) / 1000)}k`).join(' + ');
      lines.push({
        key: 'digitizing_settlement',
        label: digiDelta > 0
          ? `Digitizing balance (${designs.length > 1 ? designs.length + ' designs: ' : ''}${kDesc} @ formula; $${(depositCents / 100).toFixed(0)} deposit applied)`
          : `Digitizing credit ($${(depositCents / 100).toFixed(0)} deposit exceeded formula for ${kDesc})`,
        costCents: digiCost,
        retailCents: digiDelta, // negative = credit, reduces the total
      });
    }
  }

  // Rush — the vendor applies it to production, so: on top of everything
  // above (which is already marked up), not on the garment.
  let subtotalRetail = lines.reduce((s, l) => s + l.retailCents, 0);
  if (rush.pct > 0) {
    const r = Math.round(subtotalRetail * (rush.pct / 100));
    lines.push({ key: 'rush', label: `Rush — ${rush.label} (+${rush.pct}%)`, costCents: 0, retailCents: r });
    subtotalRetail += r;
  }

  // Garments, already retail (what WE charge; our cost lives in the catalog).
  // Two shapes: the legacy single price-per-piece against the run quantity,
  // or (multi-garment requests) a list of garments each with its own retail
  // and quantity — one design, one stitch count, spread across products.
  let garmentRetail = 0;
  if (Array.isArray(input.garments) && input.garments.length > 0) {
    for (const g of input.garments) {
      const gq = Number(g.quantity) || 0;
      const per = Number(g.centsPerPiece) || 0;
      if (gq <= 0 || per <= 0) continue;
      const line = per * gq;
      garmentRetail += line;
      lines.push({ key: 'garment', label: `${g.label || 'Garment'} × ${gq}`, costCents: 0, retailCents: line });
    }
  } else {
    garmentRetail = (Number(input.garmentCentsPerPiece) || 0) * qty;
    if (garmentRetail > 0) {
      lines.push({ key: 'garment', label: `Garment × ${qty}`, costCents: 0, retailCents: garmentRetail });
    }
  }

  return {
    lines,
    costCents: vendorCost,
    retailCents: subtotalRetail + garmentRetail,
    totalCents: subtotalRetail + garmentRetail,
    rushLabel: rush.label,
  };
}
