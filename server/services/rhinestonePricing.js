// Rhinestone / bling pricing.
//
// Why this isn't an instant_quote_print_methods row: every other decoration
// method prices on colors × locations. Rhinestone cost is driven by STONE
// COUNT — and because StoneCut digitizes the design before we quote it, we
// know the exact count per stone size. Pricing off the real BOM instead of
// a square-inch guess is the whole competitive edge here, so it gets its own
// engine rather than being bent into the per-color formula.
//
// ── Competitor research, captured 2026-10-24 ───────────────────────────────
// Your Custom Transfers (transfer only, no garment; 4–196 sq in; SS6/10/16):
//   price scales per square inch of the WHOLE design, 65–75% coverage assumed
//   qty 10–19 → $1.33 per 4 sq in  = $0.3325/sq in
//   qty 20–50 → $0.76              = $0.1900/sq in
//   qty 51–99 → $0.65              = $0.1615/sq in
//   qty 100+  → $0.62              = $0.1558/sq in
//   + $16.95 digital proof, +40–45% all-pink upcharge, >75% coverage upcharge
//   10–14 business day production.
// Broken Arrow Wear (finished shirt, all-inclusive, free shipping/proof):
//   48-piece minimum, 2 stone colors max, 6–10 business days.
// Retail finished bling spiritwear:
//   Etsy $28.50–$37.46; independent sellers $25–$32 tee, $40 jersey.
//   CustomInk printed (not bling) school spiritwear $17.70/ea at 125.
// Stone material cost: bulk SS10 hotfix ~$10.35 / 10 gross = ~$0.0072/stone.
//
// Defaults in rhinestone_v1.sql are set so a representative 100 sq-in design
// (~800 SS10 stones) prices just under Your Custom Transfers at each break
// while keeping 60%+ gross margin on stones, and so a finished tee lands in
// the $25–$35 retail band the Etsy/indie market has established. Everything
// is tunable from the admin without a deploy.

// Shape of the settings row, used when the table hasn't been migrated yet so
// the route can still answer instead of 500ing. Keep in sync with the seed
// INSERT in migrations/rhinestone_v1.sql.
export const DEFAULT_RHINESTONE_SETTINGS = {
  stone_rate_breaks: [
    { min_qty: 1, rate: 0.055 },
    { min_qty: 12, rate: 0.042 },
    { min_qty: 24, rate: 0.028 },
    { min_qty: 48, rate: 0.023 },
    { min_qty: 100, rate: 0.02 },
  ],
  size_multipliers: { SS6: 0.75, SS10: 1.0, SS16: 1.5, SS20: 2.0, SS30: 3.2 },
  press_labor_per_piece: 3.0,
  digitizing_fee: 25.0,
  digitizing_waived_at_qty: 24,
  min_decoration_per_piece: 8.0,
  coverage_threshold: 0.75,
  coverage_upcharge_pct: 0.15,
  garment_markup: 2.0,
  rush_surcharge_pct: 0.25,
  proof_fee: 0.0,
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Postgres hands NUMERIC back as a string; every settings read goes through
// this so the formula never does string arithmetic.
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Highest matching min_qty wins — same convention as instantQuote.js's
// resolveBreak, so the two engines behave alike at volume boundaries.
export function resolveStoneRate(breaks, quantity, fallback) {
  if (!Array.isArray(breaks) || breaks.length === 0) return fallback;
  let best = null;
  for (const b of breaks) {
    const mq = Number(b?.min_qty);
    const rate = Number(b?.rate);
    if (!Number.isFinite(mq) || !Number.isFinite(rate) || mq > quantity) continue;
    if (!best || mq > best.mq) best = { mq, rate };
  }
  return best ? best.rate : fallback;
}

/* ---------------------------------------------------------------------------
 * computeRhinestoneQuote — pure. Exported for unit tests.
 *
 *   inputs = {
 *     quantity:      1+ integer, pieces in the order
 *     stoneBom:      [{ size: 'SS10', n: 812 }, ...]  — from StoneCut
 *     stoneCount:    fallback when no BOM is known (treated as all SS10)
 *     coverage:      0..1 fraction of the design covered by stones (optional)
 *     garmentCost:   wholesale blank cost each, or 0 / omitted for
 *                    transfer-only (we make the transfer, they press it)
 *     garmentName:   label only, echoed back for the line description
 *     numLocations:  1+ — a second bling placement is a second transfer
 *     rush:          boolean
 *     physicalProof: boolean — digital proofs are free
 *   }
 * ------------------------------------------------------------------------- */
export function computeRhinestoneQuote(inputs, settingsRow) {
  const s = settingsRow || DEFAULT_RHINESTONE_SETTINGS;

  const quantity = Number(inputs?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }

  const numLocations = inputs?.numLocations == null ? 1 : Number(inputs.numLocations);
  if (!Number.isInteger(numLocations) || numLocations < 1) {
    throw new Error('numLocations must be a positive integer');
  }

  const sizeMultipliers = s.size_multipliers || DEFAULT_RHINESTONE_SETTINGS.size_multipliers;
  const baseRate = resolveStoneRate(
    s.stone_rate_breaks,
    quantity,
    DEFAULT_RHINESTONE_SETTINGS.stone_rate_breaks[0].rate,
  );

  // Normalize the BOM. A bare stoneCount is treated as SS10 (multiplier 1.0),
  // which is what a customer-facing estimate without a digitized design gets.
  let bom;
  if (Array.isArray(inputs?.stoneBom) && inputs.stoneBom.length > 0) {
    bom = inputs.stoneBom
      .map((r) => ({ size: String(r?.size || 'SS10').toUpperCase(), n: Number(r?.n) || 0 }))
      .filter((r) => r.n > 0);
  } else {
    const count = Number(inputs?.stoneCount) || 0;
    bom = count > 0 ? [{ size: 'SS10', n: count }] : [];
  }
  if (bom.length === 0) throw new Error('stoneBom or stoneCount is required');

  // Collapse duplicate size rows — StoneCut's BOM splits by size AND color,
  // and color doesn't change the price (we stock 90+ colors at one cost).
  const bySize = new Map();
  for (const r of bom) bySize.set(r.size, (bySize.get(r.size) || 0) + r.n);

  const stoneLines = [...bySize.entries()].map(([size, n]) => {
    const mult = num(sizeMultipliers[size], 1);
    const rate = baseRate * mult;
    return { size, stones: n, rate: round2(rate * 10000) / 10000, charge: round2(n * rate) };
  });
  stoneLines.sort((a, b) => b.stones - a.stones);

  const stoneCount = stoneLines.reduce((t, l) => t + l.stones, 0);
  const stoneCharge = stoneLines.reduce((t, l) => t + l.charge, 0);

  // Dense designs take longer to brush and need a firmer press.
  const coverage = Number(inputs?.coverage);
  const coverageThreshold = num(s.coverage_threshold, 0.75);
  const coverageUpchargePct = num(s.coverage_upcharge_pct, 0.15);
  const highCoverage = Number.isFinite(coverage) && coverage > coverageThreshold;
  const coverageUpcharge = highCoverage ? stoneCharge * coverageUpchargePct : 0;

  const pressLabor = num(s.press_labor_per_piece, 3);

  // One bling placement per location: stones + press both repeat.
  const perLocation = stoneCharge + coverageUpcharge + pressLabor;
  const minPerPiece = num(s.min_decoration_per_piece, 8);
  const decorationPerPiece = Math.max(minPerPiece, perLocation * numLocations);

  // Garment side. 0 means transfer-only — a real product line (it's all
  // Your Custom Transfers sells) and the only way to serve customers who
  // already own their blanks.
  const garmentCost = Math.max(0, Number(inputs?.garmentCost) || 0);
  const garmentMarkup = num(s.garment_markup, 2);
  const garmentPerPiece = round2(garmentCost * garmentMarkup);
  const transferOnly = garmentPerPiece === 0;

  const perPieceBeforeRush = round2(decorationPerPiece + garmentPerPiece);

  // One-time fees. Digitizing is waived at volume — the template pays for
  // itself once the run is big enough.
  const digitizingWaivedAt = num(s.digitizing_waived_at_qty, 24);
  const digitizingFee =
    quantity >= digitizingWaivedAt ? 0 : round2(num(s.digitizing_fee, 25) * numLocations);
  const proofFee = inputs?.physicalProof ? round2(num(s.proof_fee, 0)) : 0;

  const subtotal = round2(perPieceBeforeRush * quantity + digitizingFee + proofFee);
  const rushPct = inputs?.rush ? num(s.rush_surcharge_pct, 0.25) : 0;
  const rushSurcharge = round2(subtotal * rushPct);
  const total = round2(subtotal + rushSurcharge);

  return {
    quantity,
    numLocations,
    transferOnly,
    garmentName: inputs?.garmentName || (transferOnly ? 'Transfer only' : 'Garment'),
    stoneCount,
    stoneRatePerStone: baseRate,
    stoneLines,
    highCoverage,
    breakdown: {
      stone_charge_per_location: round2(stoneCharge),
      coverage_upcharge_per_location: round2(coverageUpcharge),
      press_labor_per_location: round2(pressLabor),
      decoration_per_piece: round2(decorationPerPiece),
      garment_per_piece: garmentPerPiece,
      digitizing_fee: digitizingFee,
      proof_fee: proofFee,
      rush_surcharge: rushSurcharge,
      min_applied: decorationPerPiece === minPerPiece && perLocation * numLocations < minPerPiece,
    },
    pricePerPiece: perPieceBeforeRush,
    // What the customer actually pays each once one-time fees are spread —
    // the number the /bling calculator leads with.
    effectivePerPiece: round2(total / quantity),
    subtotal,
    total,
  };
}
