/**
 * v2 → v1 reverse converter. Walks the Fabric canvas and emits the legacy
 * DesignElement[] shape that QuotePage still consumes (by location.state)
 * and that legacy server-side renderers may also consume.
 *
 * Round-trip philosophy: every value the hydrator stashes on `obj.data`
 * (filterName, borderRadius, shapedText source params, wordSpacing) MUST be
 * re-emitted here, otherwise re-saving a hydrated v1 design would silently
 * lose those props. The reverse-engineering done here mirrors hydrateLegacy.ts —
 * any change to one needs the matching change in the other.
 *
 * Fabric → legacy coord math:
 *   - Fabric center (left, top) with originX/Y = 'center' → legacy top-left
 *     percent: (center − scaledHalfDim) / 10.
 *   - Fabric fontSize → legacy fontSize: divide by 1.25 (1000 / 800).
 */

import { FabricImage, IText, Group, type Canvas as FabricCanvas } from 'fabric';
import type { FabricObjectWithMeta } from './types';
import type { DesignElement, ViewSide } from '@/components/design-studio/types';

const LOGICAL = 1000;
const COORD_SCALE = LOGICAL / 100;
const FONT_SCALE = LOGICAL / 800;

/** Walk all canvas objects and emit the legacy DesignElement[] equivalent. */
export function extractLegacyElements(canvas: FabricCanvas): DesignElement[] {
  const out: DesignElement[] = [];
  for (const obj of canvas.getObjects() as FabricObjectWithMeta[]) {
    const el = extractOne(obj);
    if (el) out.push(el);
  }
  return out;
}

function extractOne(obj: FabricObjectWithMeta): DesignElement | null {
  const id = (obj as { id?: string }).id ?? cryptoId();
  const side: ViewSide = obj.data?.side ?? 'front';
  const opacity = obj.opacity ?? 1;
  const rotation = obj.angle ?? 0;

  // Fabric's instanceof check narrows away our `data` augmentation, so
  // each branch grabs the typed image/text/group separately and reads
  // metadata via the original FabricObjectWithMeta reference.
  if (obj instanceof FabricImage) {
    const img = obj;
    const naturalW = img.width || 1;
    const scale = img.scaleX ?? 1;
    const widthPx = naturalW * scale;
    const heightPx = (img.height || 1) * (img.scaleY ?? scale);
    const leftPx = (img.left ?? 0) - widthPx / 2;
    const topPx = (img.top ?? 0) - heightPx / 2;
    const meta = (obj as FabricObjectWithMeta).data;
    return {
      id,
      type: 'image',
      side,
      x: leftPx / COORD_SCALE,
      y: topPx / COORD_SCALE,
      width: widthPx / COORD_SCALE,
      content: img.getSrc(),
      rotation,
      opacity,
      filter: meta?.filterName ?? 'none',
      borderRadius: meta?.borderRadius,
    };
  }

  if (obj instanceof IText) {
    const t = obj;
    const fontSize = (t.fontSize ?? 24) / FONT_SCALE;
    const lineHeight = t.lineHeight ?? 1.2;
    const widthPx = (t.width || 1) * (t.scaleX ?? 1);
    const heightPx = (t.height || 1) * (t.scaleY ?? 1);
    const leftPx = (t.left ?? 0) - widthPx / 2;
    const topPx = (t.top ?? 0) - heightPx / 2;
    const meta = (obj as FabricObjectWithMeta).data;
    return {
      id,
      type: 'text',
      side,
      x: leftPx / COORD_SCALE,
      y: topPx / COORD_SCALE,
      width: widthPx / COORD_SCALE,
      content: t.text ?? '',
      fontSize,
      color: typeof t.fill === 'string' ? t.fill : '#000000',
      fontFamily: t.fontFamily ?? 'Inter',
      rotation,
      textAlign: (t.textAlign as DesignElement['textAlign']) ?? 'center',
      letterSpacing: (t.charSpacing ?? 0) / 1000,
      lineHeight,
      wordSpacing: meta?.wordSpacing,
      outline: !!t.stroke && (t.strokeWidth ?? 0) > 0,
      opacity,
    };
  }

  // Shaped-text Group: rebuild from the source params we stashed in
  // obj.data.shapedText. Fabric's group geometry isn't sufficient to
  // reconstruct legacy shape/intensity values, so the data field is the
  // only authoritative source.
  const meta = (obj as FabricObjectWithMeta).data;
  if (obj instanceof Group && meta?.shapedText) {
    const sp = meta.shapedText;
    const g = obj;
    const widthPx = (g.width || 1) * (g.scaleX ?? 1);
    const heightPx = (g.height || 1) * (g.scaleY ?? 1);
    const leftPx = (g.left ?? 0) - widthPx / 2;
    const topPx = (g.top ?? 0) - heightPx / 2;
    return {
      id,
      type: 'text',
      side,
      x: leftPx / COORD_SCALE,
      y: topPx / COORD_SCALE,
      width: widthPx / COORD_SCALE,
      content: sp.text,
      fontSize: sp.fontSize,
      color: sp.color,
      fontFamily: sp.fontFamily,
      rotation,
      outline: sp.outline,
      textShape: sp.shape,
      shapeIntensity: sp.intensity,
      opacity,
    };
  }

  return null;
}

function cryptoId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2);
}
