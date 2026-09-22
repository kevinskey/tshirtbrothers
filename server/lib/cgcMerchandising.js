// Custom Gift Club curated merchandising: recipient / occasion / budget
// definitions for the homepage gift finder and the Shop by Occasion nav.
// These are OUR editorial mappings onto the JDS catalog — JDS supplies no
// recipient/occasion data, so each option resolves to catalog search
// terms, category filters, and/or price bounds that the products endpoint
// already supports. Every option must resolve to a non-empty result set
// against the live catalog (verified in scratch tests at build time).

// NOTE: search strings are one token of |-alternatives. The products
// endpoint splits search on whitespace and ANDs the pieces, so an
// alternative here must be a single word ("charcuterie", not
// "cutting board") or the phrase gets torn apart.
export const CGC_RECIPIENTS = [
  { key: 'for-her', label: 'For Her', search: 'heart|pink|jewelry|tote|candle|rose' },
  { key: 'for-him', label: 'For Him', search: 'whiskey|flask|golf|grill|knife|beard' },
  { key: 'kids', label: 'Kids & Teens', search: 'bottle|ornament|game|baseball|basketball|soccer|volleyball' },
  { key: 'couples', label: 'Couples', search: 'wedding|anniversary|heart|family|wine' },
  { key: 'coworkers', label: 'Coworkers', search: 'desk|pen|portfolio|padfolio|mousepad|clock' },
  { key: 'coaches-teams', label: 'Coaches & Teams', category: 'Awards & Trophies' },
  { key: 'pets', label: 'Pet Lovers', search: 'pet|dog|cat|paw|leash|bone' },
];

export const CGC_OCCASIONS = [
  { key: 'birthday', label: 'Birthday', search: 'birthday|celebrate|cake|party' },
  { key: 'wedding', label: 'Wedding & Anniversary', search: 'wedding|anniversary|heart|toasting|champagne' },
  { key: 'graduation', label: 'Graduation', search: 'frame|plaque|pen|portfolio|padfolio|journal' },
  { key: 'retirement', label: 'Retirement', search: 'plaque|clock|pen|desk|award|whiskey' },
  { key: 'recognition', label: 'Awards & Recognition', category: 'Awards & Trophies' },
  { key: 'holiday', label: 'Holiday', search: 'christmas|ornament|holiday|santa|snowman|stocking' },
  { key: 'housewarming', label: 'Housewarming', search: 'cutting|charcuterie|coaster|kitchen|home|serving' },
  { key: 'sports', label: 'Sports & Fan Gifts', search: 'baseball|basketball|football|soccer|golf|volleyball|hockey' },
];

export const CGC_BUDGETS = [
  { key: 'under-25', label: 'Under $25', maxCents: 2500 },
  { key: '25-50', label: '$25 – $50', minCents: 2500, maxCents: 5000 },
  { key: '50-100', label: '$50 – $100', minCents: 5000, maxCents: 10000 },
  { key: 'over-100', label: '$100 & Up', minCents: 10000 },
];

export function findOption(list, key) {
  return list.find((o) => o.key === key) || null;
}
