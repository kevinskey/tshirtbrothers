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
  'Rubik Vinyl', 'Rubik Marker Hatch', 'Rubik Beastly',
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
  'Varela Round', 'Fjalla One', 'DM Serif Display', 'Prata',
  'Patrick Hand', 'Architects Daughter', 'DM Mono',
]);

// Fonts whose ONLY weight is 700 — a name-only URL (which defaults to 400)
// 400s just like a wrong wght axis does.
const BOLD_ONLY_FONTS = new Set(['UnifrakturCook']);

const loadedFonts = new Set<string>();

function googleFontUrl(fontName: string): string {
  const family = fontName.replace(/ /g, '+');
  if (BOLD_ONLY_FONTS.has(fontName)) {
    return `https://fonts.googleapis.com/css2?family=${family}:wght@700&display=swap`;
  }
  if (SINGLE_WEIGHT_FONTS.has(fontName)) {
    return `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
}

/** A face already registered via @font-face (site or custom-uploaded fonts)
 *  doesn't exist on Google Fonts — requesting it there just 400s. */
function isFaceRegistered(fontName: string): boolean {
  const want = fontName.toLowerCase();
  for (const face of document.fonts) {
    if (face.family.replace(/['"]/g, '').toLowerCase() === want) return true;
  }
  return false;
}

/**
 * Inject the Google Fonts <link> tag for one font and resolve once the
 * face has actually downloaded. Idempotent — the second call for a given
 * family is a noop; a FAILED load is un-marked so a retry gets another shot.
 */
export function loadGoogleFont(fontName: string): Promise<void> {
  if (!fontName || SYSTEM_FONTS.has(fontName) || loadedFonts.has(fontName)) {
    return Promise.resolve();
  }
  if (isFaceRegistered(fontName)) {
    loadedFonts.add(fontName);
    return document.fonts.load(`16px "${fontName}"`).then(() => {}, () => {});
  }
  loadedFonts.add(fontName);
  return new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = googleFontUrl(fontName);
    // CSS-registered faces download lazily — force the fetch so "resolved"
    // means the glyphs are actually renderable on canvas.
    link.onload = () => document.fonts.load(`16px "${fontName}"`).then(() => resolve(), () => resolve());
    link.onerror = () => { loadedFonts.delete(fontName); resolve(); };
    document.head.appendChild(link);
  });
}

/** Load a batch in parallel; resolves when all stylesheets + fonts.ready settle. */
export function loadGoogleFonts(fontNames: Iterable<string>): Promise<void[]> {
  const unique = new Set<string>();
  for (const f of fontNames) if (f) unique.add(f);
  return Promise.all([...unique].map(loadGoogleFont));
}
