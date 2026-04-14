// Gang Sheet Builder Constants
// All measurements in pixels at 300 DPI unless noted

export const DPI = 300;
export const SHEET_WIDTH_INCHES = 22;
export const SHEET_WIDTH_PX = SHEET_WIDTH_INCHES * DPI; // 6,600
export const INCHES_PER_FOOT = 12;
export const PX_PER_FOOT = INCHES_PER_FOOT * DPI; // 3,600
export const MAX_SHEET_LENGTH_FT = 20;
export const MAX_SHEET_HEIGHT_PX = MAX_SHEET_LENGTH_FT * PX_PER_FOOT; // 72,000
export const MIN_SHEET_LENGTH_FT = 1;

// Display
export const DEFAULT_VIEWPORT_WIDTH = 800; // px on screen
export const DISPLAY_SCALE = DEFAULT_VIEWPORT_WIDTH / SHEET_WIDTH_PX; // ~0.121

// Layout
export const DESIGN_SPACING_PX = 30; // ~0.1" gap between designs
export const EDGE_PADDING_IN = 0.25; // safe-zone padding from sheet edges
export const EDGE_PADDING_PX = Math.round(EDGE_PADDING_IN * DPI); // 75px
export const SNAP_THRESHOLD_PX = 15; // snap distance in display pixels
export const GRID_COLOR_MAJOR = '#e5e7eb'; // 1-foot lines
export const GRID_COLOR_MINOR = '#f3f4f6'; // 1-inch lines
export const GRID_LABEL_COLOR = '#9ca3af';

// Pricing (KolorMatrix)
export const PRICING = {
  standard: { rate: 6.00, label: 'Standard', desc: 'Same day to next day (Mon-Fri)' },
  rush: { rate: 8.00, label: 'Rush', desc: '5-hour service (cutoff 11am)' },
  hotRush: { rate: 12.00, label: 'Hot Rush', desc: '1-2 hour service (cutoff 1:30pm)' },
} as const;

export type PricingTier = keyof typeof PRICING;

// Size presets (common design sizes)
export const SIZE_PRESETS = [
  { label: 'Left Chest', width: 4, height: 4 },
  { label: 'Small Logo', width: 5, height: 5 },
  { label: 'Medium', width: 8, height: 10 },
  { label: 'Standard Front', width: 10, height: 12 },
  { label: 'Large', width: 12, height: 12 },
  { label: 'Oversized', width: 14, height: 16 },
  { label: 'Full Front', width: 16, height: 20 },
] as const;

// Helpers
export function inchesToPx(inches: number): number {
  return Math.round(inches * DPI);
}

export function pxToInches(px: number): number {
  return px / DPI;
}

export function pxToFeet(px: number): number {
  return px / PX_PER_FOOT;
}

export function feetToPx(feet: number): number {
  return Math.round(feet * PX_PER_FOOT);
}

export function calculateSheetCost(lengthFt: number, tier: PricingTier): number {
  const clamped = Math.max(MIN_SHEET_LENGTH_FT, Math.ceil(lengthFt));
  return clamped * PRICING[tier].rate;
}
