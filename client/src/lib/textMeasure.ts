/**
 * Text-box measurement for the design studio.
 *
 * Text elements store `width` as % of the design surface while their glyphs
 * render from `fontSize` (reference units, where 800 units = the full surface
 * width). Historically the two were maintained independently — width was
 * hardcoded to 40% at creation and never touched by the Size/Font/Spacing
 * controls — so the selection box and the painted glyphs drifted apart and
 * long single words painted past the box. These helpers derive the box from
 * the glyphs so the two can never diverge.
 *
 * Measurement happens at `fontSize` px on an offscreen canvas: because
 * fontSize is in reference units and REF_UNITS = the surface width, the
 * measured px ARE reference units and convert to % with a single division.
 */

export const REF_UNITS = 800;
export const MIN_TEXT_WIDTH_PCT = 5;
export const MAX_TEXT_WIDTH_PCT = 95;

export interface TextMetricsInput {
  content: string;
  /** Reference units (REF_UNITS = full surface width). */
  fontSize: number;
  fontFamily?: string;
  /** em, matches the span's `letterSpacing: ${n}em`. */
  letterSpacing?: number;
  /** em, matches the span's `wordSpacing: ${n}em`. */
  wordSpacing?: number;
}

/** px width of one line, measured at `fontSize` px. */
export type LineMeasurer = (line: string) => number;

let sharedCtx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D | null {
  if (!sharedCtx && typeof document !== 'undefined') {
    sharedCtx = document.createElement('canvas').getContext('2d');
  }
  return sharedCtx;
}

function makeCanvasMeasurer(input: TextMetricsInput): LineMeasurer | null {
  const ctx = getCtx();
  if (!ctx) return null;
  const family = input.fontFamily ?? 'Inter';
  // Mirror the span's rendering: fontWeight 700, family with sans fallback.
  ctx.font = `700 ${input.fontSize}px "${family}", sans-serif`;
  const lsPx = (input.letterSpacing ?? 0) * input.fontSize;
  const wsPx = (input.wordSpacing ?? 0) * input.fontSize;
  // Canvas letterSpacing/wordSpacing (Chrome 99+/Safari 17+) match CSS
  // semantics; fall back to arithmetic where unsupported.
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
  const supportsSpacing = 'letterSpacing' in ctx;
  if (supportsSpacing) {
    c.letterSpacing = `${lsPx}px`;
    c.wordSpacing = `${wsPx}px`;
  }
  return (line: string) => {
    let w = ctx.measureText(line).width;
    if (!supportsSpacing) {
      w += lsPx * line.length + wsPx * Math.max(0, line.split(' ').length - 1);
    }
    return w;
  };
}

/**
 * Width (% of surface) the element's box must have to exactly wrap its
 * rendered glyphs. Returns NaN when no canvas context exists (SSR) — callers
 * keep the current width in that case.
 */
export function measureTextWidthPct(
  input: TextMetricsInput,
  measureLine?: LineMeasurer,
): number {
  const measurer = measureLine ?? makeCanvasMeasurer(input);
  if (!measurer) return NaN;
  const widest = input.content
    .split('\n')
    .reduce((max, line) => Math.max(max, measurer(line)), 0);
  const pct = (widest / REF_UNITS) * 100;
  return Math.min(MAX_TEXT_WIDTH_PCT, Math.max(MIN_TEXT_WIDTH_PCT, pct));
}

/**
 * New x that keeps the element's visual center fixed while its box width
 * changes (Size stepper, font swap, retype). Clamped to the same 0–90 range
 * the drag handler enforces.
 */
export function recenteredX(x: number, oldWidth: number, newWidth: number): number {
  const nx = x + (oldWidth - newWidth) / 2;
  return Math.max(0, Math.min(90, nx));
}
