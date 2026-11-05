// One place that decides what a store_agreements.fee_config_json may contain.
//
// Why this exists: services/storeOrderCapture.js computeLineSplit reads
//
//     percent = Number(override.percent_of_retail ?? fee_config?.percent_of_retail ?? 0)
//
// so an agreement that omits `percent_of_retail` gives TSB **0%** and credits
// the store 100% of retail. Two writers got that wrong in different ways:
//
//   routes/gleeworldProvisioning.js wrote only contribution_type /
//     contribution_value -- which are DISPLAY-ONLY keys -- so every store
//     provisioned through GleeWorld ledgered TSB $0 on every order.
//   routes/stores.js POST /:slug/agreements took fee_config_json straight
//     from the request body with only a `typeof === 'object'` check, so a
//     partner holding a store API key could post {percent_of_retail: 0},
//     freeze it onto a product, and collect 100% of retail indefinitely.
//
// routes/adminGroupStores.js already did the right translation; this is that
// logic, extracted, so there is one answer instead of three.

export const MAX_PER_ITEM_CENTS = 1_000_00; // $1,000/item — a typo guard, not a business rule

/**
 * Canonical fee config from a fundraiser-style contribution.
 *
 * A contribution of N% to the organization means TSB keeps (100 - N)%.
 * contribution_* are carried through for display; percent_of_retail and
 * min_per_item_cents are what actually move money.
 */
export function feeConfigFromContribution(fundraiser = {}) {
  const type = fundraiser?.contribution_type === 'flat' ? 'flat' : 'percent';
  const raw = Number(fundraiser?.contribution_value);
  const value = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  const contribPct = type === 'percent' ? value : 0;
  return {
    percent_of_retail: 100 - contribPct,
    min_per_item_cents: 0,
    contribution_type: type,
    contribution_value: value,
  };
}

/**
 * Clamp a caller-supplied fee_config_json into range.
 *
 * Throws on a shape that isn't an object. Unknown keys are preserved (the
 * per_product map is real and legitimately open-ended) but every number that
 * decides a split is bounded, and percent_of_retail is always present so it
 * can never silently default to zero.
 */
export function normalizeFeeConfig(input, { defaultPercentOfRetail = 100 } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('fee_config_json must be an object');
  }

  const pct = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
  };
  const cents = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(MAX_PER_ITEM_CENTS, Math.max(0, Math.round(n)));
  };

  const out = {
    ...input,
    percent_of_retail: pct(input.percent_of_retail, defaultPercentOfRetail),
    min_per_item_cents: cents(input.min_per_item_cents),
  };

  if (input.contribution_type !== undefined) {
    out.contribution_type = input.contribution_type === 'flat' ? 'flat' : 'percent';
  }
  if (input.contribution_value !== undefined) {
    out.contribution_value = pct(input.contribution_value, 0);
  }

  // Per-product deal terms (Sensory Seasons has real ones) get the same
  // treatment — they override the store-wide numbers, so leaving them
  // unclamped would reopen the hole one product at a time.
  if (input.per_product && typeof input.per_product === 'object' && !Array.isArray(input.per_product)) {
    out.per_product = {};
    for (const [k, v] of Object.entries(input.per_product)) {
      if (!v || typeof v !== 'object') continue;
      const entry = { ...v };
      if (v.percent_of_retail !== undefined) entry.percent_of_retail = pct(v.percent_of_retail, defaultPercentOfRetail);
      if (v.min_per_item_cents !== undefined) entry.min_per_item_cents = cents(v.min_per_item_cents);
      out.per_product[k] = entry;
    }
  }

  return out;
}
