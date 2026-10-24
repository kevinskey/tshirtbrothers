// Where a store's REAL storefront lives, and what branding does to it.
//
// Most stores render through the shared store-shop front end at
// /stores/:slug, and their brand_json (colour, logo, banner) drives it.
//
// Sister brands do not. Live Hard Truth is a designed front end of its own
// under client/src/lht — its own route, its own palette, its own header and
// footer — and it never reads brand_json. /stores/live-hard-truth renders
// the GENERIC storefront for it, which is not what any shopper sees.
//
// Both facts have to be stated somewhere, because the admin Branding panel
// was previewing a hand-drawn mock of the generic chrome and presenting it
// as the store. For LHT that mock was wrong twice: wrong layout, and
// controls that change nothing.

export interface StorefrontInfo {
  /** Same-origin path to the real storefront. Same-origin matters: the
   *  site sends X-Frame-Options: SAMEORIGIN, so a preview iframe can use
   *  tshirtbrothers.com/… but never the store's own subdomain. */
  path: string;
  /** Does this storefront actually read brand_json? */
  themeable: boolean;
  /** Set for sister brands — what their branding IS still used for. */
  note?: string;
}

// Keyed by store slug. Grows when a sister brand gets its own route in
// App.tsx; the two belong together.
const BESPOKE: Record<string, StorefrontInfo> = {
  'live-hard-truth': {
    path: '/live-hard-truth',
    themeable: false,
    note:
      'Live Hard Truth has its own designed storefront, so the colour, logo '
      + 'and banner below do not change it — its palette and header are part '
      + 'of the brand itself. They are still used on the owner sign-in screen '
      + 'and the store directory card. To change the shop itself, use the '
      + 'Storefront tab (wording and hero image) or edit client/src/lht.',
  },
};

export function storefrontInfo(slug: string): StorefrontInfo {
  return BESPOKE[slug] ?? { path: `/stores/${slug}`, themeable: true };
}
