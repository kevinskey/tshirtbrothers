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
  { maxOz: 8,   cents: 495,  label: 'USPS Ground (up to 8 oz)' },
  { maxOz: 16,  cents: 695,  label: 'USPS Ground (up to 1 lb)' },
  { maxOz: 32,  cents: 995,  label: 'USPS Ground (up to 2 lb)' },
  { maxOz: 80,  cents: 1295, label: 'USPS Ground (up to 5 lb)' },
  { maxOz: 160, cents: 1795, label: 'USPS Ground (up to 10 lb)' },
];
const OVERWEIGHT = { cents: 2495, label: 'Ground freight (over 10 lb)' };

export function rateForOunces(totalOz) {
  for (const t of TIERS) {
    if (totalOz <= t.maxOz) return { cents: t.cents, label: t.label };
  }
  return OVERWEIGHT;
}

// Total parcel weight for a cart of { weightOz|null, qty } lines.
export function parcelOunces(lines) {
  const items = lines.reduce(
    (sum, l) => sum + (Number(l.weightOz) > 0 ? Number(l.weightOz) : DEFAULT_ITEM_OZ) * (l.qty || 1),
    0,
  );
  return items + PACKAGING_OZ;
}
