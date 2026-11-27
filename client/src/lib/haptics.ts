// Haptic feedback for the Design Studio.
//
// On the iOS Capacitor build this calls the native Taptic Engine. On the
// web it is a no-op — the Capacitor web shim throws "Not implemented" for
// Haptics, so every call is guarded rather than letting an unhandled
// rejection surface in the console on desktop.
//
// Keep these cheap and infrequent. Firing a haptic on every pointermove
// tick drains the battery and the engine coalesces them anyway, so callers
// fire on discrete events only: grab, snap, release, delete.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Resolved once. Capacitor.isNativePlatform() is cheap, but this is called
// from drag handlers and there is no reason to ask twice.
const isNative = Capacitor.isNativePlatform();

function safe(run: () => Promise<unknown>) {
  if (!isNative) return;
  // Haptics are a nicety. A rejection here must never break a drag, and on
  // a device with the Taptic Engine disabled in Settings these reject.
  void run().catch(() => {});
}

/** Grabbing an element, opening a sheet — the lightest tap. */
export function hapticLight() {
  safe(() => Haptics.impact({ style: ImpactStyle.Light }));
}

/** An element snapping to a guide or to center. Crisper than light. */
export function hapticSnap() {
  safe(() => Haptics.selectionChanged());
}

/** Committing something — dropping an element, confirming a change. */
export function hapticMedium() {
  safe(() => Haptics.impact({ style: ImpactStyle.Medium }));
}

/** Destructive or rejected: delete, a blocked action, a failed upload. */
export function hapticWarn() {
  safe(() => Haptics.notification({ type: NotificationType.Warning }));
}

/** Something completed — design saved, price returned. */
export function hapticSuccess() {
  safe(() => Haptics.notification({ type: NotificationType.Success }));
}
