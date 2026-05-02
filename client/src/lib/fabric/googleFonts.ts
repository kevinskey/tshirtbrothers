/**
 * Google Fonts loader shared by FabricDesignCanvas hydrator and the future
 * page port. DesignStudioPage and QuotePage both have local copies of this
 * logic — once PR #6 ports the page, those duplicates go away. Keep this
 * the canonical loader.
 *
 * The single-weight list mirrors DesignStudioPage's: many display / handwritten
 * fonts ship only one weight on Google Fonts, and including a wght axis silently
 * downgrades the response to 400. Without this list, requesting any of these
 * with `:wght@400;700` returns a CSS file that produces a generic-looking fallback.
 */

const SYSTEM_FONTS = new Set([
  'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana',
  'Comic Sans MS', 'Inter',
]);

const SINGLE_WEIGHT_FONTS = new Set([
  'Bungee Outline', 'Bungee Inline', 'Bungee Spice', 'Bungee Shade',
  'Rubik Mono One', 'Rubik Bubbles', 'Rubik Glitch', 'Rubik Iso',
  'Rubik Vinyl', 'Rubik Marker Hatched', 'Rubik Beastly',
  'Rubik Spray Paint', 'Rubik Wet Paint', 'Rubik Puddles',
  'Rubik Burned', 'Rubik 80s Fade', 'Rubik Lines', 'Rubik Maze', 'Rubik Pixels',
  'Press Start 2P', 'VT323', 'Wallpoet', 'Codystar', 'Modak',
  'Frijole', 'Limelight', 'Shrikhand', 'Nosifer', 'Eater', 'Pirata One',
  'Rampart One', 'Sigmar One', 'Titan One', 'Ultra', 'Bowlby One',
  'Concert One', 'Knewave', 'Faster One', 'Squada One', 'Saira Stencil One',
  'Staatliches', 'Alfa Slab One', 'Russo One', 'Audiowide', 'Black Ops One',
  'Creepster', 'Fascinate Inline', 'Monoton', 'Special Elite',
  'Bangers', 'Fredoka One', 'Lobster', 'Pacifico', 'Permanent Marker',
  'Anton', 'Bebas Neue', 'Righteous', 'Passion One', 'Bungee', 'Racing Sans One',
  'Yeseva One', 'Abril Fatface', 'Sansita',
  'Stalemate', 'Henny Penny', 'Yellowtail', 'Allura', 'Tangerine',
  'Marck Script', 'Zeyada', 'Homemade Apple', 'Great Vibes', 'Sacramento',
  'Satisfy', 'Dancing Script', 'Kaushan Script', 'Gochi Hand', 'Oleo Script',
  'Pinyon Script', 'Indie Flower', 'Shadows Into Light', 'Rock Salt',
  'Amatic SC', 'Gloria Hallelujah', 'Covered By Your Grace',
  'UnifrakturMaguntia', 'UnifrakturCook', 'MedievalSharp',
]);

const loadedFonts = new Set<string>();

function googleFontUrl(fontName: string): string {
  const family = fontName.replace(/ /g, '+');
  if (SINGLE_WEIGHT_FONTS.has(fontName)) {
    return `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
}

/**
 * Inject the Google Fonts <link> tag for one font and resolve once the
 * browser reports its font set is settled. Idempotent — the second call for
 * a given family is a noop.
 */
export function loadGoogleFont(fontName: string): Promise<void> {
  if (!fontName || SYSTEM_FONTS.has(fontName) || loadedFonts.has(fontName)) {
    return Promise.resolve();
  }
  loadedFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = googleFontUrl(fontName);
  document.head.appendChild(link);
  return document.fonts.ready.then(() => {});
}

/** Load a batch in parallel; resolves when all stylesheets + fonts.ready settle. */
export function loadGoogleFonts(fontNames: Iterable<string>): Promise<void[]> {
  const unique = new Set<string>();
  for (const f of fontNames) if (f) unique.add(f);
  return Promise.all([...unique].map(loadGoogleFont));
}
