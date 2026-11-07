/**
 * Single source of truth for T-Shirt Brothers business facts.
 *
 * Why this file exists: the same facts (address, hours, pickup city,
 * DTF gang-sheet rate) were hand-typed into a dozen components and
 * drifted. An SEO/AEO audit on 2026-10-23 found the homepage and the
 * classic quote page advertising DTF gang sheets "from $9/ft" while the
 * live pricing API (/api/gangsheet-store/config) was charging $11.99/ft
 * — the $9 was the original migration DEFAULT (900 cents) that nobody
 * updated after the real rate was set in admin.
 *
 * Rules for this file:
 *
 *  1. Nothing in here is a pricing CALCULATION. Prices that customers
 *     are actually charged come from the server (DB-backed admin
 *     settings). The numbers here are *advertised* figures used in
 *     marketing copy and structured data only.
 *  2. DTF_GANG_SHEET.standardRatePerFoot must be kept in sync with the
 *     `rate_standard_cents` admin setting. `scripts/check-business-facts.mjs`
 *     diffs the two against production and fails loudly when they drift,
 *     so this can't silently rot again.
 *  3. Do not add a claim here that isn't verified. Everything below was
 *     confirmed against the live API, the admin settings, or Doc
 *     directly on the date noted.
 */

/** Verified 2026-10-23 — business identity. */
export const BUSINESS = {
  /**
   * Machine-readable business name.
   *
   * Confirmed by Doc on 2026-10-23: the Google Business Profile reads
   * "TShirt Brothers" with no hyphen, so that is the canonical form for
   * every title, OG tag and schema `name`. The site must match GBP
   * exactly — a name mismatch weakens entity matching for both Google
   * and AI answer engines. Prose/body copy may still read "T-Shirt
   * Brothers"; this field is specifically the machine-readable name.
   */
  name: 'TShirt Brothers',
  legalName: 'TShirt Brothers',
  tagline: 'Custom Apparel, Printing & Embroidery Serving South Atlanta',
  url: 'https://tshirtbrothers.com',
  logo: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png',
  phone: '(470) 622-1392',
  phoneE164: '+14706221392',
  email: 'info@tshirtbrothers.com',
} as const;

/** Verified 2026-10-23 — the one and only physical production location. */
export const LOCATION = {
  streetAddress: '6010 Renaissance Parkway',
  addressLocality: 'Fairburn',
  addressRegion: 'GA',
  postalCode: '30213',
  addressCountry: 'US',
  latitude: 33.5668,
  longitude: -84.5808,
  /**
   * The shop is in FAIRBURN. Pickup and walk-ins happen here and
   * nowhere else. Copy must not imply a storefront in any other city —
   * the other cities below are *served*, not occupied.
   */
  pickupCity: 'Fairburn',
} as const;

/** Verified 2026-10-23 (matches /about, /faq, PaymentPage and JSON-LD). */
export const HOURS = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  opens: '08:00',
  closes: '20:00',
  display: 'Monday–Saturday, 8 AM – 8 PM',
  closedDisplay: 'Closed Sundays',
} as const;

/**
 * DTF gang-sheet advertised pricing. Mirrors the live admin settings
 * read from /api/gangsheet-store/config on 2026-10-23:
 *   standard 1199¢ · rush 1299¢ · hot_rush 1700¢ · shipping 699¢
 *   min 1 ft · max 10 ft
 *
 * The builder and checkout price from the server, NOT from this file.
 */
export const DTF_GANG_SHEET = {
  /**
   * The 22" roll, which is the advertised entry product. A 34" roll was
   * added later at a higher rate -- see `widths` below. Kept as a scalar
   * because a dozen components read it directly.
   */
  sheetWidthInches: 22,
  minFeet: 1,
  /**
   * Was 10 here while the API had been charging up to 20 since the 34"
   * launch -- caught by scripts/check-business-facts.mjs, which detected the
   * drift correctly but was wired into nothing, so nobody ever ran it. It is
   * now an npm script and a post-deploy step.
   */
  maxFeet: 20,
  standardRatePerFoot: 11.99,
  rushRatePerFoot: 12.99,
  hotRushRatePerFoot: 17.0,
  flatShipping: 6.99,
  /**
   * Every roll width we actually sell, verified against
   * /api/gangsheet-store/config on 2026-11-07. The 34" roll was shipped by
   * a separate change and never made it into this file, and the drift check
   * did not cover widths at all -- so it was invisible twice over.
   */
  widths: [
    { inches: 22, standardRatePerFoot: 11.99, rushRatePerFoot: 12.99, hotRushRatePerFoot: 17.0 },
    { inches: 34, standardRatePerFoot: 17.99, rushRatePerFoot: 18.99, hotRushRatePerFoot: 23.0 },
  ],
  /** Turnaround promises as configured in admin, verified 2026-10-23. */
  turnaround: {
    standard: 'Ready in 2 business days',
    rush: 'Ready next business day — order by 11:00 AM',
    hotRush: 'Ready same day — order by 10:00 AM',
  },
  /** Safe marketing phrase for the advertised entry price. */
  fromPriceLabel: '$11.99/ft',
} as const;

/**
 * Cities we genuinely serve from the Fairburn shop, with real drive
 * times. Used for areaServed in structured data and for the local
 * landing pages. Adding a city here is a business claim — confirm the
 * drive time before doing it.
 */
export const SERVICE_AREA_CITIES = [
  'Fairburn',
  'Fayetteville',
  'Peachtree City',
  'Tyrone',
  'Newnan',
  'Union City',
  'College Park',
  'Palmetto',
  'East Point',
  'South Fulton',
  'Atlanta',
] as const;

/** Production methods we actually offer in-house. */
export const PRINT_METHODS = [
  'Screen Printing',
  'DTF Transfers',
  'Embroidery',
  'Custom Vinyl',
] as const;
