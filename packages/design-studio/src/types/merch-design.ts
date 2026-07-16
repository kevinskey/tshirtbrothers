// Portable design JSON — the interchange contract between authoring (this
// package) and fulfillment (TB's print pipeline). GleeWorld also stores
// this shape as gw_merch_designs.design_json.
//
// Bump SCHEMA_VERSION for any non-backward-compatible change. TB's importer
// branches on it.

export const MERCH_DESIGN_SCHEMA_VERSION = '1.0' as const;

export type PrintMethod = 'dtf' | 'dtg' | 'screen' | 'embroidery';

export type PrintAreaName =
  | 'front'
  | 'back'
  | 'left_chest'
  | 'right_chest'
  | 'sleeve_left'
  | 'sleeve_right';

export interface PrintArea {
  /** Fabric.js v6 serialized canvas for this area (result of serializeCanvas). */
  canvas: FabricSerializedCanvas;
  /** DO Spaces / Supabase Storage ref for the rasterized preview.
   *  Format: "<bucket>/<path>". Null until the studio renders it. */
  render_ref: string | null;
}

/** Fabric.js v6 serialized canvas — kept opaque; Fabric owns the shape. */
export type FabricSerializedCanvas = Record<string, unknown>;

export interface AssetRef {
  /** DO Spaces / Supabase Storage ref: "<bucket>/<path>". */
  ref: string;
  /** Source hint so TB can flag unlicensed art. */
  source: 'tenant_upload' | 'tenant_library' | 'stock';
  /** Optional — the tenant's own logo/mascot doesn't need attribution. */
  attribution?: string;
}

export interface MerchDesign {
  schema_version: typeof MERCH_DESIGN_SCHEMA_VERSION;
  /** TB blank id resolved against the TB catalog. */
  tb_product_id: string;
  /** One entry per printable surface used. Absent surfaces are unprinted. */
  print_areas: Partial<Record<PrintAreaName, PrintArea>>;
  /** Blank colors this design targets. TB validates against catalog. */
  colorways: string[];
  print_method: PrintMethod;
  /** Every asset referenced from a canvas MUST appear here so TB can resolve,
   *  download, and license-check them. */
  asset_refs: AssetRef[];
  /** Free-form tenant metadata (director notes, campaign tag, etc.).
   *  Never interpreted by TB. */
  metadata?: Record<string, unknown>;
}
