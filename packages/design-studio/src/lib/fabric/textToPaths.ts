/**
 * Convert a Fabric IText (or shaped-text Group's source params) to an SVG
 * `<path>` snippet using opentype.js. Used by the screen-print / vinyl SVG
 * export path so the cutter / RIP doesn't depend on the customer having
 * the same fonts installed.
 *
 * Returns a string fragment like `<path d="M..." fill="#000"/>` positioned
 * in the canvas's coordinate space. The caller is responsible for wrapping
 * it with the same transform attribute Fabric would have emitted for the
 * original <text> element.
 */

import type { IText } from 'fabric';
import { loadFontForText } from './loadFontForText';
import { escapeXmlAttr } from './svgEscape';

export interface TextPathFragment {
  /** SVG `<path .../>` markup (one or more paths concatenated). */
  d: string;
  /** Bounding box in local coords — useful for callers that want their own transform. */
  width: number;
  height: number;
}

/**
 * Render the given Fabric IText to SVG path data. Returns null if the font
 * couldn't be loaded — the caller should fall back to the text element.
 */
export async function iTextToPaths(text: IText): Promise<TextPathFragment | null> {
  const family = text.fontFamily ?? 'Inter';
  const weight = parseWeight(text.fontWeight);
  const content = text.text ?? '';
  if (!content.trim()) return null;
  const fontSize = text.fontSize ?? 24;
  const fill = typeof text.fill === 'string' ? text.fill : '#000000';

  const font = await loadFontForText(family, weight, content);
  if (!font) return null;

  // Lay out each line independently. opentype.getPath handles glyph kerning
  // within a single text run; we add per-line vertical offset using
  // fontSize * lineHeight, matching Fabric's internal layout.
  const lines = content.split('\n');
  const lineHeight = (text.lineHeight ?? 1.16) * fontSize;
  // opentype.getPath places the BASELINE at y; Fabric's text baseline for
  // the first line sits at fontSize*0.85-ish from the top of the box. We
  // approximate with the font's ascender ratio.
  const ascend = (font.ascender / font.unitsPerEm) * fontSize;

  const pieces: string[] = [];
  let maxWidth = 0;
  lines.forEach((line, idx) => {
    if (!line) return;
    const baselineY = ascend + idx * lineHeight;
    const path = font.getPath(line, 0, baselineY, fontSize);
    path.fill = fill;
    pieces.push(path.toSVG(2));
    maxWidth = Math.max(maxWidth, font.getAdvanceWidth(line, fontSize));
  });

  return {
    d: pieces.join(''),
    width: maxWidth,
    height: lines.length * lineHeight,
  };
}

function parseWeight(w: unknown): number {
  if (typeof w === 'number') return w;
  if (typeof w === 'string') {
    if (w === 'bold') return 700;
    if (w === 'normal') return 400;
    const n = parseInt(w, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 400;
}

// Re-export so exportSvg can build attribute-safe strings without a
// separate import path.
export { escapeXmlAttr };
