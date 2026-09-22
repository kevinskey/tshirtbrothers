// Custom Gift Club category classifier. jds_products has no category data
// (the JDS details endpoint is queried per-SKU and its snapshot never
// included one), so CGC derives shopper-facing collections from product
// names with deterministic keyword rules. The same function runs at
// publish time and in the one-shot backfill migration so new SKUs land in
// a collection automatically. Every product gets a category — anything
// unmatched falls into Personalized Gifts, so Shop All is always the full
// assortment and no product is silently dropped.

export const CGC_CATEGORIES = [
  'Personalized Gifts',
  'Drinkware',
  'Awards & Trophies',
  'Leather & Leatherette',
  'Hats & Patches',
  'Blanks & Supplies',
];

// Ordered rules — first hit wins. Word-boundary matching so "cap" doesn't
// hit "capacity" and "pen" doesn't hit "pendant" or "open".
const RULES = [
  // NOTE: the currently published jds_products set (3,443 SKUs as of
  // 2026-09-22) contains no real hats or patches — JDS carries them
  // (Richardson caps, laserable leatherette patches) but those SKUs were
  // never bulk-published. Terms here are narrow so bottle-cap openers and
  // "Pick of the Patch" candles don't pollute the collection; publish the
  // hat/patch SKUs through the admin to fill it.
  ['Hats & Patches', [
    'trucker hat', 'trucker cap', 'baseball cap', 'richardson', 'snapback',
    'beanie', 'visor', 'leatherette patch', 'hat patch', 'iron-on patch',
    'laserable patch',
  ]],
  ['Blanks & Supplies', [
    'sublimation blank', 'sublimatable', 'laserable blank', 'engraving blank',
    'adhesive', 'cleaner', 'polish', 'tape', 'spray', 'applicator',
    'transfer paper', 'transfer sheet', 'butcher paper', 'protective paper',
    'shrink wrap', 'heat press', 'press pad', 'press pillow', 'attachment',
    'silicone wrap', 'silicone band', 'stylus', 'squeegee', 'lens cloth',
    'color chart', 'sample set', 'sample kit', 'display', 'easel', 'stand only',
    'refill', 'ink', 'toner', 'cartridge', 'sawgrass', 'epson', 'printer',
    'marking compound', 'cermark', 'laser foil', 'mask', 'blank insert',
  ]],
  ['Drinkware', [
    'tumbler', 'mug', 'mugs', 'bottle', 'stein', 'flask', 'pint', 'pilsner',
    'shot glass', 'wine glass', 'wine glasses', 'stemless', 'goblet',
    'decanter', 'growler', 'koozie', 'can cooler', 'cup', 'cups', 'glass set',
    'whiskey glass', 'whiskey glasses', 'rocks glass', 'highball', 'lowball',
    'juice glass', 'beverage glass', 'shaker', 'carafe', 'sipper', 'straw',
    'water bottle', 'sports bottle', 'travel mug', 'coffee', 'latte',
    'wine tumbler', 'quencher', 'duo', 'hydro',
  ]],
  ['Awards & Trophies', [
    'award', 'awards', 'trophy', 'trophies', 'plaque', 'plaques', 'medal',
    'medallion', 'obelisk', 'crystal', 'acrylic star', 'star award',
    'perpetual', 'recognition', 'achievement', 'resin', 'cup trophy',
    'gavel', 'eagle', 'flame', 'summit', 'pinnacle', 'zenith', 'apex',
    'glass art', 'art glass', 'paperweight',
  ]],
  ['Leather & Leatherette', [
    'leatherette', 'leather', 'wallet', 'portfolio', 'padfolio', 'journal',
    'notebook', 'notepad', 'passport', 'luggage tag', 'valet', 'toiletry',
    'business card holder', 'card case', 'money clip', 'bookmark',
  ]],
  // Distinctly gift-shaped items named explicitly so the catch-all stays
  // honest rather than doing the work by default.
  ['Personalized Gifts', [
    'frame', 'ornament', 'cutting board', 'charcuterie', 'keychain',
    'key chain', 'key ring', 'keyring', 'pen', 'pencil', 'night light',
    'nightlight', 'puzzle', 'plate', 'sign', 'clock', 'coaster', 'coasters',
    'candle', 'music box', 'jewelry box', 'gift box', 'bag', 'tote',
    'apron', 'blanket', 'pillow', 'towel', 'magnet', 'mousepad',
    'mouse pad', 'dog tag', 'pet tag', 'id tag', 'bottle opener',
    'wine stopper', 'cork', 'bamboo', 'walnut', 'maple', 'cherry', 'slate',
    'marble', 'ceramic', 'photo panel', 'photo print', 'canvas', 'plush',
    'stuffed', 'lanyard', 'wristband', 'bracelet', 'necklace', 'charm',
  ]],
];

const MATCHERS = RULES.map(([category, terms]) => ({
  category,
  res: terms.map((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i')),
}));

export function categorizeCgcProduct(name) {
  const text = String(name || '');
  for (const { category, res } of MATCHERS) {
    if (res.some((re) => re.test(text))) return category;
  }
  return 'Personalized Gifts';
}
