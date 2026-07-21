import type { FabricObject } from 'fabric';

/**
 * Metadata we attach to FabricObject.data. Fabric drops anything not in its
 * built-in object schema unless explicitly preserved (see serializeJson.ts),
 * so this is the single safe place to stash per-object info we need to
 * round-trip through save/load.
 *
 * Keep this lean — it ships in every saved row of saved_designs.elements.
 */
export interface FabricObjectMeta {
  /** Which side of the garment the object belongs to. */
  side?: 'front' | 'back' | 'sleeve';

  /**
   * For shaped-text groups (curve / arch / valley etc.): the source params
   * needed to rebuild the SVG when the user re-edits the text. Without this
   * the group is "frozen" — selectable but not editable.
   */
  shapedText?: {
    text: string;
    shape: string;
    intensity: number;
    fontFamily: string;
    fontSize: number;
    color: string;
    outline: boolean;
  };

  /**
   * For images: the CSS-filter name we applied. Stored separately from
   * Fabric's `filters` array so we know which legacy filter was the source
   * and can restore the UI state when an admin re-opens the design.
   */
  filterName?: 'none' | 'grayscale' | 'invert' | 'sepia' | 'bw';

  /** For images with rounded corners (legacy borderRadius prop). */
  borderRadius?: number;

  /**
   * Word-spacing in em units. Fabric IText has no native word-spacing
   * support, so we surface it here and apply it via post-render measurement
   * adjustment. (Phase 2 — kept on the type so the legacy hydrator can
   * round-trip the value without losing it.)
   */
  wordSpacing?: number;

  /** Internal flags used by the gang-sheet editor for grid/safe-zone helpers. */
  isGrid?: boolean;
  designId?: string;
}

/** A FabricObject we expect to carry our metadata. */
export interface FabricObjectWithMeta extends FabricObject {
  data?: FabricObjectMeta;
}
