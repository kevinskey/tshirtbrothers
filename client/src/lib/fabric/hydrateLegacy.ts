/**
 * v1 → v2 hydrator. Takes the legacy DesignElement[] shape (positioned-div
 * percentages on an 800px reference canvas) and adds equivalent Fabric
 * objects to the canvas.
 *
 * Coordinate translation:
 *   - Legacy x, y, width are 0-100 percent. Logical Fabric canvas is 1000×1000,
 *     so percent × 10 = pixel position.
 *   - Legacy fontSize is in 800px reference space (the export canvas). Logical
 *     Fabric canvas is 1000px, so multiply by 1000/800 = 1.25.
 *   - Legacy CSS rotation pivots around the element's CENTER (default
 *     transform-origin). Fabric defaults to top-left. We use originX/Y =
 *     'center' on hydrated objects so the visual stays put.
 *
 * Shaped text: rendered to an SVG string identical to the legacy ShapedText
 * component, then loaded via fabric.loadSVGFromString into a Group. Source
 * params are stashed on object.data.shapedText so a future re-edit panel can
 * rebuild the SVG.
 */

import {
  IText, util, loadSVGFromString,
  filters as fabricFilters,
  type Canvas as FabricCanvas,
  type FabricObject,
} from 'fabric';
import { loadFabricImage } from './loadImage';
import { loadGoogleFonts } from './googleFonts';
import { buildShapedTextSvg, type ShapeName } from './shapedTextSvg';
import type { FabricObjectMeta, FabricObjectWithMeta } from './types';
import type { DesignElement } from '@/components/design-studio/types';

const LOGICAL = 1000;
const COORD_SCALE = LOGICAL / 100; // percent → px (10)
const FONT_SCALE = LOGICAL / 800;  // legacy font ref → logical (1.25)

/**
 * Hydrate a Fabric canvas from a legacy DesignElement[]. Loads any required
 * Google Fonts before placing text — without this, IText measures glyph widths
 * using the fallback and the layout drifts when the webfont arrives later.
 */
export async function hydrateLegacyElements(
  canvas: FabricCanvas,
  elements: DesignElement[],
): Promise<void> {
  const fonts = elements
    .filter((el) => el.type === 'text' && el.fontFamily)
    .map((el) => el.fontFamily as string);
  await loadGoogleFonts(fonts);
  await document.fonts.ready;

  for (const el of elements) {
    const obj = await convertElement(el);
    if (obj) canvas.add(obj);
  }
  canvas.renderAll();
}

async function convertElement(el: DesignElement): Promise<FabricObject | null> {
  const meta: FabricObjectMeta = { side: el.side ?? 'front' };
  if (el.type === 'image') return convertImage(el, meta);
  if (el.type === 'text') {
    if (el.textShape && el.textShape !== 'normal') {
      return convertShapedText(el, meta);
    }
    return convertPlainText(el, meta);
  }
  return null;
}

async function convertImage(
  el: DesignElement,
  meta: FabricObjectMeta,
): Promise<FabricObject> {
  const img = await loadFabricImage(el.content);
  const widthPx = el.width * COORD_SCALE;
  const naturalW = img.width || 1;
  const naturalH = img.height || 1;
  const scale = widthPx / naturalW;
  const heightPx = naturalH * scale;
  const leftPx = el.x * COORD_SCALE;
  const topPx = el.y * COORD_SCALE;

  img.set({
    left: leftPx + widthPx / 2,
    top: topPx + heightPx / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    angle: el.rotation ?? 0,
    opacity: el.opacity ?? 1,
  });

  const filterName = el.filter ?? 'none';
  if (filterName !== 'none') {
    img.filters = buildImageFilters(filterName);
    img.applyFilters();
  }

  meta.filterName = filterName;
  if (el.borderRadius != null) meta.borderRadius = el.borderRadius;
  (img as FabricObjectWithMeta).data = meta;
  return img;
}

function buildImageFilters(name: NonNullable<DesignElement['filter']>) {
  switch (name) {
    case 'grayscale': return [new fabricFilters.Grayscale()];
    case 'invert': return [new fabricFilters.Invert()];
    case 'sepia': return [new fabricFilters.Sepia()];
    // Legacy 'bw' = grayscale(100%) contrast(1000%). Fabric's BlackWhite
    // filter produces a 1-bit black/white look that matches the legacy
    // intent better than chaining grayscale + extreme contrast.
    case 'bw': return [new fabricFilters.BlackWhite()];
    default: return [];
  }
}

function convertPlainText(el: DesignElement, meta: FabricObjectMeta): FabricObject {
  const fontSize = (el.fontSize ?? 24) * FONT_SCALE;
  const lineHeight = el.lineHeight ?? 1.2;
  const widthPx = el.width * COORD_SCALE;
  const leftPx = el.x * COORD_SCALE;
  const topPx = el.y * COORD_SCALE;

  const text = new IText(el.content, {
    fontSize,
    fontFamily: el.fontFamily ?? 'Inter',
    fontWeight: 'bold',
    fill: el.color ?? '#000000',
    textAlign: el.textAlign ?? 'center',
    // Fabric's charSpacing is in 1/1000 em — legacy letterSpacing is in em.
    charSpacing: (el.letterSpacing ?? 0) * 1000,
    lineHeight,
    stroke: el.outline ? 'rgba(0,0,0,0.5)' : undefined,
    strokeWidth: el.outline ? 1 : 0,
    paintFirst: el.outline ? 'stroke' : 'fill',
    opacity: el.opacity ?? 1,
    angle: el.rotation ?? 0,
    originX: 'center',
    originY: 'center',
    // Legacy element box height ≈ fontSize * lineHeight; center it so the
    // top-left of that box lines up with (el.x, el.y) post-rotation.
    left: leftPx + widthPx / 2,
    top: topPx + (fontSize * lineHeight) / 2,
  });

  if (el.wordSpacing != null) meta.wordSpacing = el.wordSpacing;
  (text as FabricObjectWithMeta).data = meta;
  return text;
}

async function convertShapedText(
  el: DesignElement,
  meta: FabricObjectMeta,
): Promise<FabricObject | null> {
  const svg = buildShapedTextSvg({
    text: el.content,
    shape: el.textShape as ShapeName,
    intensity: el.shapeIntensity ?? 50,
    fontSize: el.fontSize ?? 24,
    fontFamily: el.fontFamily ?? 'Inter',
    color: el.color ?? '#ffffff',
    outline: el.outline,
    letterSpacing: el.letterSpacing,
    wordSpacing: el.wordSpacing,
  });

  const result = await loadSVGFromString(svg);
  // Filter out null/undefined children that loadSVGFromString can return
  // for unsupported nodes — without this, groupSVGElements throws.
  const children = result.objects.filter((o): o is FabricObject => !!o);
  if (children.length === 0) return null;
  const group = util.groupSVGElements(children, result.options) as FabricObject;

  const widthPx = el.width * COORD_SCALE;
  const leftPx = el.x * COORD_SCALE;
  const topPx = el.y * COORD_SCALE;
  const groupW = group.width || 1;
  const groupH = group.height || 1;
  const scale = widthPx / groupW;
  const renderedH = groupH * scale;

  group.set({
    left: leftPx + widthPx / 2,
    top: topPx + renderedH / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    angle: el.rotation ?? 0,
    opacity: el.opacity ?? 1,
  });

  meta.shapedText = {
    text: el.content,
    shape: el.textShape ?? 'normal',
    intensity: el.shapeIntensity ?? 50,
    fontFamily: el.fontFamily ?? 'Inter',
    fontSize: el.fontSize ?? 24,
    color: el.color ?? '#ffffff',
    outline: !!el.outline,
  };
  (group as FabricObjectWithMeta).data = meta;
  return group;
}
