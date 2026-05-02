/**
 * Types for the new Fabric-based design studio canvas. Lives alongside
 * <FabricDesignCanvas> so panels and the page shell can import a single
 * shared shape.
 *
 * `DesignElement` (the legacy positioned-div shape) is duplicated here for
 * one PR cycle so this module is self-contained while DesignStudioPage
 * still owns its definition. PR #6 (page port) deletes the duplicate in
 * DesignStudioPage and points it at this file. Kept identical to the
 * existing definition — do NOT diverge.
 */

import type { FabricObject } from 'fabric';

// Sides supported by the design canvas. Customer-facing studio uses all
// three; admin Blank Canvas mode pins to 'front'.
export type ViewSide = 'front' | 'back' | 'sleeve';

export type UserRole = 'admin' | 'customer';

// Legacy element shape — DesignStudioPage's saved-design schema v1.
// Preserved verbatim to keep the hydrator (PR #4) accurate.
export interface DesignElement {
  id: string;
  type: 'image' | 'text';
  side?: ViewSide;
  x: number;          // percent of legacy 800px source canvas
  y: number;          // percent
  width: number;      // percent
  content: string;    // text body or image data URL
  fontSize?: number;  // px in legacy 800px source space
  color?: string;
  fontFamily?: string;
  rotation?: number;  // degrees
  textAlign?: 'left' | 'center' | 'right';
  outline?: boolean;
  textShape?: string;
  shapeIntensity?: number;
  letterSpacing?: number;
  lineHeight?: number;
  wordSpacing?: number;
  borderRadius?: number;
  opacity?: number;
  filter?: 'none' | 'grayscale' | 'invert' | 'sepia' | 'bw';
}

// Stored design payload as it lands on /api/designs. Either a v1 array
// (legacy) or a v2 object (Fabric serialized form). loadDesign accepts
// both and dispatches; PR #4 builds the v1→v2 hydrator.
export type StoredDesign =
  | DesignElement[]
  | {
      schemaVersion: 2;
      canvasWidth: number;
      canvasHeight: number;
      // Plus everything Fabric.toObject emits (objects, version, ...).
      [key: string]: unknown;
    };

export interface ExportPngOpts {
  transparent?: boolean;
  printInches?: number;
  dpi?: number;
}

export interface ExportSvgOpts {
  /** Convert <text> to <path> via opentype.js. Wires up in PR #5. */
  textAsPaths?: boolean;
}

/**
 * Cross-cutting operations on the canvas — the only methods the page
 * shell needs. Anything else (addText, addImage, bringForward, delete,
 * etc.) panels reach for via the FabricCanvasContext below — direct
 * Fabric API, no wrappers.
 */
export interface CanvasHandle {
  loadDesign(stored: StoredDesign): Promise<void>;
  getDesignJSON(): object;
  /** Adapter for the QuotePage handoff (which still consumes legacy shape). PR #4 fills this in. */
  getLegacyElements(): DesignElement[];
  exportPNG(opts?: ExportPngOpts): string;
  exportSVG(opts?: ExportSvgOpts): Promise<string>;
  setSide(side: ViewSide): void;
  setBackgroundProduct(url: string | null): Promise<void>;
  /**
   * Direct access to the live Fabric canvas. Page-level wiring (the bridge
   * component that mirrors React state into Fabric) needs to attach
   * `object:modified` listeners and call `add` / `remove` directly. Returns
   * null between mount and onReady firing.
   */
  getCanvas(): import('fabric').Canvas | null;
}

export interface FabricDesignCanvasProps {
  userRole: UserRole;
  /** Initial side; defaults to 'front'. */
  initialSide?: ViewSide;
  /** Optional CSS class on the outer wrapper. */
  className?: string;
  /** Fired once after the Fabric canvas is initialized. Lets the page wire panels. */
  onReady?: () => void;
  /** Fired whenever the active selection changes. */
  onSelectionChange?: (obj: FabricObject | null) => void;
}
