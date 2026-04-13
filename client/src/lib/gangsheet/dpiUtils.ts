// DPI validation utilities for print-ready gang sheets

import { DPI } from './constants';

export type DPIStatus = 'good' | 'warning' | 'danger';

/**
 * Calculate the effective DPI of an image at a given print size
 */
export function calculateDPI(naturalWidthPx: number, printWidthInches: number): number {
  if (printWidthInches <= 0) return 0;
  return Math.round(naturalWidthPx / printWidthInches);
}

/**
 * Get DPI quality status
 * good: >= 300 DPI (print ready)
 * warning: 150-299 DPI (acceptable but not ideal)
 * danger: < 150 DPI (will look pixelated)
 */
export function getDPIStatus(dpi: number): DPIStatus {
  if (dpi >= 300) return 'good';
  if (dpi >= 150) return 'warning';
  return 'danger';
}

/**
 * Get the maximum print width (in inches) for an image at minimum DPI
 */
export function getMaxPrintWidth(naturalWidthPx: number, minDPI: number = DPI): number {
  return naturalWidthPx / minDPI;
}

/**
 * Get the maximum print height (in inches) for an image at minimum DPI
 */
export function getMaxPrintHeight(naturalHeightPx: number, minDPI: number = DPI): number {
  return naturalHeightPx / minDPI;
}

/**
 * Calculate DPI for both dimensions and return the lower one
 */
export function getEffectiveDPI(
  naturalWidth: number,
  naturalHeight: number,
  printWidthInches: number,
  printHeightInches: number
): number {
  const dpiW = calculateDPI(naturalWidth, printWidthInches);
  const dpiH = calculateDPI(naturalHeight, printHeightInches);
  return Math.min(dpiW, dpiH);
}

/**
 * Status colors for UI
 */
export const DPI_COLORS: Record<DPIStatus, { bg: string; text: string; border: string; label: string }> = {
  good: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'Print Ready' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: 'Low Res' },
  danger: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'Too Low' },
};

/**
 * Read image dimensions from a File or URL
 */
export function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
