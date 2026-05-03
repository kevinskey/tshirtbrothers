/**
 * Bottom-left status bar showing the selected element's width / height in
 * inches (and percent of canvas). Inches are computed against the live
 * `canvasInches` prop so changing the print size in the header cascades
 * through immediately. Hidden when nothing is selected.
 */

interface DimensionReadoutProps {
  /** The selected element, or null. */
  element: {
    type: 'image' | 'text';
    width: number;        // legacy percent (0-100)
    fontSize?: number;    // text only — used to estimate height
    lineHeight?: number;
    content?: string;     // text only — used to count newlines
  } | null;
  /** Print-area width in inches. */
  canvasInches: number;
  /** Print-area height in inches. */
  canvasInchesH: number;
  /**
   * Optional: the selected element's actual rendered aspect ratio
   * (height/width). When provided, the readout shows real height in
   * inches for images. Without it, height is shown only for text
   * (estimated from fontSize) and omitted for images.
   */
  imageAspect?: number;
}

export function DimensionReadout({ element, canvasInches, canvasInchesH, imageAspect }: DimensionReadoutProps) {
  if (!element) return null;

  const widthPct = element.width;
  const widthInches = (widthPct / 100) * canvasInches;

  let heightLine: string | null = null;
  if (element.type === 'image' && imageAspect && imageAspect > 0) {
    // Image's pixel height = pixel width × imageAspect. In inches that's
    // widthInches × imageAspect. Heightpercent is the inches/canvasInchesH.
    const heightInches = widthInches * imageAspect;
    const heightPct = (heightInches / canvasInchesH) * 100;
    heightLine = `H: ${heightPct.toFixed(0)}% (${heightInches.toFixed(1)}″)`;
  } else if (element.type === 'text') {
    // Estimate text-box height from fontSize × lineHeight × line count.
    // fontSize is in legacy 800-px reference (mapped to canvas WIDTH);
    // convert via canvasInches / 800 = inches per reference unit.
    const fontPx = (element.fontSize ?? 24) * (canvasInches / 800);
    const lh = element.lineHeight ?? 1.2;
    const lines = (element.content ?? '').split('\n').length || 1;
    const heightInches = fontPx * lh * lines;
    heightLine = `H: ~${heightInches.toFixed(1)}″`;
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-md bg-black/70 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-mono text-white shadow-lg">
      <div>W: {widthPct.toFixed(0)}% ({widthInches.toFixed(1)}″)</div>
      {heightLine && <div className="text-white/80">{heightLine}</div>}
      <div className="text-white/40 text-[9px] mt-0.5">at {canvasInches}×{canvasInchesH}″ print</div>
    </div>
  );
}
