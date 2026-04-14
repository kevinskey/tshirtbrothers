// Bin Packing Algorithm for Gang Sheet Layout
// Uses Next-Fit Decreasing Height (NFDH) — optimal for strip packing

import { SHEET_WIDTH_PX, DESIGN_SPACING_PX, EDGE_PADDING_PX } from './constants';

export interface PackItem {
  id: string;
  width: number;   // pixels at 300 DPI
  height: number;  // pixels at 300 DPI
  quantity: number; // how many copies
}

export interface PackPlacement {
  id: string;
  instanceIndex: number; // 0-based index for duplicates
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackResult {
  placements: PackPlacement[];
  totalHeight: number;
  sheetLengthFeet: number;
  efficiency: number; // 0-1, ratio of used area to sheet area
}

/**
 * Pack designs onto a 22"-wide gang sheet using NFDH algorithm
 * Returns optimal placements and total sheet height needed
 */
export function packDesigns(
  items: PackItem[],
  sheetWidth: number = SHEET_WIDTH_PX,
  spacing: number = DESIGN_SPACING_PX
): PackResult {
  // Expand items by quantity
  const expanded: { id: string; instanceIndex: number; width: number; height: number }[] = [];
  for (const item of items) {
    const qty = Math.max(1, item.quantity || 1);
    for (let i = 0; i < qty; i++) {
      expanded.push({
        id: item.id,
        instanceIndex: i,
        width: item.width,
        height: item.height,
      });
    }
  }

  if (expanded.length === 0) {
    return { placements: [], totalHeight: 0, sheetLengthFeet: 0, efficiency: 0 };
  }

  // Sort by height descending (tallest first for better packing)
  expanded.sort((a, b) => b.height - a.height);

  const placements: PackPlacement[] = [];
  // Respect 0.25" safe-zone padding from the top and left
  let currentShelfY = EDGE_PADDING_PX;
  let currentShelfHeight = 0;
  let currentX = EDGE_PADDING_PX;
  let totalUsedArea = 0;

  for (const item of expanded) {
    // Check if item fits in current row (respect right-edge padding too)
    if (currentX + item.width > sheetWidth - EDGE_PADDING_PX) {
      // Start new shelf
      currentShelfY += currentShelfHeight + spacing;
      currentX = EDGE_PADDING_PX;
      currentShelfHeight = 0;
    }

    // Place item
    placements.push({
      id: item.id,
      instanceIndex: item.instanceIndex,
      x: currentX,
      y: currentShelfY,
      width: item.width,
      height: item.height,
    });

    totalUsedArea += item.width * item.height;
    currentX += item.width + spacing;
    currentShelfHeight = Math.max(currentShelfHeight, item.height);
  }

  const totalHeight = currentShelfY + currentShelfHeight + EDGE_PADDING_PX;
  const sheetLengthFeet = totalHeight / 3600; // PX_PER_FOOT
  const sheetArea = sheetWidth * totalHeight;
  const efficiency = sheetArea > 0 ? totalUsedArea / sheetArea : 0;

  return {
    placements,
    totalHeight,
    sheetLengthFeet,
    efficiency,
  };
}

/**
 * Calculate how many designs of a given size fit per foot of sheet
 */
export function designsPerFoot(
  designWidth: number,
  designHeight: number,
  sheetWidth: number = SHEET_WIDTH_PX,
  spacing: number = DESIGN_SPACING_PX
): number {
  const across = Math.floor((sheetWidth - spacing) / (designWidth + spacing));
  const rows = Math.floor(3600 / (designHeight + spacing)); // 3600 = PX_PER_FOOT
  return Math.max(1, across * rows);
}
