/**
 * URL-driven feature flag for the Fabric renderer.
 *
 *   ?canvas=fabric  → render with the new <FabricDesignCanvas>
 *   anything else  → render with the legacy positioned-div renderer
 *
 * Flag is read once on mount and frozen for the lifetime of the page —
 * toggling mid-session would mean tearing down one renderer and standing
 * up the other, which is enough churn that we'd rather force a navigation.
 *
 * Per the migration plan, this flag exists ONLY to enable rollback. New
 * features (layers panel, undo/redo, etc.) MUST NOT gate on it. When the
 * exit criteria are met and the flag flips to default-on, this hook
 * returns true unconditionally and the legacy code path is deleted in
 * the next PR.
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export function useFabricRendererFlag(): boolean {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get('canvas') === 'fabric';
    // Intentionally keyed on [] so the value is frozen for the page session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
