// Live Hard Truth presentation metadata. The commerce source of truth is
// the store-shop API (store `live-hard-truth`, seeded by
// server/migrations/lht_v1.sql) — this file only layers the brand's color
// swatches and per-colorway photography on top of what variants_json
// carries as plain labels.

export const STORE_SLUG = 'live-hard-truth';

export interface LhtColor {
  key: string;
  label: string; // must match the label in store_products.variants_json.colors
  swatch: string;
  ink: 'light' | 'dark';
  photo?: string;
}

export const JOGGERS_SLUG = 'live-hard-truth-joggers-set';

const SET_COLORS: LhtColor[] = [
  { key: 'espresso', label: 'Espresso', swatch: '#6b4f3a', ink: 'light', photo: '/lht/set-espresso.jpg' },
  { key: 'onyx', label: 'Onyx', swatch: '#111111', ink: 'light', photo: '/lht/set-onyx.jpg' },
  { key: 'ember', label: 'Ember', swatch: '#c45a2b', ink: 'light', photo: '/lht/set-ember.jpg' },
  { key: 'merlot', label: 'Merlot', swatch: '#4b1e2d', ink: 'light', photo: '/lht/set-merlot.jpg' },
  { key: 'olive', label: 'Olive', swatch: '#4c5a3a', ink: 'light', photo: '/lht/set-olive.jpg' },
  { key: 'red', label: 'Red', swatch: '#c1121f', ink: 'light', photo: '/lht/set-red.jpg' },
  { key: 'white', label: 'White', swatch: '#f4f4f4', ink: 'dark', photo: '/lht/set-white.jpg' },
  { key: 'pink', label: 'Pink', swatch: '#ec8fb0', ink: 'dark', photo: '/lht/set-pink.jpg' },
  { key: 'blue', label: 'Blue', swatch: '#1d4ed8', ink: 'light', photo: '/lht/set-blue.jpg' },
  { key: 'green', label: 'Green', swatch: '#14532d', ink: 'light', photo: '/lht/set-green.jpg' },
  { key: 'purple', label: 'Purple', swatch: '#6b21a8', ink: 'light', photo: '/lht/set-purple.jpg' },
];

const CAP_COLORS: LhtColor[] = [
  { key: 'onyx', label: 'Onyx', swatch: '#111111', ink: 'light', photo: '/lht/cap-onyx.jpg' },
  { key: 'merlot', label: 'Merlot', swatch: '#4b1e2d', ink: 'light', photo: '/lht/cap-merlot.jpg' },
  { key: 'olive', label: 'Olive', swatch: '#4c5a3a', ink: 'light', photo: '/lht/cap-olive.jpg' },
];

export const PRODUCT_COLORS: Record<string, LhtColor[]> = {
  [JOGGERS_SLUG]: SET_COLORS,
  'hard-truth-hat': CAP_COLORS,
};

export function colorsFor(slug: string): LhtColor[] {
  return PRODUCT_COLORS[slug] ?? [];
}

export function colorByLabel(slug: string, label: string | null | undefined): LhtColor | undefined {
  if (!label) return undefined;
  return colorsFor(slug).find((c) => c.label.toLowerCase() === label.toLowerCase()
    || c.key === label.toLowerCase());
}

export function photoFor(slug: string, colorLabel: string | null | undefined, fallback: string | null): string | null {
  return colorByLabel(slug, colorLabel)?.photo ?? fallback;
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
