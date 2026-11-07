// House markups — client mirror of server/lib/pricing.js.
//
// Two files rather than one shared package on purpose: the server is plain
// JS ESM and cannot import TypeScript without a build step, and adding a
// workspace package would mean an npm install on every checkout. Instead
// server/lib/pricing.test.js parses BOTH files and fails if the numbers
// disagree, so drift is a test failure rather than a silent pricing bug.
//
// Keep the constants below byte-identical to the server copy.

/** Quoted and invoiced work: cost × 1.7 ("70% over wholesale"). */
export const QUOTE_MARKUP = 1.7;

/** Retail shop and sale pages: wholesale × 2 ("TSB house 2x"). */
export const RETAIL_MARKUP = 2.0;

/** Round to cents, avoiding the usual float tail. */
export function toCents2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Sell price for a quoted line, from our cost. */
export function quotePrice(cost: number | string | null | undefined): number {
  const c = Number(cost);
  return Number.isFinite(c) && c > 0 ? toCents2(c * QUOTE_MARKUP) : 0;
}

type PricedProduct = {
  custom_price?: number | string | null;
  base_price?: number | string | null;
};

/**
 * Retail price for a catalog product.
 *
 * custom_price always wins when set — that is the override the shop uses for
 * house blanks and varsity jackets, and it must never be marked up again.
 * This exact `custom > 0 ? custom : wholesale * 2` shape was re-typed at
 * ShopPage, SalePage, InstantQuotePage (twice), FavoritesPage, AdminPage and
 * server/routes/instantQuote.js.
 */
export function retailPrice(p: PricedProduct | null | undefined): number {
  const custom = Number(p?.custom_price);
  if (Number.isFinite(custom) && custom > 0) return toCents2(custom);
  const wholesale = Number(p?.base_price);
  return Number.isFinite(wholesale) && wholesale > 0 ? toCents2(wholesale * RETAIL_MARKUP) : 0;
}
