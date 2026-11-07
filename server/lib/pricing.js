// House markups, in one place.
//
// TSB prices blanks two different ways, and until now neither number had a
// name and the formula was re-typed at eight sites:
//
//   QUOTE_MARKUP  (1.7)  quoted/invoiced work -- a bulk job, priced by hand
//   RETAIL_MARKUP (2.0)  /shop and /sale -- somebody buying one shirt
//
// An audit flagged the mismatch as a bug. It is not: charging more per piece
// for a single retail shirt than for a 144-piece run is ordinary pricing,
// and the database agrees -- rhinestone_pricing_settings.garment_markup
// defaults to 2.000 with the comment "TSB house 2x". The real problem was
// that eight copies of `base_price * 2` and a bare `1.7` could drift apart
// with nothing to catch it.
//
// VALUES ARE UNCHANGED by this refactor. If either should move, change it
// here and both channels follow.
//
// Mirrored by client/src/lib/pricing.ts because the server is plain JS and
// the client is TypeScript; lib/pricing.test.js parses both files and fails
// if the numbers ever disagree.

/** Quoted and invoiced work: cost x 1.7 ("70% over wholesale"). */
export const QUOTE_MARKUP = 1.7;

/** Retail shop and sale pages: wholesale x 2 ("TSB house 2x"). */
export const RETAIL_MARKUP = 2.0;

/** Round a number to cents, avoiding the usual float tail. */
export function toCents2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Sell price for a quoted line, from our cost. */
export function quotePrice(cost) {
  const c = Number(cost);
  return Number.isFinite(c) && c > 0 ? toCents2(c * QUOTE_MARKUP) : 0;
}

/**
 * Retail price for a catalog product.
 *
 * custom_price always wins when set -- that is the override the shop uses
 * for house blanks and varsity jackets, and it must never be re-marked-up.
 */
export function retailPrice(p) {
  // Optional chaining, not a destructuring default: `= {}` only covers
  // undefined, so retailPrice(null) threw — and a null product row is
  // exactly what a failed lookup hands you.
  const custom = Number(p?.custom_price);
  if (Number.isFinite(custom) && custom > 0) return toCents2(custom);
  const wholesale = Number(p?.base_price);
  return Number.isFinite(wholesale) && wholesale > 0 ? toCents2(wholesale * RETAIL_MARKUP) : 0;
}

// DELIBERATELY NOT HERE: the two ".99" rounders. routes/jdsStore.js rounds
// up to the next .99; services/apcCatalog.js rounds to .99 under $100 and to
// whole dollars above. An audit called that an inconsistency, but they are
// different brands with different price ceilings, and both are commented as
// intentional. Merging them would change live prices on one of the two
// storefronts to fix a tidiness complaint, so they stay where they are.
