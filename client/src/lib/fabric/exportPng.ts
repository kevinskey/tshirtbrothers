import type { Canvas as FabricCanvas } from 'fabric';

export interface ExportPngOptions {
  /**
   * When true, the canvas's backgroundImage and backgroundColor are
   * temporarily cleared during export so the resulting PNG has a true
   * alpha channel (the design appears on a transparent background).
   * Restored immediately after.
   */
  transparent?: boolean;

  /**
   * Output resolution multiplier. If omitted but `printInches` is given,
   * we compute it from the canvas's logical width.
   *
   * Example: a 1000px logical canvas exporting at 12" × 300dpi wants
   * 3600px wide → multiplier = 3.6.
   */
  multiplier?: number;

  /** Target print width in inches. Combined with `dpi` to compute the multiplier. */
  printInches?: number;

  /** Target DPI for print. Defaults to 300 (industry standard). */
  dpi?: number;
}

/**
 * Compute a Fabric multiplier from physical print dimensions. Centralized
 * here so PNG export and any other DPI-aware downstream uses agree on the
 * math.
 */
export function getExportMultiplier(
  canvasLogicalWidth: number,
  printInches: number,
  dpi = 300,
): number {
  if (canvasLogicalWidth <= 0) return 1;
  return (printInches * dpi) / canvasLogicalWidth;
}

/**
 * Export the canvas as a PNG data URL. Wraps `canvas.toDataURL` with
 * print-DPI math and transparent-background handling so individual
 * callers don't reimplement it.
 */
export function exportPng(canvas: FabricCanvas, opts: ExportPngOptions = {}): string {
  const multiplier = opts.multiplier
    ?? (opts.printInches != null
      ? getExportMultiplier(canvas.getWidth(), opts.printInches, opts.dpi ?? 300)
      : 1);

  if (!opts.transparent) {
    return canvas.toDataURL({ format: 'png', multiplier, quality: 1 });
  }

  const savedBgImage = canvas.backgroundImage;
  const savedBgColor = canvas.backgroundColor;
  canvas.backgroundImage = undefined;
  // Fabric's TS types want a string here; cast through unknown so we can
  // null it cleanly for the export window.
  canvas.backgroundColor = undefined as unknown as string;
  try {
    return canvas.toDataURL({ format: 'png', multiplier, quality: 1 });
  } finally {
    canvas.backgroundImage = savedBgImage;
    canvas.backgroundColor = savedBgColor;
    canvas.renderAll();
  }
}
