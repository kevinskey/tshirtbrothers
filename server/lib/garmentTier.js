// Quality tier from wholesale price.
//
// The instant-quote tiers (Standard / Premium / Ultra) are price lines,
// not brands: each garment × tier row in instant_quote_garments carries
// the WHOLESALE cost of that tier's canonical blank (T-shirt: Softstyle
// $2.95 / Next Level $4.03 / Comfort Colors $6.29 — see migrations/
// tshirt_tiers_brand_wholesale.sql). So a blank the customer picked in
// the Design Studio belongs to whichever tier's anchor its own wholesale
// price sits closest to. The boundary between two adjacent tiers is the
// midpoint of their anchors; anything beyond the top anchor is Ultra,
// anything below the bottom one is Standard.
//
// Anchors come from the live pricing table, so editing a tier's base
// cost in the admin pricing editor moves the boundaries with it — there
// is no second list of thresholds to keep in sync (Kevin, 2026-11-09:
// "tiers must be determined by wholesale price levels").

const TIER_ORDER = ['Standard', 'Premium', 'Ultra'];

/**
 * @param {number|string|null|undefined} wholesale  the blank's wholesale price
 * @param {Array<{ quality_tier: string, base_cost: number|string, active?: boolean }>} anchors
 *        the garment family's tier rows (any order; inactive rows ignored)
 * @returns {{ quality_tier: string, boundaries: Array<{ below: number, tier: string }> } | null}
 *          null when the wholesale price is unusable or no anchors exist
 */
export function tierForWholesale(wholesale, anchors) {
  const w = Number(wholesale);
  if (!Number.isFinite(w) || w <= 0) return null;

  const rows = (anchors || [])
    .filter((a) => a && a.active !== false && TIER_ORDER.includes(a.quality_tier))
    .map((a) => ({ tier: a.quality_tier, cost: Number(a.base_cost) }))
    .filter((a) => Number.isFinite(a.cost) && a.cost > 0)
    // Tier order, not cost order: a mis-entered grid (Premium priced
    // under Standard) must not silently relabel the tiers.
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  if (rows.length === 0) return null;

  // boundaries[i] = the ceiling of rows[i]; the last tier has none.
  const boundaries = [];
  for (let i = 0; i < rows.length - 1; i++) {
    boundaries.push({ below: (rows[i].cost + rows[i + 1].cost) / 2, tier: rows[i].tier });
  }
  const hit = boundaries.find((b) => w < b.below);
  return { quality_tier: hit ? hit.tier : rows[rows.length - 1].tier, boundaries };
}

/**
 * Pick the pricing-table family ('T-shirt', 'Hoodie', …) for a catalog
 * row, by its name and supplier category. Mirrors studioProductKey() on
 * the client; the client sends its family along when it has one, this
 * is the fallback.
 */
export function garmentFamilyFor(name, category) {
  const n = `${category ?? ''} ${name ?? ''}`.toLowerCase();
  if (/hoodie|hooded|\bhood\b/.test(n)) return 'Hoodie';
  if (/sweatshirt|crewneck|crew\b|fleece/.test(n)) return 'Sweatshirt';
  if (/tank|sleeveless/.test(n)) return 'Tank';
  if (/polo/.test(n)) return 'Polo';
  if (/long[\s-]*sleeve/.test(n)) return 'Long-sleeve';
  if (/\bcap\b|\bhat\b|beanie|trucker|headwear/.test(n)) return 'Hat';
  return 'T-shirt';
}
