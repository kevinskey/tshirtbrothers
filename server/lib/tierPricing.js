// Quantity-break pricing for the Custom Gift Club storefront.
//
// ONE function decides what a unit costs at a given quantity, and both the
// product page and the checkout call it. That is the whole point of the
// file: a ladder shown on the page but not applied at checkout — or applied
// differently — is a customer charged a price they were not quoted, and it
// is the kind of mismatch nobody notices until a card statement arrives.
//
// Prices here are BLANK prices. Personalization is added on top per unit by
// the caller, so the engraved price falls out of the tier instead of needing
// a second ladder kept in step with this one.

/**
 * Normalise whatever came out of the database into a usable ladder.
 *
 * Returns [] for anything malformed rather than throwing: a broken ladder
 * must degrade to flat pricing, never to a 500 on the shop page or — far
 * worse — to a zero.
 */
export function normalizeTiers(raw) {
  if (!Array.isArray(raw)) return [];
  const tiers = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const minQty = Number(t.min_qty);
    const cents = Number(t.unit_price_cents);
    if (!Number.isInteger(minQty) || minQty < 1) continue;
    if (!Number.isFinite(cents) || cents <= 0) continue;
    tiers.push({ min_qty: minQty, unit_price_cents: Math.round(cents) });
  }
  // Ascending by quantity, and a duplicate min_qty keeps the CHEAPER one —
  // if two rules could apply the customer gets the better of them.
  tiers.sort((a, b) => a.min_qty - b.min_qty || a.unit_price_cents - b.unit_price_cents);
  return tiers.filter((t, i) => i === 0 || t.min_qty !== tiers[i - 1].min_qty);
}

/**
 * The blank unit price for `qty`, in cents.
 *
 * The applicable tier is the LAST one whose min_qty <= qty. With no ladder,
 * or a quantity below the first tier, the flat retail price stands — which
 * is what every product published before tiers existed does.
 */
export function unitPriceCents(product, qty) {
  const flat = Number(product?.retail_price_cents) || 0;
  const n = Number.isFinite(Number(qty)) ? Math.max(1, Math.floor(Number(qty))) : 1;
  const tiers = normalizeTiers(product?.price_tiers);
  if (!tiers.length) return flat;

  let price = flat;
  for (const t of tiers) {
    if (n >= t.min_qty) price = t.unit_price_cents;
    else break;
  }
  // A ladder must never price ABOVE the flat price — that would punish a
  // customer for the shop having configured tiers at all.
  return Math.min(price, flat || price);
}

/**
 * The ladder as the product page should present it: each tier with the
 * quantity range it covers. Used for display only; `unitPriceCents` is what
 * money is calculated from.
 */
export function tierTable(product) {
  const tiers = normalizeTiers(product?.price_tiers);
  if (!tiers.length) return [];
  return tiers.map((t, i) => ({
    min_qty: t.min_qty,
    max_qty: i + 1 < tiers.length ? tiers[i + 1].min_qty - 1 : null,
    unit_price_cents: t.unit_price_cents,
  }));
}

/**
 * What the customer saves per unit at this quantity, against buying one.
 * Zero when there is no ladder or they are in the first tier.
 */
export function savingsCents(product, qty) {
  const one = unitPriceCents(product, 1);
  const here = unitPriceCents(product, qty);
  return Math.max(0, one - here);
}
