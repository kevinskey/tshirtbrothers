// Custom Gift Club — Holiday Gifts launch collection.
//
// Four launch products, each pinned to EXACT jds_products SKUs (the same
// catalog + publish pipeline the rest of CGC sells from — no second JDS
// integration). Live product data (name, image, retail price, active) is
// joined from jds_products at request time in routes/cgc.js; this file
// only holds the merchandising: which blanks, which engraving layouts,
// which personalization fields and their limits.
//
// `published: false` keeps a product visible but NOT buyable — the PDP
// renders with the buy button replaced by honest "launching soon" copy.
// Flip to true ONLY after, for that product: (1) supplier SKU mapping
// confirmed, (2) pricing verified against measured engraving time +
// packaging cost (see docs/cgc-holiday-launch.md), (3) an engraved sample
// approved, (4) the fulfillment steps written down. `production_note` is
// shown on the PDP only when set — never invent turnaround or delivery
// promises here; leave it null until the numbers are real.

export const HOLIDAY_LAUNCH = [
  {
    slug: 'personalized-tumbler',
    title: 'Personalized Tumbler',
    intro: 'Polar Camel 20 oz. ringneck tumbler with standard lid, laser engraved with your name.',
    published: false,
    production_note: null,
    variants: [
      { sku: 'LTM7216', label: 'Black' },
      { sku: 'LTM7201', label: 'Stainless' },
      { sku: 'LTM7211', label: 'Navy Blue' },
      { sku: 'LTM7214', label: 'White' },
      { sku: 'LTM7203', label: 'Red' },
    ],
    designs: [
      { key: 'name-script', label: 'Name in Script', desc: 'First name in a flowing script, centered on the front.' },
      { key: 'monogram', label: 'Classic Monogram', desc: 'One large initial with the full name beneath it.' },
      { key: 'name-year', label: 'Name + Est. Year', desc: 'Name in block lettering over an established year.' },
    ],
    fields: [
      { key: 'name', label: 'Name', max: 20, required: true, help: 'Exactly as it should be engraved — up to 20 characters.' },
      { key: 'year', label: 'Year', max: 4, required: false, help: 'Used by the Name + Est. Year layout.' },
    ],
    limits: 'One engraving location (front). Up to 20 characters — longer names engrave at a smaller letter size.',
  },
  {
    slug: 'family-cutting-board',
    title: 'Family Cutting Board',
    intro: 'Acacia paddle-shaped cutting board, 13 1/2" x 7", laser engraved with your family name.',
    published: false,
    production_note: null,
    variants: [
      { sku: 'GFT2323', label: 'Acacia' },
    ],
    // Handwritten-recipe engraving is intentionally NOT offered at launch —
    // that artwork process gets tested before it's promised (Doc, 2026-09-22).
    designs: [
      { key: 'family-est', label: 'Family Name & Est.', desc: 'Family name across the center with your established year beneath.' },
      { key: 'kitchen-of', label: 'Kitchen Of', desc: '"The ___ Kitchen" in mixed lettering, centered.' },
      { key: 'monogram-wreath', label: 'Monogram Wreath', desc: 'Single initial inside an engraved laurel wreath, family name below.' },
    ],
    fields: [
      { key: 'name', label: 'Family name', max: 24, required: true, help: 'Up to 24 characters — usually the last name.' },
      { key: 'year', label: 'Est. year', max: 4, required: false, help: 'Used by the Family Name & Est. layout.' },
    ],
    limits: 'One engraved side. Family name up to 24 characters; the board is food-safe after engraving.',
  },
  {
    slug: 'christmas-ornament',
    title: 'Christmas Ornament',
    intro: 'Laserable leatherette tree ornament with hanging string, engraved both meaningful and light.',
    published: false,
    production_note: null,
    variants: [
      { sku: 'GFT1113', label: 'Rustic/Gold' },
      { sku: 'GFT1108', label: 'Black/Gold' },
      { sku: 'GFT1112', label: 'Black/Silver' },
      { sku: 'GFT1106', label: 'Light Brown' },
    ],
    designs: [
      { key: 'family', label: 'Family', desc: 'Family name with the year — a keepsake for the whole household.' },
      { key: 'first-home', label: 'First Home', desc: '"Our First Home" with your street line and the year.' },
      { key: 'pet', label: 'Pet', desc: 'Your pet’s name with a paw motif and the year.' },
    ],
    fields: [
      { key: 'name', label: 'Name(s)', max: 30, required: true, help: 'Family name, street line, or pet name — up to 30 characters.' },
      { key: 'year', label: 'Year', max: 4, required: false, help: 'Shown beneath the name on every layout.' },
    ],
    limits: 'Front engraving only. Up to 30 characters on the name line — shorter reads better at ornament size.',
  },
  {
    slug: 'personalized-journal',
    title: 'Personalized Journal',
    intro: 'Laserable leatherette portfolio with lined notepad, 9 1/2" x 12", engraved with a name or initials.',
    published: false,
    production_note: null,
    variants: [
      { sku: 'GFT246A', label: 'Black/Gold' },
      { sku: 'GFT612', label: 'Black/Silver' },
      { sku: 'GFT186', label: 'Dark Brown' },
      { sku: 'GFT346', label: 'Gray' },
    ],
    designs: [
      { key: 'name-corner', label: 'Name, Lower Corner', desc: 'Full name engraved small in the lower right corner.' },
      { key: 'initials-center', label: 'Initials, Centered', desc: 'Two or three initials engraved large in the center.' },
      { key: 'name-title', label: 'Name + Title Line', desc: 'Name with a short second line — a role, verse, or date.' },
    ],
    fields: [
      { key: 'name', label: 'Name or initials', max: 24, required: true, help: 'A full name (up to 24 characters) or 2–3 initials.' },
      { key: 'line2', label: 'Second line', max: 30, required: false, help: 'Used by the Name + Title Line layout.' },
    ],
    limits: 'One engraving location. Name up to 24 characters or 2–3 initials; second line up to 30 characters.',
  },
];

export function findHolidayProduct(slug) {
  return HOLIDAY_LAUNCH.find((p) => p.slug === String(slug || '')) || null;
}
