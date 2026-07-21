/**
 * Single point of error reporting for the new Fabric renderer. Future
 * Sentry / Bugsnag adoption replaces the body of `sendReport()` and nothing
 * else — every catch site in lib/fabric and components/design-studio routes
 * through here.
 *
 * Rate-limiting policy (specified up-front to avoid log spam during the
 * Fabric soak window):
 *
 *   - SESSION_CAP: at most 10 reports per page session. Once we hit the cap
 *     we silently drop further reports — a Fabric bug in a tight loop
 *     should NOT generate hundreds of POSTs.
 *   - PER_MESSAGE_THROTTLE_MS: the same `${tag}::${message}` is reported at
 *     most once every 60s. Catches the common "render loop fires the same
 *     error every frame" pattern.
 *
 * Privacy / payload-size policy:
 *
 *   - We never send the canvas JSON or the user's design content. The
 *     payload is: tag, message (truncated), stack (truncated to 500 chars),
 *     objectCount, objectTypes (comma-joined string). The shaping happens
 *     here — callers pass an Error and optional { canvas } and we extract.
 *   - We do NOT send the user-id; the server attaches it via the auth token.
 */

import type { Canvas as FabricCanvas } from 'fabric';

const ENDPOINT = '/api/client-errors';
const SESSION_CAP = 10;
const PER_MESSAGE_THROTTLE_MS = 60_000;
const STACK_CAP = 500;
const MESSAGE_CAP = 500;
const TYPES_CAP = 200;

let sessionCount = 0;
const lastSentAt = new Map<string, number>();

export type FabricErrorTag =
  | 'fabric.init'
  | 'fabric.dispose'
  | 'fabric.hydrate'
  | 'fabric.font'
  | 'fabric.export'
  | 'fabric.save';

interface ReportOptions {
  /** Live canvas, if available — we extract object count and types. */
  canvas?: FabricCanvas | null;
}

/**
 * Best-effort error report. Never throws, never blocks. Rate-limited per
 * session and per message. Future Sentry adoption replaces sendReport()
 * below; the public signature stays.
 */
export function reportClientError(
  tag: FabricErrorTag,
  err: unknown,
  options: ReportOptions = {},
): void {
  try {
    if (sessionCount >= SESSION_CAP) return;

    const message = trunc(extractMessage(err), MESSAGE_CAP) ?? '(no message)';
    const dedupeKey = `${tag}::${message}`;
    const now = Date.now();
    const last = lastSentAt.get(dedupeKey) ?? 0;
    if (now - last < PER_MESSAGE_THROTTLE_MS) return;
    lastSentAt.set(dedupeKey, now);

    sessionCount++;

    const stack = trunc(extractStack(err), STACK_CAP);
    const { objectCount, objectTypes } = summarizeCanvas(options.canvas ?? null);

    const payload = {
      tag,
      message,
      stack,
      objectCount,
      objectTypes,
      url: typeof location !== 'undefined' ? location.href.slice(0, 500) : null,
    };
    sendReport(payload);
  } catch {
    // Reporting must never throw. If we can't report, we can't report.
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) || '(non-error thrown)';
  } catch {
    return '(unserializable error)';
  }
}

function extractStack(err: unknown): string | null {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack;
  return null;
}

function trunc(s: string | null, n: number): string | null {
  if (s == null) return null;
  return s.length > n ? s.slice(0, n) : s;
}

function summarizeCanvas(canvas: FabricCanvas | null): {
  objectCount: number | null;
  objectTypes: string | null;
} {
  if (!canvas) return { objectCount: null, objectTypes: null };
  try {
    const objs = canvas.getObjects();
    const types = new Set<string>();
    for (const o of objs) types.add(o.type ?? 'unknown');
    const joined = [...types].sort().join(',');
    return {
      objectCount: objs.length,
      objectTypes: trunc(joined, TYPES_CAP),
    };
  } catch {
    return { objectCount: null, objectTypes: null };
  }
}

interface ErrorPayload {
  tag: string;
  message: string;
  stack: string | null;
  objectCount: number | null;
  objectTypes: string | null;
  url: string | null;
}

/**
 * The actual transport. THIS is the function that swaps when we adopt
 * Sentry — replace the fetch call with `Sentry.captureException(...)`
 * and add `tags: { source: payload.tag }`. Nothing else changes.
 */
function sendReport(payload: ErrorPayload): void {
  // Best-effort POST. We use fetch over sendBeacon because we want the
  // Authorization header attached (sendBeacon ignores Headers); the lost
  // reports on tab-close are an acceptable price for user attribution.
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('tsb_token')
    : null;
  fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Reporting failures are silent. Don't recurse into reportClientError.
  });
}
