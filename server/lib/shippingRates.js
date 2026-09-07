// Weight-tiered shipping table for storefront checkout. Rates approximate
// USPS Ground Advantage retail from Fairburn GA with a small handling
// cushion; the label is later bought through EasyPost at commercial
// rates, so each tier nets slightly ahead of actual postage.
//
// Weight passed in should be total parcel ounces: sum of per-item
// weight_oz × qty, plus PACKAGING_OZ for the mailer.

export const PACKAGING_OZ = 4;

// When a product's blank has no weight data yet (weight_oz NULL/0),
// assume a mid-weight garment so shipping is never free by accident.
export const DEFAULT_ITEM_OZ = 8;

const TIERS = [
  { maxOz: 8,   ground: 495,  priority: 895,  express: 2495 },
  { maxOz: 16,  ground: 695,  priority: 995,  express: 2795 },
  { maxOz: 32,  ground: 995,  priority: 1295, express: 3295 },
  { maxOz: 80,  ground: 1295, priority: 1795, express: 4495 },
  { maxOz: 160, ground: 1795, priority: 2495, express: 5995 },
];
const OVERWEIGHT = { ground: 2495, priority: 3495, express: 7995 };

export function rateForOunces(totalOz) {
  const t = TIERS.find((x) => totalOz <= x.maxOz) ?? OVERWEIGHT;
  return { cents: t.ground, label: 'USPS Ground' };
}

// Speed choices for checkout, cheapest first — all derived from the
// same weight tier. Not live carrier quotes: Stripe hosted checkout
// fixes shipping options before the address is known.
export function shippingChoicesForOunces(totalOz) {
  const t = TIERS.find((x) => totalOz <= x.maxOz) ?? OVERWEIGHT;
  return [
    { cents: t.ground,   label: 'USPS Ground',        minDays: 3, maxDays: 7 },
    { cents: t.priority, label: 'USPS Priority Mail', minDays: 2, maxDays: 3 },
    { cents: t.express,  label: 'Express (UPS 2nd Day Air)', minDays: 1, maxDays: 2 },
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
