/**
 * Bottom-left status bar showing the selected element's width / height in
 * percent of the design canvas plus inches assuming a standard 12" t-shirt
 * print area. Hidden when nothing is selected.
 *
 * Assumption: PRINT_WIDTH_INCHES = 12. Industry-standard adult-tee chest
 * print width. Change here if your most common print size differs (11" for
 * youth tees, 14" for plus-size, etc.) — every other inches calculation in
 * the studio derives from this constant.
 */

const PRINT_WIDTH_INCHES = 12;

interface DimensionReadoutProps {
  /** The selected element, or null. */
  element: {
    type: 'image' | 'text';
    width: number;        // legacy percent (0-100)
    fontSize?: number;    // text only — used to estimate height
    lineHeight?: number;
    content?: string;     // text only — used to count newlines
  } | null;
  /**
   * Optional: the selected element's actual rendered aspect ratio
   * (height/width). When provided, the readout shows real height in
   * inches. Without it, height is shown only for text (estimated from
   * fontSize) and omitted for images. The page passes naturalHeight /
   * naturalWidth from a ref'd <img> tag when available.
   */
  imageAspect?: number;
}

export function DimensionReadout({ element, imageAspect }: DimensionReadoutProps) {
  if (!element) return null;

  const widthPct = element.width;
  const widthInches = (widthPct / 100) * PRINT_WIDTH_INCHES;

  let heightLine: string | null = null;
  if (element.type === 'image' && imageAspect && imageAspect > 0) {
    const heightInches = widthInches * imageAspect;
    const heightPct = (heightInches / PRINT_WIDTH_INCHES) * 100;
    heightLine = `H: ${heightPct.toFixed(0)}% (${heightInches.toFixed(1)}″)`;
  } else if (element.type === 'text') {
    // Estimate text box height from fontSize × lineHeight × line count.
    // fontSize is in legacy 800-px reference space, so convert.
    const fontPx = (element.fontSize ?? 24) * (PRINT_WIDTH_INCHES / 800);
    const lh = element.lineHeight ?? 1.2;
    const lines = (element.content ?? '').split('\n').length || 1;
    const heightInches = fontPx * lh * lines;
    heightLine = `H: ~${heightInches.toFixed(1)}″`;
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-md bg-black/70 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-mono text-white shadow-lg">
      <div>W: {widthPct.toFixed(0)}% ({widthInches.toFixed(1)}″)</div>
      {heightLine && <div className="text-white/80">{heightLine}</div>}
      <div className="text-white/40 text-[9px] mt-0.5">at 12″ print</div>
    </div>
  );
}
