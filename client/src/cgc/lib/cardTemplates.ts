// Holiday card template catalog for /holiday-cards. Templates are data,
// not artwork: CardTemplatePreview renders each one as an SVG from the
// palette/layout attributes here, so new designs are a one-line addition
// and real artwork can replace the generated previews later without
// touching the gallery page.

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
  bg: string;      // card background hex
  accent: string;  // decorative accent hex
  ink: string;     // headline/text hex (foil overrides headline fill)
  headline: string;
  font: 'serif' | 'script' | 'sans';
};

type Row = [
  string, string, number, CardTemplate['greeting'], CardTemplate['recipient'],
  CardTemplate['style'], CardTemplate['orientation'], CardTemplate['size'],
  CardTemplate['fold'], CardTemplate['foil'], CardColor[],
  string, string, string, string, CardTemplate['font'],
];

const rows: Row[] = [
  // id, name, photos, greeting, recipient, style, orientation, size, fold, foil, colors, bg, accent, ink, headline, font
  ['merry-pine', 'Merry Pine', 1, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Vertical', '5" x 7"', 'Flat', 'None', ['Green', 'Cream'], '#f6f1e7', '#2f5d3a', '#22381f', 'Merry Christmas', 'serif'],
  ['crimson-joy', 'Crimson Joy', 3, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Vertical', '5" x 7"', 'Flat', 'None', ['Red', 'Cream'], '#7f1d1d', '#e8d9b8', '#f6f1e7', 'JOY', 'serif'],
  ['golden-wreath', 'Golden Wreath', 0, 'Christmas', 'Friends & Family', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Gold Foil', ['Cream', 'Gold'], '#f8f4ec', '#b98a2e', '#3a2f1e', 'Merry Christmas', 'script'],
  ['midnight-noel', 'Midnight Noel', 2, 'Christmas', 'Friends & Family', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Gold Foil', ['Blue', 'Gold'], '#12233f', '#c9a24b', '#f2ead8', 'Noel', 'serif'],
  ['snowday-strip', 'Snow Day', 3, 'Holiday', 'Friends & Family', 'Modern', 'Horizontal', '5" x 7"', 'Flat', 'None', ['White', 'Blue'], '#ffffff', '#3d6b9e', '#1d2c40', 'Happy Holidays', 'sans'],
  ['merry-bright-pop', 'Merry & Bright Pop', 1, 'Christmas', 'Friends & Family', 'Bold & Colorful', 'Vertical', '5" x 7"', 'Flat', 'None', ['Red', 'Pink'], '#e2483d', '#f4b8c4', '#fff6ec', 'Merry & Bright', 'sans'],
  ['cozy-cabin', 'Cozy Cabin', 4, 'Christmas', 'Friends & Family', 'Rustic', 'Vertical', '5" x 7"', 'Flat', 'None', ['Cream', 'Green'], '#efe6d4', '#6b4f35', '#3c2f22', 'Merry Christmas', 'serif'],
  ['peace-dove', 'Peace on Earth', 0, 'Religious', 'Friends & Family', 'Minimal', 'Vertical', '5" x 7"', 'Flat', 'None', ['White', 'Gray'], '#fbfaf7', '#8b8f98', '#2f3237', 'Peace on Earth', 'serif'],
  ['holly-jolly-kids', 'Holly Jolly', 2, 'Christmas', 'Friends & Family', 'Whimsical', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Green', 'Red'], '#1f5132', '#e2483d', '#f6f1e7', 'Holly Jolly', 'script'],
  ['first-noel-arch', 'The First Noel', 1, 'Religious', 'Friends & Family', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Gold Foil', ['Cream', 'Gold'], '#f4eee1', '#b98a2e', '#4a3b26', 'O Holy Night', 'script'],
  ['evergreen-grid', 'Evergreen Memories', 6, 'Holiday', 'Friends & Family', 'Modern', 'Vertical', '5" x 7"', 'Flat', 'None', ['Green', 'White'], '#ffffff', '#2f5d3a', '#22381f', 'Happy Holidays', 'sans'],
  ['fa-la-la', 'Fa La La', 0, 'Christmas', 'Friends & Family', 'Whimsical', 'Vertical', '5" x 7"', 'Flat', 'None', ['Pink', 'Red'], '#f7c8cf', '#a02236', '#5c1220', 'Fa La La La La', 'script'],
  ['gilded-year', 'Gilded New Year', 1, 'New Year', 'Friends & Family', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Gold Foil', ['Black', 'Gold'], '#141210', '#c9a24b', '#f2ead8', 'Cheers to the New Year', 'serif'],
  ['confetti-countdown', 'Confetti Countdown', 2, 'New Year', 'Friends & Family', 'Bold & Colorful', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Blue', 'Gold'], '#1c2f55', '#e0b64f', '#f6f1e7', 'Happy New Year', 'sans'],
  ['festival-lights', 'Festival of Lights', 0, 'Hanukkah', 'Friends & Family', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Silver Foil', ['Blue', 'White'], '#16305e', '#c8d2e4', '#f2f5fb', 'Happy Hanukkah', 'serif'],
  ['hanukkah-glow', 'Hanukkah Glow', 2, 'Hanukkah', 'Friends & Family', 'Modern', 'Horizontal', '5" x 7"', 'Flat', 'None', ['White', 'Blue'], '#fbfaf7', '#2a4d8f', '#1c2c4a', 'Happy Hanukkah', 'sans'],
  ['tartan-greetings', 'Tartan Greetings', 3, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Red', 'Green'], '#7f1d1d', '#2f5d3a', '#f6f1e7', "Season's Greetings", 'serif'],
  ['winter-berry', 'Winter Berry', 1, 'Holiday', 'Friends & Family', 'Floral', 'Vertical', '5" x 7"', 'Flat', 'None', ['Cream', 'Red'], '#f8f3ea', '#a02236', '#4c2a2a', 'Warmest Wishes', 'script'],
  ['eucalyptus-frame', 'Eucalyptus Frame', 1, 'Holiday', 'Friends & Family', 'Floral', 'Vertical', '5" x 7"', 'Flat', 'None', ['Green', 'White'], '#ffffff', '#7d9b7a', '#33463a', 'Joy to You & Yours', 'script'],
  ['bold-type-cheer', 'Big Type Cheer', 0, 'Holiday', 'Friends & Family', 'Bold & Colorful', 'Vertical', '5" x 7"', 'Flat', 'None', ['Green', 'Pink'], '#1f5132', '#f4b8c4', '#f6f1e7', 'CHEER', 'sans'],
  ['starlight-navy', 'Starlight', 1, 'Religious', 'Friends & Family', 'Minimal', 'Vertical', '5" x 7"', 'Flat', 'Silver Foil', ['Blue', 'Gray'], '#101c30', '#aeb8c8', '#e9edf4', 'Silent Night', 'serif'],
  ['gingerbread-lane', 'Gingerbread Lane', 2, 'Christmas', 'Friends & Family', 'Whimsical', 'Vertical', '5" x 7"', 'Flat', 'None', ['Cream', 'Red'], '#f3e3cd', '#9c5b2e', '#5a3a22', 'Sweetest Season', 'script'],
  ['modern-mistletoe', 'Modern Mistletoe', 4, 'Holiday', 'Friends & Family', 'Modern', 'Horizontal', '5" x 7"', 'Flat', 'None', ['White', 'Green'], '#fbfaf7', '#2f5d3a', '#22381f', 'Merry Everything', 'sans'],
  ['rustic-timber', 'Rustic Timber', 1, 'Christmas', 'Friends & Family', 'Rustic', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Cream', 'Black'], '#e9dfc9', '#4a3b2a', '#2c2318', 'Merry Christmas', 'serif'],
  ['red-ribbon', 'Red Ribbon', 0, 'Christmas', 'Business', 'Elegant', 'Vertical', '5" x 7"', 'Flat', 'Red Foil', ['White', 'Red'], '#fbfaf7', '#b3202f', '#5c1220', "Season's Greetings", 'serif'],
  ['corporate-frost', 'Corporate Frost', 0, 'Holiday', 'Business', 'Minimal', 'Horizontal', '5" x 7"', 'Flat', 'Silver Foil', ['Gray', 'Blue'], '#eef0f3', '#5a6b85', '#232c3b', 'Happy Holidays', 'sans'],
  ['gratitude-gold', 'Gratitude in Gold', 0, 'Holiday', 'Business', 'Elegant', 'Horizontal', '5" x 7"', 'Flat', 'Gold Foil', ['Black', 'Gold'], '#17140f', '#c9a24b', '#f2ead8', 'Thank You & Happy Holidays', 'serif'],
  ['team-toast', 'Team Toast', 1, 'New Year', 'Business', 'Modern', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Blue', 'White'], '#ffffff', '#1c2f55', '#1c2f55', 'Cheers to a Great Year', 'sans'],
  ['evergreen-emblem', 'Evergreen Emblem', 0, 'Christmas', 'Business', 'Classic Christmas', 'Vertical', '5" x 7"', 'Flat', 'None', ['Green', 'Gold'], '#14351f', '#c9a24b', '#f2ead8', "Season's Greetings", 'serif'],
  ['square-sparkle', 'Square Sparkle', 1, 'Christmas', 'Friends & Family', 'Elegant', 'Vertical', '5.5" x 5.5"', 'Flat', 'Gold Foil', ['White', 'Gold'], '#fbf8f1', '#b98a2e', '#3a2f1e', 'Merry Christmas', 'script'],
  ['square-family-four', 'Family of Memories', 4, 'Holiday', 'Friends & Family', 'Modern', 'Vertical', '5.5" x 5.5"', 'Flat', 'None', ['White', 'Black'], '#ffffff', '#141210', '#141210', 'happiest holidays', 'sans'],
  ['skinny-year-review', 'Year in Review', 5, 'New Year', 'Friends & Family', 'Modern', 'Vertical', '4" x 8"', 'Flat', 'None', ['White', 'Blue'], '#ffffff', '#1c2f55', '#1c2f55', 'Hello 2027', 'sans'],
  ['skinny-snapshots', 'Snapshot Stack', 3, 'Holiday', 'Friends & Family', 'Minimal', 'Vertical', '4" x 8"', 'Flat', 'None', ['Cream', 'Gray'], '#f6f1e7', '#8b8f98', '#3a3a3a', 'joy joy joy', 'sans'],
  ['grand-gallery', 'Grand Gallery', 6, 'Holiday', 'Friends & Family', 'Modern', 'Vertical', '6" x 9"', 'Flat', 'None', ['White', 'Green'], '#ffffff', '#2f5d3a', '#22381f', 'Merry & Bright', 'sans'],
  ['grand-portrait', 'Grand Portrait', 1, 'Christmas', 'Friends & Family', 'Elegant', 'Vertical', '6" x 9"', 'Flat', 'Gold Foil', ['Cream', 'Gold'], '#f5efe2', '#b98a2e', '#4a3b26', 'Merry Christmas', 'script'],
  ['folded-classic', 'Folded Classic', 1, 'Christmas', 'Friends & Family', 'Classic Christmas', 'Vertical', '5" x 7"', 'Folded', 'None', ['Red', 'Cream'], '#8f2430', '#e8d9b8', '#f8f2e4', 'Merry Christmas', 'serif'],
  ['folded-woodland', 'Folded Woodland', 2, 'Holiday', 'Friends & Family', 'Rustic', 'Vertical', '5" x 7"', 'Folded', 'None', ['Green', 'Cream'], '#33463a', '#d9cbae', '#f2ecdd', 'Warm Winter Wishes', 'serif'],
  ['folded-business-note', 'Folded Business Note', 0, 'Holiday', 'Business', 'Minimal', 'Horizontal', '5" x 7"', 'Folded', 'Gold Foil', ['White', 'Gold'], '#fbfaf7', '#b98a2e', '#3a2f1e', 'With Gratitude This Season', 'serif'],
  ['nostalgic-postcard', 'Nostalgic Postcard', 2, 'Christmas', 'Friends & Family', 'Rustic', 'Horizontal', '5" x 7"', 'Flat', 'None', ['Red', 'Cream'], '#efe2cb', '#b3202f', '#4c2a2a', 'Greetings from Our Family', 'script'],
  ['candy-stripe', 'Candy Stripe', 1, 'Christmas', 'Friends & Family', 'Bold & Colorful', 'Vertical', '5" x 7"', 'Flat', 'None', ['Red', 'White'], '#ffffff', '#d23c3c', '#8f1f1f', 'Merry Christmas', 'sans'],
  ['blue-spruce', 'Blue Spruce', 3, 'Holiday', 'Friends & Family', 'Classic Christmas', 'Vertical', '5" x 7"', 'Flat', 'None', ['Blue', 'White'], '#22456b', '#cfdcea', '#f2f5fb', 'Happy Holidays', 'serif'],
  ['ivory-script', 'Ivory Script', 1, 'Christmas', 'Friends & Family', 'Minimal', 'Vertical', '5" x 7"', 'Flat', 'None', ['White', 'Gray'], '#fbfaf7', '#b9b3a8', '#3a3a3a', 'merry christmas', 'script'],
  ['pink-flurry', 'Pink Flurry', 2, 'Holiday', 'Friends & Family', 'Whimsical', 'Vertical', '5" x 7"', 'Flat', 'None', ['Pink', 'White'], '#f6dde2', '#c65f76', '#6d2c3c', 'Let It Snow', 'script'],
  ['onyx-modern', 'Onyx Modern', 1, 'New Year', 'Business', 'Modern', 'Vertical', '5" x 7"', 'Flat', 'Silver Foil', ['Black', 'Gray'], '#141210', '#aeb8c8', '#e9edf4', 'Onward & Upward', 'sans'],
];

export const CARD_TEMPLATES: CardTemplate[] = rows.map(
  ([id, name, photos, greeting, recipient, style, orientation, size, fold, foil, colors, bg, accent, ink, headline, font]) => (
    { id, name, photos, greeting, recipient, style, orientation, size, fold, foil, colors, bg, accent, ink, headline, font }
  ),
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
