/**
 * SVG markup builder for legacy "shaped text" — text rendered along a curved /
 * arched / circular path. Lifted verbatim (with prop names preserved) from
 * DesignStudioPage's <ShapedText> React component so the v1 → v2 hydrator
 * produces visually identical output. Whenever DesignStudioPage's shape math
 * changes, mirror it here.
 *
 * The result is a self-contained <svg> string that Fabric's loadSVGFromString
 * can consume to produce a Group of <text>/<path>/<tspan> objects.
 */

export type ShapeName =
  | 'normal' | 'curve' | 'arch' | 'bridge' | 'valley' | 'pinch' | 'bulge'
  | 'perspective' | 'pointed' | 'downward' | 'upward' | 'cone'
  | 'circle' | 'circle-bottom';

function getShapePath(shape: ShapeName, intensity: number): string {
  const i = intensity / 100;
  const d = Math.round(40 * i);
  switch (shape) {
    case 'curve': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'arch': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'bridge': return `M 10,${50 - d} Q 60,${50 + d} 100,${50 - d} Q 140,${50 + d} 190,${50 - d}`;
    case 'valley': return `M 10,${50 - d} Q 100,${50 + d * 2} 190,${50 - d}`;
    case 'pinch': return `M 10,${50 + d} Q 60,50 100,${50 + d} Q 140,50 190,${50 + d}`;
    case 'bulge': return `M 10,50 Q 60,${50 - d} 100,50 Q 140,${50 - d} 190,50`;
    case 'perspective': return `M 10,${50 + d} L 190,${50 - d}`;
    case 'pointed': return `M 10,${50 + d} L 100,${50 - d} L 190,${50 + d}`;
    case 'downward': return `M 10,${50 - d} Q 100,${50 + d * 2} 190,${50 - d}`;
    case 'upward': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'cone': return `M 10,${50 + d} L 100,${50 - d * 1.5} L 190,${50 + d}`;
    case 'circle': {
      const r = 40 + (i * 30);
      return `M 100,${100 - r} A ${r},${r} 0 1,1 99.99,${100 - r}`;
    }
    case 'circle-bottom': {
      const r2 = 40 + (i * 30);
      return `M 100,${100 + r2} A ${r2},${r2} 0 1,0 99.99,${100 + r2}`;
    }
    default: return 'M 10,50 L 190,50';
  }
}

export interface ShapedTextSvgParams {
  text: string;
  shape: ShapeName;
  intensity: number;
  fontSize: number; // legacy 800px-space font size
  fontFamily: string;
  color: string;
  outline?: boolean;
  letterSpacing?: number; // em
  wordSpacing?: number;   // em
}

/** Returns a complete <svg>...</svg> string. */
export function buildShapedTextSvg(params: ShapedTextSvgParams): string {
  const { text, shape, intensity, fontSize, fontFamily, color, outline,
    letterSpacing = 0, wordSpacing = 0 } = params;
  const isCircle = shape === 'circle' || shape === 'circle-bottom';
  const scaledSize = isCircle ? fontSize * 0.35 : fontSize * 0.5;
  const vb = isCircle ? '0 0 200 200' : '0 0 200 100';
  const path = getShapePath(shape, intensity);
  const pathId = `shape-${shape}-${intensity}-${text.length}-${letterSpacing}-${wordSpacing}`;
  const letterDx = letterSpacing * scaledSize;
  const wordDx = wordSpacing * scaledSize;

  const chars = Array.from(text);
  const tspans = chars.map((ch, i) => {
    let dx = 0;
    if (i > 0) {
      dx = letterDx;
      if (chars[i - 1] === ' ') dx += wordDx;
    }
    const dxAttr = dx ? ` dx="${dx}"` : '';
    const safe = ch === ' ' ? ' ' : escapeXml(ch);
    return `<tspan${dxAttr}>${safe}</tspan>`;
  }).join('');

  const outlineStyle = outline
    ? ' style="stroke: rgba(0,0,0,0.5); stroke-width: 1; paint-order: stroke fill;"'
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">`,
    '<defs>',
    `<path id="${pathId}" d="${path}" fill="none"/>`,
    '</defs>',
    `<text fill="${escapeAttr(color)}" font-family="${escapeAttr(fontFamily)}" font-size="${scaledSize}" font-weight="700" text-anchor="middle"${outlineStyle}>`,
    `<textPath href="#${pathId}" startOffset="50%">`,
    tspans,
    '</textPath>',
    '</text>',
    '</svg>',
  ].join('');
}

function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;');
}
function escapeAttr(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;');
}
