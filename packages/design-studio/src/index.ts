// @tshirtbrothers/design-studio — public API.
//
// Everything importable from consumers lives here. Adding a new export from
// an internal file requires re-exporting it below; anything not re-exported
// is package-private.
//
// Consumers: TSB storefront (client/src/pages/DesignStudioPage.tsx), GleeWorld
// merch admin. Both compose these primitives into their own product-context
// wrappers; neither reaches into internal file paths.

// ─── Portable interchange contract ────────────────────────────────────────
export {
  MERCH_DESIGN_SCHEMA_VERSION,
} from './types/merch-design';
export type {
  MerchDesign,
  PrintArea,
  PrintAreaName,
  PrintMethod,
  FabricSerializedCanvas,
  AssetRef,
} from './types/merch-design';

// ─── Canvas engine + serialization ────────────────────────────────────────
export {
  serializeCanvas,
  deserializeCanvas,
  FABRIC_PRESERVED_PROPS,
} from './lib/fabric/serializeJson';

export { exportPng, getExportMultiplier } from './lib/fabric/exportPng';
export type { ExportPngOptions } from './lib/fabric/exportPng';

export { exportSvg } from './lib/fabric/exportSvg';
export type { ExportSvgOptions } from './lib/fabric/exportSvg';

export { extractLegacyElements } from './lib/fabric/extractLegacy';
export { hydrateLegacyElements } from './lib/fabric/hydrateLegacy';

export { attachSmartGuides } from './lib/fabric/smartGuides';
export { loadFabricImage } from './lib/fabric/loadImage';
export {
  fontCacheKey,
  getCachedFont,
  putCachedFont,
} from './lib/fabric/fontPathCache';
export { loadGoogleFont, loadGoogleFonts } from './lib/fabric/googleFonts';
export { loadFontForText } from './lib/fabric/loadFontForText';
export { iTextToPaths } from './lib/fabric/textToPaths';
export type { TextPathFragment } from './lib/fabric/textToPaths';
export { buildShapedTextSvg } from './lib/fabric/shapedTextSvg';
export type { ShapeName, ShapedTextSvgParams } from './lib/fabric/shapedTextSvg';
export { escapeXmlAttr } from './lib/fabric/svgEscape';
export { reportClientError } from './lib/fabric/reportClientError';
export type { FabricErrorTag } from './lib/fabric/reportClientError';
export type { FabricObjectMeta, FabricObjectWithMeta } from './lib/fabric/types';

// ─── Studio-domain types ──────────────────────────────────────────────────
export type {
  ViewSide,
  UserRole,
  DesignElement,
  StoredDesign,
  ExportPngOpts,
  ExportSvgOpts,
  CanvasHandle,
  FabricDesignCanvasProps,
} from './components/design-studio/types';

// ─── Fonts ────────────────────────────────────────────────────────────────
export {
  FONT_CATALOG,
  FONT_CATEGORIES,
  FONT_NAMES,
} from './components/design-studio/fontCatalog';
export type {
  CategorizedFont,
  FontCategory,
} from './components/design-studio/fontCatalog';

// ─── React components ─────────────────────────────────────────────────────
export {
  FabricDesignCanvas,
  LOGICAL_CANVAS_SIZE,
} from './components/design-studio/FabricDesignCanvas';

export {
  FabricCanvasContext,
  useFabricCanvas,
} from './components/design-studio/FabricCanvasContext';

export { LayersPanel } from './components/design-studio/LayersPanel';
export { TextEffectsPanel } from './components/design-studio/TextEffectsPanel';
export { FontPicker } from './components/design-studio/FontPicker';
export { CropModal } from './components/design-studio/CropModal';
export { DimensionReadout } from './components/design-studio/DimensionReadout';
export { HoldRepeatButton } from './components/design-studio/HoldRepeatButton';
export { CanvasSizeControl } from './components/design-studio/CanvasSizeControl';

// ─── Hooks ────────────────────────────────────────────────────────────────
export { useUndoRedo } from './components/design-studio/useUndoRedo';
export type { UndoRedoApi } from './components/design-studio/useUndoRedo';
export {
  useCustomFonts,
  refreshCustomFonts,
} from './components/design-studio/useCustomFonts';
export { useFabricRendererFlag } from './components/design-studio/useFabricRendererFlag';

// ─── Bridge ───────────────────────────────────────────────────────────────
// Also available at the subpath "@tshirtbrothers/design-studio/bridge" — the
// preferred way for consumers to lazy-load and keep Fabric out of the main
// chunk.
export { FabricRendererBridge } from './components/design-studio/FabricRendererBridge';
export type {
  FabricRendererBridgeHandle,
  FabricRendererBridgeProps,
} from './components/design-studio/FabricRendererBridge';
