import { createContext, useContext } from 'react';
import type { Canvas as FabricCanvas } from 'fabric';

/**
 * Direct access to the Fabric canvas instance. Side panels call this and
 * then operate on the canvas directly — `canvas.add(new IText(...))`,
 * `canvas.bringObjectForward(obj)`, `canvas.remove(obj)`, etc. — instead
 * of going through a wrapper API.
 *
 * Rationale (from the migration plan): wrapping every Fabric operation in
 * a bespoke method on CanvasHandle would balloon to 30+ methods by Phase 2.
 * Direct access keeps panels readable and lets contributors rely on Fabric
 * docs / Stack Overflow without translating through our API. Cross-cutting
 * concerns (load/save, export, side switching) stay on CanvasHandle where
 * they belong.
 */
export const FabricCanvasContext = createContext<FabricCanvas | null>(null);

/** Hook for panels. Returns the canvas, or null if used outside the provider. */
export function useFabricCanvas(): FabricCanvas | null {
  return useContext(FabricCanvasContext);
}
