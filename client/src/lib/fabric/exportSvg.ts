import { IText, type Canvas as FabricCanvas } from 'fabric';
import { iTextToPaths } from './textToPaths';
import { escapeXmlAttr } from './svgEscape';
import type { FabricObjectWithMeta } from './types';

export interface ExportSvgOptions {
  /**
   * If true, every IText element is converted to <path> via opentype.js
   * so the SVG renders correctly in cutting software (Cricut, Silhouette)
   * regardless of whether the font is installed locally. Image / shape /
   * shaped-text elements pass through Fabric's native toSVG unchanged
   * (shaped text is already a Group of SVG paths from the legacy hydrator).
   *
   * Trade-off: each IText with a previously-uncached (family, weight,
   * codepoint-set) triple triggers a Google Fonts fetch + woff2 → ttf
   * decode. Subsequent exports of the same text are O(1) via IndexedDB.
   * If a font fails to load (network error, unsupported family), the
   * element falls back to Fabric's <text> output rather than failing the
   * whole export.
   */
  textAsPaths?: boolean;
}

/**
 * Export the canvas as SVG. The textAsPaths option produces a print/cut-safe
 * SVG by walking IText objects and replacing each one with opentype-generated
 * paths wrapped in the same Fabric transform as the original element.
 */
export async function exportSvg(
  canvas: FabricCanvas,
  opts: ExportSvgOptions = {},
): Promise<string> {
  const baseSvg = canvas.toSVG();
  if (!opts.textAsPaths) return baseSvg;

  // Walk the canvas's IText objects in render order, generate path fragments
  // for each, and splice them into the Fabric SVG output, replacing the
  // original Fabric `<g .../><text>...</text></g>` blocks.
  const replacements = await collectTextReplacements(canvas);
  if (replacements.length === 0) return baseSvg;

  return spliceTextReplacements(baseSvg, replacements);
}

interface TextReplacement {
  /** SVG `<g>...</g>` we'll insert. */
  replacement: string;
}

async function collectTextReplacements(
  canvas: FabricCanvas,
): Promise<TextReplacement[]> {
  const out: TextReplacement[] = [];
  for (const obj of canvas.getObjects() as FabricObjectWithMeta[]) {
    if (!(obj instanceof IText)) continue;
    const fragment = await iTextToPaths(obj);
    if (!fragment) {
      out.push({ replacement: obj.toSVG() });
      continue;
    }
    // Wrap the path fragment in the same transform Fabric would have
    // emitted, so positioning / rotation / scale are preserved. We rebuild
    // the transform from the object's own properties because
    // `toSVG()`-the-method doesn't expose the matrix as a string standalone.
    const transform = buildSvgTransform(obj);
    const opacity = obj.opacity ?? 1;
    const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : '';
    out.push({
      replacement: `<g transform="${escapeXmlAttr(transform)}"${opacityAttr}>${fragment.d}</g>`,
    });
  }
  return out;
}

function buildSvgTransform(obj: IText): string {
  const cx = obj.left ?? 0;
  const cy = obj.top ?? 0;
  const angle = obj.angle ?? 0;
  const sx = obj.scaleX ?? 1;
  const sy = obj.scaleY ?? 1;
  const w = (obj.width ?? 0) * sx;
  const h = (obj.height ?? 0) * sy;
  // originX/originY = 'center' (set by hydrator) → translate so the path
  // local origin (top-left) lands at the center, then rotate, then scale.
  // matrix(a,b,c,d,e,f) where a=cosθ*sx, b=sinθ*sx, c=-sinθ*sy, d=cosθ*sy,
  // e=cx - w/2, f=cy - h/2 (before rotation pivot adjustment).
  // Easiest: emit a chain. SVG composes left-to-right.
  const tx = cx - w / 2;
  const ty = cy - h / 2;
  const parts: string[] = [];
  if (tx || ty) parts.push(`translate(${round(tx)} ${round(ty)})`);
  if (angle) {
    // Rotate around the path's center (w/2, h/2), since Fabric rotates
    // around the object center when originX/Y='center'.
    parts.push(`rotate(${round(angle)} ${round(w / 2)} ${round(h / 2)})`);
  }
  if (sx !== 1 || sy !== 1) parts.push(`scale(${round(sx)} ${round(sy)})`);
  return parts.join(' ');
}

function round(n: number, places = 2): number {
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}

/**
 * Splice generated <g>...</g> replacements into the Fabric SVG output, one
 * per IText object in render order. Fabric emits text as
 *   <g transform="..."  ...><text ...>...</text></g>
 * — we match `<text>...</text>` inside any `<g>` and replace each in
 * order. If counts don't line up (shouldn't happen, but be safe) we leave
 * the SVG alone.
 */
function spliceTextReplacements(
  baseSvg: string,
  replacements: TextReplacement[],
): string {
  // Fabric serializes text-bearing objects as a wrapping <g> + <text> tree.
  // The simplest reliable splice is to find each `<text ...>...</text>` and
  // replace, in order. The <g> wrapper already carries Fabric's transform,
  // so if we keep the <g> intact and only swap the inner <text>, the
  // positioning logic stays Fabric's.
  let i = 0;
  return baseSvg.replace(/<text\b[\s\S]*?<\/text>/g, () => {
    const r = replacements[i++];
    if (!r) return '';
    // Strip the outer <g transform> we built — the surrounding Fabric <g>
    // already provides the transform. We only want the path data.
    const inner = r.replacement.replace(/^<g[^>]*>/, '').replace(/<\/g>$/, '');
    return inner;
  });
}
