// Weight-tiered shipping table for storefront checkout. The TIERS below
// are postage: roughly USPS Ground Advantage retail from Fairburn GA.
// HANDLING_PCT is added on top at quote time to cover the mailer, the
// labour of packing, and the gap between a fixed tier and a live label.
//
// Why a table and not live rates: Stripe hosted checkout has to show
// shipping options BEFORE the buyer enters an address, so a quote has to
// be purely weight-based. The real label is bought later through
// EasyPost at commercial rates.
//
// Weight passed in should be total parcel ounces: sum of per-item
// weight_oz × qty, plus PACKAGING_OZ for the mailer.

export const PACKAGING_OZ = 4;

// Handling margin added to every quoted shipping price (Kevin,
// 2026-10-02). Applied centrally so the group stores, CGC and the JDS
// store can't drift apart on it. Charged prices round UP to the nearest
// nickel — $8.35 reads as a price, $8.34 reads as a spreadsheet.
export const HANDLING_PCT = 0.20;

export function withHandling(cents) {
  return Math.ceil((cents * (1 + HANDLING_PCT)) / 5) * 5;
}

// When a product's blank has no weight data yet (weight_oz NULL/0),
// assume a mid-weight garment so shipping is never free by accident.
export const DEFAULT_ITEM_OZ = 8;

const TIERS = [
  { maxOz: 8,   ground: 495,  priority: 895,  express: 2495, overnight: 3495 },
  { maxOz: 16,  ground: 695,  priority: 995,  express: 2795, overnight: 3795 },
  { maxOz: 32,  ground: 995,  priority: 1295, express: 3295, overnight: 4295 },
  { maxOz: 80,  ground: 1295, priority: 1795, express: 4495, overnight: 5495 },
  { maxOz: 160, ground: 1795, priority: 2495, express: 5995, overnight: 6995 },
];
const OVERWEIGHT = { ground: 2495, priority: 3495, express: 7995, overnight: 8995 };

// Raw tier row (all speeds) for callers that build their own option
// list — e.g. the group-store checkout, which bundles TSB-style rush
// production surcharges into the faster speeds.
export function tierForOunces(totalOz) {
  const t = TIERS.find((x) => totalOz <= x.maxOz) ?? OVERWEIGHT;
  return {
    maxOz: t.maxOz,
    ground: withHandling(t.ground),
    priority: withHandling(t.priority),
    express: withHandling(t.express),
    overnight: withHandling(t.overnight),
    // Postage before handling, for margin reporting.
    postage: { ground: t.ground, priority: t.priority, express: t.express, overnight: t.overnight },
  };
}

export function rateForOunces(totalOz) {
  const t = TIERS.find((x) => totalOz <= x.maxOz) ?? OVERWEIGHT;
  return { cents: withHandling(t.ground), label: 'USPS Ground' };
}

// Speed choices for checkout, cheapest first — all derived from the
// same weight tier. Not live carrier quotes: Stripe hosted checkout
// fixes shipping options before the address is known.
export function shippingChoicesForOunces(totalOz) {
  const t = TIERS.find((x) => totalOz <= x.maxOz) ?? OVERWEIGHT;
  return [
    { cents: withHandling(t.ground),   label: 'USPS Ground',        minDays: 3, maxDays: 7 },
    { cents: withHandling(t.priority), label: 'USPS Priority Mail', minDays: 2, maxDays: 3 },
    { cents: withHandling(t.express),  label: 'Express (UPS 2nd Day Air)', minDays: 1, maxDays: 2 },
  ];
}

// Total parcel weight for a cart of { weightOz|null, qty } lines.
export function parcelOunces(lines) {
  const items = lines.reduce(
    (sum, l) => sum + (Number(l.weightOz) > 0 ? Number(l.weightOz) : DEFAULT_ITEM_OZ) * (l.qty || 1),
    0,
  );
  return items + PACKAGING_OZ;
}
