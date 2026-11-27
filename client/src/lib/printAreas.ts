// Standard apparel imprint areas, drawn on the studio canvas as a GUIDE.
//
// Read this before trusting the numbers: these are industry-typical maxima
// for a standard adult garment on a standard platen, NOT measurements of
// our own equipment and NOT a constraint. The studio deliberately lets
// artwork go anywhere on the garment ("WYSIWYG without bounds" — see
// DesignStudioPage), and this does not change that. It only tells the
// customer where a design normally lands so they are not surprised at
// proof time. Nothing is clamped, blocked, or rejected against it.
//
// Replace these with the shop's real platen and hoop sizes when we have
// them, and the inches in the label become true rather than conventional.

export interface ImprintArea {
  /** Max imprint width in inches. */
  widthIn: number;
  /** Max imprint height in inches. */
  heightIn: number;
}

// Keyed the same way the empty-state ghost branches: sleeve, back, hooded
// front, plain front. Hoodies get a shorter front box because the pouch
// pocket eats the bottom of the print field.
const AREAS: Record<'front' | 'frontHooded' | 'back' | 'sleeve', ImprintArea> = {
  front: { widthIn: 12, heightIn: 16 },
  frontHooded: { widthIn: 12, heightIn: 14 },
  back: { widthIn: 12, heightIn: 16 },
  sleeve: { widthIn: 4, heightIn: 4 },
};

export function imprintAreaFor(view: string, isHooded: boolean): ImprintArea {
  if (view === 'sleeve' || view === 'sleeve_left') return AREAS.sleeve;
  if (view === 'back') return AREAS.back;
  return isHooded ? AREAS.frontHooded : AREAS.front;
}

// The garment model the rest of the canvas already assumes: a standard
// adult shirt is ~28in tall and is photographed filling ~90% of the canvas
// height, with the collar near 13% from the top. That is documented on the
// empty-state placeholder in DesignStudioPage and the two must agree, or
// the "Your Design Here" ghost will sit outside the print box it is
// supposed to be inside.
const GARMENT_INCHES_TALL = 28;
const GARMENT_FRACTION_OF_CANVAS_HEIGHT = 0.9;
const PCT_HEIGHT_PER_INCH = (GARMENT_FRACTION_OF_CANVAS_HEIGHT * 100) / GARMENT_INCHES_TALL;

// Top of the print field per view, as % of canvas height. Same anchors as
// the empty-state ghost — change both together.
export function imprintTopPct(view: string, isHooded: boolean): number {
  if (view === 'sleeve' || view === 'sleeve_left') return 45;
  if (view === 'back') return 25;
  return isHooded ? 34 : 18;
}

/**
 * Convert an imprint area in inches to a canvas-% rect.
 *
 * The product photo is `object-contain`, so its horizontal and vertical
 * pixel scales are equal — but the canvas box is not square unless
 * canvasInches === canvasInchesH. So an inch is a fixed % of canvas
 * HEIGHT, and converting that to a % of canvas WIDTH has to be divided by
 * the box's aspect ratio. Getting this backwards makes the guide box
 * visibly non-square on any non-square canvas.
 */
export function imprintRectPct(
  area: ImprintArea,
  view: string,
  isHooded: boolean,
  canvasInches: number,
  canvasInchesH: number,
): { left: number; top: number; width: number; height: number } {
  const aspect = canvasInches > 0 && canvasInchesH > 0 ? canvasInchesH / canvasInches : 1;
  const height = area.heightIn * PCT_HEIGHT_PER_INCH;
  const width = area.widthIn * PCT_HEIGHT_PER_INCH * aspect;
  return {
    left: Math.max(0, 50 - width / 2), // centred on the garment
    top: imprintTopPct(view, isHooded),
    width,
    height,
  };
}

export function imprintLabel(area: ImprintArea): string {
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  return `${fmt(area.widthIn)} × ${fmt(area.heightIn)}″ typical print area`;
}
