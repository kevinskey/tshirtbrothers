// Image filters for the Design Studio.
//
// Two layers:
//   1. CSS/SVG previews (imageFilterCss + <ImageFilterDefs>) — instant
//      feedback while an element's baked bitmap is still being computed.
//   2. bakeImageFilter — applies the same filter to the image's actual
//      pixels and returns a PNG data URL. The studio renders the baked
//      bitmap once ready, so html2canvas captures (mockups, art-library
//      saves, and the print/graphic PNGs vendors receive) contain the
//      filtered pixels. html2canvas ignores the CSS `filter` property
//      entirely, which is why baking is the only way filters reach print.

export type ImageFilterName =
  | 'none' | 'grayscale' | 'invert' | 'sepia' | 'bw'
  | 'vintage' | 'warm' | 'cool' | 'distressed' | 'distressed2';

export const IMAGE_FILTERS: { name: ImageFilterName; label: string; css?: string }[] = [
  { name: 'none', label: 'None' },
  { name: 'grayscale', label: 'Gray', css: 'grayscale(100%)' },
  { name: 'bw', label: 'B&W', css: 'grayscale(100%) contrast(1000%)' },
  { name: 'sepia', label: 'Sepia', css: 'sepia(100%)' },
  { name: 'invert', label: 'Invert', css: 'invert(100%)' },
  { name: 'vintage', label: 'Vintage', css: 'sepia(45%) contrast(0.9) brightness(1.05) saturate(1.2)' },
  { name: 'warm', label: 'Warm', css: 'sepia(25%) saturate(1.35) hue-rotate(-10deg)' },
  { name: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.03) sepia(10%)' },
  { name: 'distressed', label: 'Distressed', css: 'url(#tsb-filter-distressed)' },
  { name: 'distressed2', label: 'Heavy Distress', css: 'url(#tsb-filter-distressed2)' },
];

export const imageFilterCss = (f: ImageFilterName | undefined): string | undefined =>
  IMAGE_FILTERS.find(x => x.name === (f ?? 'none'))?.css;

// Invisible SVG defs backing the distressed CSS previews: fractal noise
// thresholded into an alpha mask, composited "in" so speckles erode out of
// the artwork. Preview-only — the baked bitmap replaces this once computed.
export function ImageFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="tsb-filter-distressed" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="4" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4 0 0 0 -1.1" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
        <filter id="tsb-filter-distressed2" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="5" seed="3" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -2.4" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pixel baking
// ---------------------------------------------------------------------------

// 3x3 RGB matrix + offset (0-255 units). Color filters compose into one of
// these so baking is a single pass over the pixels regardless of how many
// primitives the filter chains.
type ColorMatrix = { m: number[]; o: number[] };

const IDENTITY: ColorMatrix = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] };

// apply `f` after `g` (i.e. f(g(v))). Non-null assertions: matrices are
// fixed 9/3-length arrays built above, indices are always in range.
function compose(f: ColorMatrix, g: ColorMatrix): ColorMatrix {
  const m = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = f.m[r * 3]! * g.m[c]! + f.m[r * 3 + 1]! * g.m[3 + c]! + f.m[r * 3 + 2]! * g.m[6 + c]!;
    }
  }
  const o = [0, 1, 2].map(r =>
    f.m[r * 3]! * g.o[0]! + f.m[r * 3 + 1]! * g.o[1]! + f.m[r * 3 + 2]! * g.o[2]! + f.o[r]!);
  return { m, o };
}

const chain = (...ops: ColorMatrix[]) => ops.reduce((acc, op) => compose(op, acc), IDENTITY);

// Matrices follow the SVG/CSS filter-effects spec so baked output matches
// the CSS previews.
const GRAYSCALE: ColorMatrix = {
  m: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
  o: [0, 0, 0],
};

const SEPIA_FULL: ColorMatrix = {
  m: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
  o: [0, 0, 0],
};

function sepia(amount: number): ColorMatrix {
  const m = SEPIA_FULL.m.map((v, i) => {
    const id = IDENTITY.m[i]!;
    return id + (v - id) * amount;
  });
  return { m, o: [0, 0, 0] };
}

function saturate(s: number): ColorMatrix {
  return {
    m: [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    ],
    o: [0, 0, 0],
  };
}

function hueRotate(deg: number): ColorMatrix {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    m: [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ],
    o: [0, 0, 0],
  };
}

const brightness = (b: number): ColorMatrix =>
  ({ m: IDENTITY.m.map(v => v * b), o: [0, 0, 0] });

const contrast = (c: number): ColorMatrix => {
  const off = (0.5 - 0.5 * c) * 255;
  return { m: IDENTITY.m.map(v => v * c), o: [off, off, off] };
};

const invert: ColorMatrix = { m: IDENTITY.m.map(v => -v), o: [255, 255, 255] };

const COLOR_MATRICES: Partial<Record<ImageFilterName, ColorMatrix>> = {
  grayscale: GRAYSCALE,
  invert,
  sepia: sepia(1),
  vintage: chain(sepia(0.45), contrast(0.9), brightness(1.05), saturate(1.2)),
  warm: chain(sepia(0.25), saturate(1.35), hueRotate(-10)),
  cool: chain(saturate(1.1), hueRotate(12), brightness(1.03), sepia(0.10)),
};

function applyColorMatrix(px: Uint8ClampedArray, cm: ColorMatrix) {
  const { m, o } = cm;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
    px[i] = m[0]! * r + m[1]! * g + m[2]! * b + o[0]!;
    px[i + 1] = m[3]! * r + m[4]! * g + m[5]! * b + o[1]!;
    px[i + 2] = m[6]! * r + m[7]! * g + m[8]! * b + o[2]!;
  }
}

// Legacy 'bw' = grayscale + extreme contrast, i.e. hard threshold on luma.
function applyBw(px: Uint8ClampedArray) {
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
    const v = l >= 128 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

// Deterministic hash-based value noise: same image + filter always bakes the
// same grunge pattern, so re-captures of a saved design produce identical
// print files. (Date.now()/Math.random() would break that.)
function hash2(xi: number, yi: number, seed: number): number {
  let h = (xi * 374761393 + yi * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fractalNoise(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 101) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum; // ~[0, 1), centered near 0.5
}

// Erode alpha where the noise falls below a threshold. Cell size scales with
// the image so grain density looks the same at any upload resolution.
function applyDistress(
  px: Uint8ClampedArray, w: number, h: number,
  opts: { cells: number; threshold: number; softness: number; seed: number },
) {
  const cell = Math.max(2, Math.max(w, h) / opts.cells);
  const inv = 1 / cell;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      const a = px[i]!;
      if (a === 0) continue;
      const n = fractalNoise(x * inv, y * inv, opts.seed, 4);
      const keep = Math.min(1, Math.max(0, (n - opts.threshold) * opts.softness));
      px[i] = a * keep;
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/**
 * Apply `filter` to the image's actual pixels at native resolution and
 * return a PNG data URL, or null when there's nothing to bake / the image
 * can't be baked (CORS-tainted canvas, load failure). Callers fall back to
 * the CSS preview on null.
 */
export async function bakeImageFilter(src: string, filter: ImageFilterName): Promise<string | null> {
  if (!filter || filter === 'none') return null;
  try {
    const img = await loadImage(src);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h); // throws on tainted canvas
    const px = data.data;

    if (filter === 'bw') {
      applyBw(px);
    } else if (filter === 'distressed') {
      applyDistress(px, w, h, { cells: 90, threshold: 0.34, softness: 9, seed: 7 });
    } else if (filter === 'distressed2') {
      // ~32% fully eroded + ~29% soft edge — heavy wear that still keeps
      // the artwork readable (0.46/7 left only ~14% fully solid).
      applyDistress(px, w, h, { cells: 48, threshold: 0.40, softness: 10, seed: 3 });
    } else {
      const cm = COLOR_MATRICES[filter];
      if (!cm) return null;
      applyColorMatrix(px, cm);
    }

    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[imageFilters] bake failed, CSS preview only:', err);
    return null;
  }
}
