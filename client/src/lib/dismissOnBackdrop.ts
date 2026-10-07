import type { MouseEvent } from 'react';

// Props for a modal backdrop that should dismiss when you press outside the
// panel.
//
// Deliberately onMouseDown plus a target check, NOT onClick. A click event is
// dispatched to the nearest common ancestor of the mousedown and mouseup
// targets — so dragging to select text inside the panel and releasing past
// its edge fires a click on the backdrop. In a dialog with text fields that
// reads as "it closes while I'm typing", and whatever you had entered is gone
// (Kevin, 2026-10-07, on the mockup details dialog).
//
// Checking `e.target === e.currentTarget` also makes the inner panel's
// `onClick={(e) => e.stopPropagation()}` unnecessary: a press that lands on
// anything inside the panel simply isn't the backdrop.
//
// Usage: <div className="fixed inset-0 …" {...dismissOnBackdrop(onClose)}>
export function dismissOnBackdrop(onClose: () => void) {
  return {
    onMouseDown: (e: MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
