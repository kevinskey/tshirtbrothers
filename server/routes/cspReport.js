// Collector for Content-Security-Policy-Report-Only violations.
//
// The site has no CSP at all (the other five security headers are set by
// nginx). It cannot simply be switched on: the built index.html carries two
// inline <script> and two inline <style> blocks, and the page loads Google
// Tag Manager and Microsoft Clarity, both of which inject inline script. An
// enforcing policy written blind would break the Design Studio or checkout,
// and an enforcing policy with 'unsafe-inline' on script-src buys almost
// nothing.
//
// So: run Report-Only first, collect what actually fires, and tighten from
// evidence. This endpoint is what makes that loop possible — without it the
// violations only exist in visitors' consoles where nobody sees them.
//
// Once the reports go quiet for a week, flip the nginx header from
// Content-Security-Policy-Report-Only to Content-Security-Policy.

import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

// Browsers can fire a lot of these — a single bad extension on one visitor's
// machine will happily report on every page view. Cap hard; the point is to
// learn which directives trip, not to count occurrences.
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  // Reports are fire-and-forget beacons; 204 beats a JSON error body.
  handler: (_req, res) => res.status(204).end(),
});

// Dedupe window: the same directive + blocked URI from the same page is one
// finding, however many times it fires. Keeps the log readable.
const seen = new Map(); // key -> last logged ms
const DEDUPE_MS = 10 * 60 * 1000;
const SEEN_MAX = 500;

function shouldLog(key) {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  if (seen.size > SEEN_MAX) seen.clear();
  seen.set(key, now);
  return true;
}

// Browsers post application/csp-report (legacy) or application/reports+json
// (Reporting API). Accept both rather than silently dropping half of them.
router.post(
  '/',
  reportLimiter,
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '64kb' }),
  (req, res) => {
    // Answer first: a report must never be slow or fail for the browser.
    res.status(204).end();

    try {
      const body = req.body;
      const reports = Array.isArray(body) ? body : [body];
      for (const r of reports) {
        const d = r?.['csp-report'] || r?.body || r || {};
        const directive = d['effective-directive'] || d.effectiveDirective
          || d['violated-directive'] || d.violatedDirective || 'unknown';
        const blocked = d['blocked-uri'] || d.blockedURL || d.blockedURI || 'unknown';
        const doc = d['document-uri'] || d.documentURL || '';

        // Browser extensions and injected toolbars report constantly and are
        // not ours to fix; they would drown the real signal.
        if (/^(chrome|moz|safari|webkit)-extension:/.test(String(blocked))) continue;

        const key = `${directive}|${blocked}`;
        if (!shouldLog(key)) continue;
        console.warn(`[csp] ${directive} blocked ${blocked}${doc ? ` on ${doc}` : ''}`);
      }
    } catch (err) {
      console.error('[csp] malformed report:', err.message);
    }
  },
);

export default router;
