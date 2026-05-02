import type { Canvas as FabricCanvas } from 'fabric';

export interface ExportSvgOptions {
  /**
   * If true, every <text> element is converted to <path> via opentype.js
   * so the SVG renders correctly in cutting software (Cricut, Silhouette)
   * regardless of whether the font is installed locally.
   *
   * Phase 1 of the Fabric port ships with this opt-in but the actual
   * opentype.js wiring lands in PR #4 — the signature is async ahead of
   * time so callers don't break when path conversion turns on.
   */
  textAsPaths?: boolean;
}

/**
 * Export the canvas as SVG. Async-by-default because the textAsPaths
 * option (PR #4) needs to fetch font binaries via opentype.js — we don't
 * want to refactor every caller from sync to async later.
 */
export async function exportSvg(canvas: FabricCanvas, opts: ExportSvgOptions = {}): Promise<string> {
  // textAsPaths handling lands in PR #4 (opentype.js wiring + IndexedDB
  // font cache). Until then, this is a thin wrapper around Fabric's
  // native toSVG which preserves <text> elements as-is.
  void opts;
  return canvas.toSVG();
}
