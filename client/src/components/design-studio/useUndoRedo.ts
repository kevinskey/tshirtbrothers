/**
 * Phase 2 PR #11 — generic undo/redo stack hook.
 *
 * Caller pushes a SNAPSHOT (the full state at a moment) onto the stack
 * whenever a user-driven mutation completes. The hook returns:
 *
 *   - push(snapshot): record a new state. Clears the redo stack — once you
 *     do something new after an undo, the redo path is gone (matches every
 *     editor's intuition).
 *   - undo(): returns the previous snapshot, or null if there's nothing
 *     before the current position. Moves the current snapshot to the redo
 *     stack.
 *   - redo(): returns the next snapshot, or null if there's nothing
 *     after. Mirror of undo.
 *   - canUndo / canRedo: booleans for disabling buttons.
 *   - isReplaying: ref the caller checks before pushing — during an undo
 *     or redo, the state setter the caller calls will trigger their normal
 *     "push to undo stack" code path; this flag tells them to skip it.
 *
 * Cap: STACK_CAP = 50 snapshots in either direction. Each snapshot is a
 * full DesignElement[] copy; for typical designs (~10 elements) that's
 * O(KB), so the cap is more about preventing memory leaks during a long
 * editing session than about absolute size.
 *
 * Equality / no-op pushes: the caller is expected to push only when state
 * has actually changed. The hook does a shallow reference check as a
 * defense-in-depth — if you push the SAME reference back-to-back, we
 * silently drop the second one. (Doesn't catch deep equality — that
 * would be too expensive on every push.)
 */

import { useCallback, useRef, useState } from 'react';

const STACK_CAP = 50;

export interface UndoRedoApi<T> {
  push: (snapshot: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
  isReplaying: React.MutableRefObject<boolean>;
  reset: (initial?: T | null) => void;
}

export function useUndoRedo<T>(initial: T | null = null): UndoRedoApi<T> {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const currentRef = useRef<T | null>(initial);
  const isReplaying = useRef(false);
  // canUndo / canRedo need to drive React rendering (button disabled state)
  // so we mirror them into state. The refs are the source of truth, the
  // state values are the React-visible projection.
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const push = useCallback((snapshot: T) => {
    if (isReplaying.current) return;
    if (currentRef.current === snapshot) return;
    if (currentRef.current !== null) {
      pastRef.current.push(currentRef.current);
      if (pastRef.current.length > STACK_CAP) pastRef.current.shift();
    }
    currentRef.current = snapshot;
    futureRef.current = [];
    rerender();
  }, [rerender]);

  const undo = useCallback((): T | null => {
    if (pastRef.current.length === 0) return null;
    const prev = pastRef.current.pop()!;
    if (currentRef.current !== null) futureRef.current.push(currentRef.current);
    if (futureRef.current.length > STACK_CAP) futureRef.current.shift();
    currentRef.current = prev;
    rerender();
    return prev;
  }, [rerender]);

  const redo = useCallback((): T | null => {
    if (futureRef.current.length === 0) return null;
    const next = futureRef.current.pop()!;
    if (currentRef.current !== null) pastRef.current.push(currentRef.current);
    if (pastRef.current.length > STACK_CAP) pastRef.current.shift();
    currentRef.current = next;
    rerender();
    return next;
  }, [rerender]);

  const reset = useCallback((next: T | null = null) => {
    pastRef.current = [];
    futureRef.current = [];
    currentRef.current = next;
    rerender();
  }, [rerender]);

  return {
    push,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    isReplaying,
    reset,
  };
}
