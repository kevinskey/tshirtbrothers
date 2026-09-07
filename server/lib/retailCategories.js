// Retail-facing category groupings over S&S's wholesale taxonomy.
//
// The `products.category` column stores S&S's `baseCategory` verbatim
// ("Fleece - Premium - Hood", "T-Shirts - Core", …) — correct as the
// source of truth, but shopper-hostile in a storefront dropdown. This
// module maps those raw categories into the labels customers expect
// ("Hoodies", "T-Shirts") without touching the data or the sync.
//
// Any raw S&S category that isn't mapped here passes through unchanged,
// so a new S&S category can never silently disappear from the filter.

export const RETAIL_CATEGORIES = [
  { label: 'T-Shirts',             raw: ['T-Shirts - Core', 'T-Shirts - Premium'] },
  { label: 'Long Sleeve Tees',     raw: ['T-Shirts - Long Sleeve'] },
  { label: 'Hoodies',              raw: ['Fleece - Core - Hood', 'Fleece - Premium - Hood'] },
  { label: 'Crewneck Sweatshirts', raw: ['Fleece - Core - Crew', 'Fleece - Premium - Crew'] },
  { label: 'Polos',                raw: ['Polos'] },
  { label: 'Outerwear',            raw: ['Outerwear'] },
  { label: 'Knits & Layering',     raw: ['Knits & Layering'] },
  { label: 'Wovens',               raw: ['Wovens'] },
  { label: 'Bottoms',              raw: ['Bottoms'] },
  { label: 'Headwear',             raw: ['Headwear'] },
  { label: 'Bags',                 raw: ['Bags'] },
  { label: 'Accessories',          raw: ['Accessories'] },
];

// If `label` is a known retail label, return the raw S&S categories it
// covers; otherwise null (caller falls back to matching the value as a
// raw category, which keeps old links and admin tools working).
export function expandRetailCategory(label) {
  const needle = String(label ?? '').trim().toLowerCase();
  const hit = RETAIL_CATEGORIES.find((c) => c.label.toLowerCase() === needle);
  return hit ? hit.raw : null;
}

// Collapse a list of raw S&S categories into retail labels, in menu
// order, appending any unmapped raw categories alphabetically.
export function groupIntoRetailCategories(rawCategories) {
  const remaining = new Set(rawCategories);
  const labels = [];
  for (const c of RETAIL_CATEGORIES) {
    if (c.raw.some((r) => remaining.has(r))) {
      labels.push(c.label);
      c.raw.forEach((r) => remaining.delete(r));
    }
  }
  return [...labels, ...[...remaining].sort()];
}
