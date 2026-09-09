// Bin Packing Algorithm for Gang Sheet Layout
// MaxRects with bottom-left placement — fills holes beside tall designs
// instead of leaving shelf rows half empty.

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
 * Pack designs onto a 22"-wide strip using MaxRects (bottom-left rule).
 * Unlike shelf/NFDH packing, this fills holes: a tall design on the left
 * gets shorter designs stacked beside it instead of forcing a new row.
 */
interface FreeRect { x: number; y: number; w: number; h: number }

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
      expanded.push({ id: item.id, instanceIndex: i, width: item.width, height: item.height });
    }
  }
  if (expanded.length === 0) {
    return { placements: [], totalHeight: 0, sheetLengthFeet: 0, efficiency: 0 };
  }

  // Big first packs best: sort by the larger dimension, then area.
  expanded.sort((a, b) =>
    Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height);

  // The spacing trick: inflate every item by `spacing` on the right and
  // bottom, and widen the bin by one spacing so the rightmost column isn't
  // penalized. Edge padding stays real padding.
  const usableW = sheetWidth - 2 * EDGE_PADDING_PX + spacing;
  const BIG = 1_000_000; // virtual strip height; real height is measured after
  let free: FreeRect[] = [{ x: EDGE_PADDING_PX, y: EDGE_PADDING_PX, w: usableW, h: BIG }];
  const placements: PackPlacement[] = [];
  let totalUsedArea = 0;

  const splitFree = (r: FreeRect, used: FreeRect): FreeRect[] => {
    // No overlap → keep as is
    if (used.x >= r.x + r.w || used.x + used.w <= r.x || used.y >= r.y + r.h || used.y + used.h <= r.y) {
      return [r];
    }
    const out: FreeRect[] = [];
    if (used.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y }); // above
    if (used.y + used.h < r.y + r.h) out.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - (used.y + used.h) }); // below
    if (used.x > r.x) out.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h }); // left
    if (used.x + used.w < r.x + r.w) out.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - (used.x + used.w), h: r.h }); // right
    return out;
  };

  for (const item of expanded) {
    const w = item.width + spacing;
    const h = item.height + spacing;
    // Bottom-left rule: lowest y wins, then lowest x.
    let best: FreeRect | null = null;
    for (const r of free) {
      if (w <= r.w && h <= r.h) {
        if (!best || r.y < best.y || (r.y === best.y && r.x < best.x)) best = r;
      }
    }
    // Nothing fits (shouldn't happen with the virtual-height bin unless the
    // item is wider than the sheet) — drop it at the current bottom.
    const px = best ? best.x : EDGE_PADDING_PX;
    const py = best ? best.y : placements.reduce((m, pl) => Math.max(m, pl.y + pl.height + spacing), EDGE_PADDING_PX);
    placements.push({ id: item.id, instanceIndex: item.instanceIndex, x: px, y: py, width: item.width, height: item.height });
    totalUsedArea += item.width * item.height;

    const used: FreeRect = { x: px, y: py, w, h };
    const next: FreeRect[] = [];
    for (const r of free) next.push(...splitFree(r, used));
    // Prune contained rects
    free = next.filter((a, i) => !next.some((b, j) =>
      j !== i && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h
      && (b.w > a.w || b.h > a.h || j < i)));
  }

  const contentBottom = placements.reduce((m, pl) => Math.max(m, pl.y + pl.height), 0);
  const totalHeight = contentBottom + EDGE_PADDING_PX;
  const sheetLengthFeet = totalHeight / 3600; // PX_PER_FOOT
  const sheetArea = sheetWidth * totalHeight;
  const efficiency = sheetArea > 0 ? totalUsedArea / sheetArea : 0;

  return { placements, totalHeight, sheetLengthFeet, efficiency };
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
