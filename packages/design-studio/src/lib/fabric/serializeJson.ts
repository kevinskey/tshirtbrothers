import type { Canvas as FabricCanvas } from 'fabric';

/**
 * Custom properties Fabric must preserve through toJSON / loadFromJSON.
 * Without listing them, Fabric drops anything not in its built-in object
 * schema — and we rely on `data` to carry per-object metadata (which side
 * an element belongs to, original shaped-text params for re-edit, etc.).
 */
export const FABRIC_PRESERVED_PROPS = ['data'] as const;

/** Serialize a Fabric canvas to a JSON-safe object, preserving custom props.
 *  Fabric v6 dropped the array argument from toJSON; use toObject directly. */
export function serializeCanvas(canvas: FabricCanvas): object {
  return canvas.toObject([...FABRIC_PRESERVED_PROPS]);
}

/**
 * Hydrate a Fabric canvas from a previously-serialized object. Async because
 * Fabric must fetch any image sources referenced in the JSON before it can
 * finish loading. Triggers a renderAll so the caller doesn't have to.
 */
export async function deserializeCanvas(canvas: FabricCanvas, json: object): Promise<void> {
  await canvas.loadFromJSON(json);
  canvas.renderAll();
}
