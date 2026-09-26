// Holiday card template catalog for /holiday-cards. Each template is a
// finished design image (client/public/cgc/cards/) plus the filterable
// attributes the gallery faceting runs on. `image` is optional so a
// data-only entry can still fall back to the generated SVG preview
// (CardTemplatePreview) while its artwork is in progress.

export type CardColor =
  | 'Red' | 'Green' | 'Blue' | 'White' | 'Cream' | 'Black' | 'Gold' | 'Pink' | 'Gray';

export type CardTemplate = {
  id: string;
  name: string;
  photos: number; // 0–6
  greeting: 'Christmas' | 'Holiday' | 'New Year' | 'Religious' | 'Hanukkah';
  recipient: 'Friends & Family' | 'Business';
  style: 'Classic Christmas' | 'Elegant' | 'Modern' | 'Rustic' | 'Whimsical' | 'Minimal' | 'Bold & Colorful' | 'Floral';
  orientation: 'Vertical' | 'Horizontal';
  size: '5" x 7"' | '6" x 9"' | '5.5" x 5.5"' | '4" x 8"';
  fold: 'Flat' | 'Folded';
  foil: 'None' | 'Gold Foil' | 'Silver Foil' | 'Red Foil';
  colors: CardColor[];
  image?: string;  // finished design artwork; falls back to SVG preview
  bg: string;      // fallback-preview background hex
  accent: string;  // fallback-preview accent hex
  ink: string;     // fallback-preview text hex
  headline: string;
  font: 'serif' | 'script' | 'sans';
};

type Row = [
  string, string, number, CardTemplate['greeting'], CardTemplate['recipient'],
  CardTemplate['style'], CardTemplate['fold'], CardTemplate['foil'], CardColor[],
  string, // headline
];

// All current designs are flat-printed as 5" x 7" verticals unless the
// fold column says otherwise; art lives at /cgc/cards/<id>.jpg.
const rows: Row[] = [
  // id, name, photos, greeting, recipient, style, fold, foil, colors, headline
  ['joy-crimson-trio', 'Crimson Joy', 3, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Flat', 'None', ['Red', 'Cream'], 'JOY'],
  ['noel-navy-gold', 'Navy Noel', 2, 'Christmas', 'Friends & Family', 'Elegant', 'Flat', 'Gold Foil', ['Blue', 'Gold'], 'Noel'],
  ['classic-green-frame', 'Classic Green Frame', 1, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Flat', 'None', ['Green', 'Cream', 'White'], 'Merry Christmas'],
  ['gilded-wreath', 'Gilded Wreath', 1, 'Christmas', 'Friends & Family', 'Elegant', 'Flat', 'Gold Foil', ['Cream', 'Gold'], 'Merry Christmas'],
  ['snowline-trio', 'Snowline', 3, 'Holiday', 'Friends & Family', 'Minimal', 'Flat', 'None', ['White', 'Blue'], 'Happy Holidays'],
  ['fa-la-la-pink', 'Fa La La', 1, 'Christmas', 'Friends & Family', 'Whimsical', 'Flat', 'None', ['Pink', 'Red'], 'Fa La La La La'],
  ['cream-quad', 'Cozy Cream Collage', 4, 'Christmas', 'Friends & Family', 'Rustic', 'Flat', 'None', ['Cream'], 'Merry Christmas'],
  ['merry-bright-pop', 'Merry & Bright Pop', 1, 'Christmas', 'Friends & Family', 'Bold & Colorful', 'Flat', 'None', ['Red', 'Pink'], 'Merry & Bright'],
  ['peace-on-earth', 'Peace on Earth', 1, 'Religious', 'Friends & Family', 'Minimal', 'Flat', 'None', ['White', 'Gray'], 'Peace on Earth'],
  ['holly-jolly-green', 'Holly Jolly', 2, 'Christmas', 'Friends & Family', 'Whimsical', 'Flat', 'None', ['Green', 'Red', 'Cream'], 'Holly Jolly'],
  ['hello-2027', 'Hello 2027', 5, 'New Year', 'Friends & Family', 'Modern', 'Flat', 'None', ['White', 'Blue', 'Green'], 'Hello 2027'],
  ['happy-holidays-six', 'Six-Photo Holidays', 6, 'Holiday', 'Friends & Family', 'Modern', 'Flat', 'None', ['White', 'Green'], 'Happy Holidays'],
  ['o-holy-night', 'O Holy Night', 1, 'Religious', 'Friends & Family', 'Elegant', 'Flat', 'Gold Foil', ['Cream', 'Gold'], 'O Holy Night'],
  ['cheers-new-year', 'Cheers to the New Year', 1, 'New Year', 'Friends & Family', 'Elegant', 'Flat', 'Gold Foil', ['Black', 'Gold'], 'Cheers to the New Year'],
  ['crimson-folded', 'Crimson Keepsake', 1, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Folded', 'None', ['Red', 'Gold', 'Cream'], 'Merry Christmas'],
  ['merry-bright-six', 'Merry & Bright Gallery', 6, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Flat', 'None', ['White', 'Green', 'Gold'], 'Merry & Bright'],
  ['joy-joy-joy', 'Joy Joy Joy', 3, 'Christmas', 'Friends & Family', 'Whimsical', 'Flat', 'None', ['Cream', 'Green', 'Red', 'Gold'], 'joy joy joy'],
  ['warm-winter-wishes', 'Warm Winter Wishes', 2, 'Holiday', 'Friends & Family', 'Rustic', 'Flat', 'None', ['Green', 'Cream'], 'Warm Winter Wishes'],
  ['gratitude-business', 'With Gratitude', 1, 'Holiday', 'Business', 'Elegant', 'Folded', 'Gold Foil', ['Cream', 'Gold'], 'With Gratitude This Season'],
  ['golden-generations', 'Golden Generations', 1, 'Christmas', 'Friends & Family', 'Elegant', 'Flat', 'Gold Foil', ['Cream', 'Gold'], 'Merry Christmas'],
  ['greetings-family', 'Greetings from Our Family', 2, 'Christmas', 'Friends & Family', 'Rustic', 'Flat', 'None', ['Cream', 'Red'], 'Greetings from Our Family'],
  ['candy-corner', 'Candy Corner', 1, 'Christmas', 'Friends & Family', 'Bold & Colorful', 'Flat', 'None', ['White', 'Red'], 'Merry Christmas'],
  ['navy-triptych', 'Navy Triptych', 3, 'Holiday', 'Friends & Family', 'Classic Christmas', 'Flat', 'None', ['Blue', 'White'], 'Happy Holidays'],
  ['ivory-script', 'Ivory Script', 1, 'Christmas', 'Friends & Family', 'Minimal', 'Flat', 'None', ['Cream', 'White'], 'merry christmas'],
  ['let-it-snow', 'Let It Snow', 2, 'Holiday', 'Friends & Family', 'Whimsical', 'Flat', 'None', ['Pink'], 'Let It Snow'],
  ['onward-upward', 'Onward & Upward', 1, 'New Year', 'Business', 'Modern', 'Flat', 'None', ['Black', 'Gold'], 'Onward & Upward'],
];

export const CARD_TEMPLATES: CardTemplate[] = rows.map(
  ([id, name, photos, greeting, recipient, style, fold, foil, colors, headline]) => ({
    id, name, photos, greeting, recipient, style, fold, foil, colors, headline,
    orientation: 'Vertical' as const,
    size: '5" x 7"' as const,
    image: `/cgc/cards/${id}.jpg`,
    bg: '#f6f1e7', accent: '#b98a2e', ink: '#3a2f1e',
    font: 'serif' as const,
  }),
);

// Quantity price breaks (cents each, flat cards). Folded adds a flat
// per-card upcharge. Tracks just under big-box print pricing.
export const CARD_PRICE_TIERS = [
  { qty: 10, cents: 249 },
  { qty: 25, cents: 189 },
  { qty: 50, cents: 139 },
  { qty: 100, cents: 95 },
  { qty: 250, cents: 79 },
];
export const FOLDED_UPCHARGE_CENTS = 40;
// Headline price for the hero ("under $1 each at 100+").
export const CARD_HERO_PRICE = { qty: 100, cents: 95 };

export type FilterGroup = {
  key: 'photos' | 'color' | 'greeting' | 'recipient' | 'style' | 'orientation' | 'size' | 'fold' | 'foil';
  label: string;
  multi: boolean;
  options: string[];
  matches: (t: CardTemplate, option: string) => boolean;
};

export const FILTER_GROUPS: FilterGroup[] = [
  {
    key: 'photos', label: 'Number of Photos', multi: true,
    options: ['0', '1', '2', '3', '4', '5+'],
    matches: (t, o) => (o === '5+' ? t.photos >= 5 : t.photos === Number(o)),
  },
  {
    key: 'color', label: 'Color', multi: true,
    options: ['Red', 'Green', 'Blue', 'White', 'Cream', 'Black', 'Gold', 'Pink', 'Gray'],
    matches: (t, o) => t.colors.includes(o as CardColor),
  },
  {
    key: 'greeting', label: 'Greeting', multi: true,
    options: ['Christmas', 'Holiday', 'New Year', 'Religious', 'Hanukkah'],
    matches: (t, o) => t.greeting === o,
  },
  {
    key: 'recipient', label: 'Recipient', multi: false,
    options: ['Friends & Family', 'Business'],
    matches: (t, o) => t.recipient === o,
  },
  {
    key: 'style', label: 'Style', multi: true,
    options: ['Classic Christmas', 'Elegant', 'Modern', 'Rustic', 'Whimsical', 'Minimal', 'Bold & Colorful', 'Floral'],
    matches: (t, o) => t.style === o,
  },
  {
    key: 'orientation', label: 'Orientation', multi: false,
    options: ['Vertical', 'Horizontal'],
    matches: (t, o) => t.orientation === o,
  },
  {
    key: 'size', label: 'Size', multi: true,
    options: ['5" x 7"', '6" x 9"', '5.5" x 5.5"', '4" x 8"'],
    matches: (t, o) => t.size === o,
  },
  {
    key: 'fold', label: 'Fold', multi: false,
    options: ['Flat', 'Folded'],
    matches: (t, o) => t.fold === o,
  },
  {
    key: 'foil', label: 'Foil Finish', multi: true,
    options: ['None', 'Gold Foil', 'Silver Foil', 'Red Foil'],
    matches: (t, o) => t.foil === o,
  },
];
