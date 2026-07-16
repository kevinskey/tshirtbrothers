/**
 * Categorized font catalog for the design studio's font picker.
 *
 * Lifted from DesignStudioPage's `FONT_OPTIONS` array. The categories were
 * implicit there as code comments — here they're structured so the picker
 * can render category chips for filtering.
 *
 * Categories mirror what t-shirt designers reach for: sans-serif body,
 * athletic / heavy display, serif elegance, decorative novelty, the Rubik
 * distressed family that's specific to this domain, scripts for signatures,
 * gothic blackletter, monospace / pixel, and system fallbacks.
 *
 * Add a new font: append to the appropriate array. The picker renders in
 * declaration order within each category (i.e. order = priority).
 */

export type FontCategory =
  | 'sans'
  | 'display'
  | 'serif'
  | 'decorative'
  | 'distressed'
  | 'script'
  | 'gothic'
  | 'mono'
  | 'system'
  | 'custom';

export interface CategorizedFont {
  name: string;
  category: FontCategory;
}

export const FONT_CATEGORIES: { id: FontCategory; label: string }[] = [
  // Custom first when present — admins want their uploads top-of-list.
  { id: 'custom', label: 'Custom' },
  { id: 'sans', label: 'Sans' },
  { id: 'display', label: 'Display' },
  { id: 'serif', label: 'Serif' },
  { id: 'decorative', label: 'Decorative' },
  { id: 'distressed', label: 'Distressed' },
  { id: 'script', label: 'Script' },
  { id: 'gothic', label: 'Gothic' },
  { id: 'mono', label: 'Mono' },
  { id: 'system', label: 'System' },
];

const SANS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Nunito', 'Ubuntu', 'Rubik', 'Work Sans', 'Quicksand', 'Mulish',
  'Barlow', 'Karla', 'Cabin', 'Exo 2', 'Titillium Web', 'Varela Round',
  'Archivo', 'Outfit', 'Sora', 'DM Sans', 'Space Grotesk', 'Manrope',
  'Plus Jakarta Sans', 'Albert Sans', 'Figtree',
];

const DISPLAY = [
  'Bebas Neue', 'Anton', 'Oswald', 'Fjalla One', 'Big Shoulders Display',
  'Squada One', 'Faster One', 'Racing Sans One', 'Saira Condensed',
  'Teko', 'Yanone Kaffeesatz', 'Khand', 'Staatliches', 'Saira Stencil One',
];

const SERIF = [
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Bitter', 'Libre Baskerville',
  'EB Garamond', 'Crimson Text', 'Cormorant Garamond', 'Spectral', 'Source Serif 4',
  'DM Serif Display', 'Noto Serif', 'Abril Fatface', 'Cinzel',
  'Yeseva One', 'Prata', 'Cardo', 'Old Standard TT',
];

const DECORATIVE = [
  'Righteous', 'Passion One', 'Bungee', 'Bangers',
  'Fredoka One', 'Lobster', 'Pacifico', 'Permanent Marker', 'Press Start 2P',
  'Russo One', 'Orbitron', 'Audiowide', 'Black Ops One', 'Bungee Shade',
  'Bungee Outline', 'Bungee Inline', 'Bungee Spice',
  'Creepster', 'Fascinate Inline', 'Monoton', 'Sigmar One',
  'Special Elite', 'Titan One', 'Ultra', 'Alfa Slab One', 'Bowlby One',
  'Concert One', 'Knewave', 'Modak', 'Frijole', 'Limelight',
  'Sansita', 'Shrikhand', 'Nosifer', 'Eater', 'Pirata One',
  'Rampart One', 'Codystar',
];

// Rubik distressed/textured family — cut/printed-look styles. Their own
// category because they're a recognizable family customers ask for by
// look (printed-on, sprayed-on, glitched-out).
const DISTRESSED = [
  'Rubik Mono One', 'Rubik Bubbles', 'Rubik Glitch', 'Rubik Iso',
  'Rubik Vinyl', 'Rubik Marker Hatched', 'Rubik Beastly',
  'Rubik Spray Paint', 'Rubik Wet Paint', 'Rubik Puddles',
  'Rubik Burned', 'Rubik 80s Fade',
  'Rubik Lines', 'Rubik Maze', 'Rubik Pixels',
];

const SCRIPT = [
  'Dancing Script', 'Great Vibes', 'Sacramento', 'Satisfy', 'Kalam',
  'Caveat', 'Indie Flower', 'Shadows Into Light', 'Patrick Hand', 'Architects Daughter',
  'Amatic SC', 'Gloria Hallelujah', 'Covered By Your Grace', 'Rock Salt',
  'Kaushan Script', 'Gochi Hand', 'Oleo Script', 'Pinyon Script',
  'Stalemate', 'Henny Penny', 'Yellowtail', 'Allura', 'Tangerine',
  'Marck Script', 'Zeyada', 'Homemade Apple',
];

const GOTHIC = [
  'UnifrakturMaguntia', 'UnifrakturCook', 'MedievalSharp',
];

const MONO = [
  'Roboto Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Space Mono', 'DM Mono',
  'VT323', 'Wallpoet',
];

const SYSTEM = [
  'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Comic Sans MS',
];

export const FONT_CATALOG: CategorizedFont[] = [
  ...SANS.map((name) => ({ name, category: 'sans' as const })),
  ...DISPLAY.map((name) => ({ name, category: 'display' as const })),
  ...SERIF.map((name) => ({ name, category: 'serif' as const })),
  ...DECORATIVE.map((name) => ({ name, category: 'decorative' as const })),
  ...DISTRESSED.map((name) => ({ name, category: 'distressed' as const })),
  ...SCRIPT.map((name) => ({ name, category: 'script' as const })),
  ...GOTHIC.map((name) => ({ name, category: 'gothic' as const })),
  ...MONO.map((name) => ({ name, category: 'mono' as const })),
  ...SYSTEM.map((name) => ({ name, category: 'system' as const })),
];

/** Convenience: just the names, in the same order. Used for batch-preload. */
export const FONT_NAMES: string[] = FONT_CATALOG.map((f) => f.name);
