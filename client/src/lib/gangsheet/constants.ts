// Gang Sheet Builder Constants
// All measurements in pixels at 300 DPI unless noted

export const DPI = 300;
export const SHEET_WIDTH_INCHES = 22;
export const SHEET_WIDTH_PX = SHEET_WIDTH_INCHES * DPI; // 6,600
export const INCHES_PER_FOOT = 12;
export const PX_PER_FOOT = INCHES_PER_FOOT * DPI; // 3,600
export const MAX_SHEET_LENGTH_FT = 10;
export const MAX_SHEET_HEIGHT_PX = MAX_SHEET_LENGTH_FT * PX_PER_FOOT; // 72,000
export const MIN_SHEET_LENGTH_FT = 1;

// Display
export const DEFAULT_VIEWPORT_WIDTH = 800; // px on screen
export const DISPLAY_SCALE = DEFAULT_VIEWPORT_WIDTH / SHEET_WIDTH_PX; // ~0.121

// Layout
export const DESIGN_SPACING_PX = 30; // ~0.1" gap between designs
// Safe-zone padding from sheet edges. 0.1" (not 0.25") so two 10.75"
// designs sit side by side on the 22" sheet: 0.1 + 10.75 + 0.1 + 10.75 +
// 0.1 = 21.8" — a quarter-inch margin wrapped that pair to two rows.
export const EDGE_PADDING_IN = 0.1;
export const EDGE_PADDING_PX = Math.round(EDGE_PADDING_IN * DPI); // 30px
export const SNAP_THRESHOLD_PX = 15; // snap distance in display pixels
export const GRID_COLOR_MAJOR = '#e5e7eb'; // 1-foot lines
export const GRID_COLOR_MINOR = '#f3f4f6'; // 1-inch lines
export const GRID_LABEL_COLOR = '#9ca3af';

// Customer-facing DTF tier rates — DISPLAY FALLBACK ONLY.
//
// The builder fetches live rates from /api/gangsheet-store/config (the
// admin-editable settings) and prices every order server-side. These
// constants are used only for the tier labels/descriptions and as a
// last-resort fallback if that fetch fails.
//
// They used to read $6 / $8 / $12 — KolorMatrix's VENDOR COST, not our
// retail price — and the descriptions contradicted the configured
// turnaround promises. So a customer who hit a config-fetch failure was
// shown $6/ft and a "same day to next day" promise while checkout
// charged $11.99/ft on a 2-business-day standard. Realigned to the live
// retail settings on 2026-10-23 so the degraded path is merely stale,
// never cheaper than we charge.
//
// Keep in sync with client/src/data/businessFacts.ts (DTF_GANG_SHEET);
// scripts/check-business-facts.mjs diffs that file against production.
export const PRICING = {
  standard: { rate: 11.99, label: 'Standard', desc: 'Ready in 2 business days' },
  rush: { rate: 12.99, label: 'Rush', desc: 'Next business day — order by 11am (Mon–Fri)' },
  hotRush: { rate: 17.00, label: 'Hot Rush', desc: 'Same day — order by 10am (Mon–Fri)' },
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
