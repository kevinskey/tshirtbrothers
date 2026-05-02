/**
 * Phase 2 PR #13 — smart guides + snapping for the Fabric design studio.
 *
 * Behavior:
 *   - During a drag, compute the moving object's bounding box (center + four
 *     edges in canvas coords).
 *   - For each STATIC object on the canvas (and the canvas's own center
 *     cross), check whether the moving object's edges or center are within
 *     SNAP_THRESHOLD_PX of any of theirs.
 *   - If so: nudge the moving object's left/top so the alignment is exact,
 *     and draw a thin guide line on the canvas's overlay layer at that
 *     coordinate.
 *   - Erase the guides on `mouse:up` (the after-drag tidy-up).
 *
 * Held key:
 *   - Alt / Option while dragging disables snapping for that drag (Adobe
 *     convention — "I want to place exactly here, ignore the magnets").
 *
 * Why not draw via Fabric objects:
 *   Adding fabric.Line objects to the main canvas would put them in the
 *   render tree, mess with selection, and make object:added events noisy.
 *   Instead we draw on the canvas's contextTop overlay (the same layer
 *   Fabric uses for its own selection rectangle), which is cleared on
 *   every render tick and doesn't interact with hit-testing.
 *
 * Returns a dispose function — call on canvas teardown.
 */

import type {
  Canvas as FabricCanvas,
  FabricObject,
} from 'fabric';

const SNAP_THRESHOLD_PX = 8;
const GUIDE_COLOR = 'rgba(236, 72, 153, 0.95)';   // tailwind pink-500
const GUIDE_LINE_WIDTH = 1;

// Each potential snap target is one axis-aligned coordinate on the
// canvas — either a vertical line (X-coord) or a horizontal line (Y-coord).
interface SnapLine {
  axis: 'x' | 'y';
  /** Coordinate on the relevant axis (canvas pixels in the logical space). */
  coord: number;
}

export function attachSmartGuides(canvas: FabricCanvas): () => void {
  let activeGuides: SnapLine[] = [];
  let altPressed = false;

  // Track Alt — "hold to disable snapping" matches Photoshop/Illustrator.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey) altPressed = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!e.altKey) altPressed = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onMoving = (e: { target?: FabricObject }) => {
    const target = e.target;
    if (!target) return;
    if (altPressed) {
      activeGuides = [];
      drawGuides(canvas, activeGuides);
      return;
    }

    const moving = boundsOf(target);
    const targets: SnapLine[] = collectStaticTargets(canvas, target);

    // For each axis, find the closest target within threshold.
    const xCandidates = [moving.cx, moving.left, moving.right];
    const yCandidates = [moving.cy, moving.top, moving.bottom];

    let dx = 0;
    let dy = 0;
    let bestX: { coord: number; delta: number } | null = null;
    let bestY: { coord: number; delta: number } | null = null;

    for (const t of targets) {
      const candidates = t.axis === 'x' ? xCandidates : yCandidates;
      for (const v of candidates) {
        const delta = t.coord - v;
        if (Math.abs(delta) > SNAP_THRESHOLD_PX) continue;
        if (t.axis === 'x') {
          if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
            bestX = { coord: t.coord, delta };
          }
        } else {
          if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
            bestY = { coord: t.coord, delta };
          }
        }
      }
    }

    activeGuides = [];
    if (bestX) {
      dx = bestX.delta;
      activeGuides.push({ axis: 'x', coord: bestX.coord });
    }
    if (bestY) {
      dy = bestY.delta;
      activeGuides.push({ axis: 'y', coord: bestY.coord });
    }
    if (dx || dy) {
      target.set({
        left: (target.left ?? 0) + dx,
        top: (target.top ?? 0) + dy,
      });
      target.setCoords();
    }
    drawGuides(canvas, activeGuides);
  };

  const onMouseUp = () => {
    activeGuides = [];
    drawGuides(canvas, activeGuides);
  };

  canvas.on('object:moving', onMoving);
  canvas.on('mouse:up', onMouseUp);

  return () => {
    canvas.off('object:moving', onMoving);
    canvas.off('mouse:up', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    drawGuides(canvas, []);
  };
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

function boundsOf(obj: FabricObject): Bounds {
  // Use the rotated/scaled aabb. Fabric's getBoundingRect returns canvas
  // coords accounting for transforms, which is exactly what we want.
  const r = obj.getBoundingRect();
  return {
    left: r.left,
    top: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

function collectStaticTargets(
  canvas: FabricCanvas,
  moving: FabricObject,
): SnapLine[] {
  const out: SnapLine[] = [];
  // Canvas center cross.
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  out.push({ axis: 'x', coord: cw / 2 });
  out.push({ axis: 'y', coord: ch / 2 });
  // Canvas edges.
  out.push({ axis: 'x', coord: 0 });
  out.push({ axis: 'x', coord: cw });
  out.push({ axis: 'y', coord: 0 });
  out.push({ axis: 'y', coord: ch });

  for (const obj of canvas.getObjects()) {
    if (obj === moving) continue;
    if (!obj.visible) continue;
    const b = boundsOf(obj);
    out.push({ axis: 'x', coord: b.left });
    out.push({ axis: 'x', coord: b.right });
    out.push({ axis: 'x', coord: b.cx });
    out.push({ axis: 'y', coord: b.top });
    out.push({ axis: 'y', coord: b.bottom });
    out.push({ axis: 'y', coord: b.cy });
  }
  return out;
}

/**
 * Draw guide lines on the canvas's overlay context. The overlay is
 * cleared by Fabric on every render tick, so we redraw whenever the
 * snap set changes (object:moving fires many times per drag).
 */
function drawGuides(canvas: FabricCanvas, guides: SnapLine[]): void {
  const ctx = canvas.getTopContext();
  if (!ctx) return;
  // Force Fabric to clear and let us paint; calling renderAll wipes
  // contextTop because Fabric expects to own it.
  canvas.clearContext(ctx);
  if (guides.length === 0) return;
  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = GUIDE_LINE_WIDTH;
  ctx.setLineDash([4, 3]);
  for (const g of guides) {
    ctx.beginPath();
    if (g.axis === 'x') {
      ctx.moveTo(g.coord, 0);
      ctx.lineTo(g.coord, canvas.getHeight());
    } else {
      ctx.moveTo(0, g.coord);
      ctx.lineTo(canvas.getWidth(), g.coord);
    }
    ctx.stroke();
  }
  ctx.restore();
}
