// Run: node --test server/lib/spaRoutes.test.js
//
// isSpaRoute decides 200-plus-the-app versus 404. Get it wrong in one
// direction and a real page disappears; wrong in the other and we are back to
// answering 200 with the homepage for every URL on the internet, which is the
// bug this replaced.
//
// The first test is the important one: it reads the router itself, so adding
// a <Route> without listing it here fails the suite instead of silently
// 404ing a live page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isSpaRoute, SPA_ROUTE_PATTERNS } from './spaRoutes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_TSX = join(__dirname, '..', '..', 'client', 'src', 'App.tsx');

// A concrete URL for a pattern, so the matcher is exercised the way a browser
// would hit it: ':id' -> 'x', trailing '/*' -> '/x'.
function sampleUrl(pattern) {
  if (pattern === '*') return null; // the router's own catch-all, not a page
  if (pattern.endsWith('/*')) return `${pattern.slice(0, -2)}/x`;
  return pattern.split('/').map((s) => (s.startsWith(':') ? 'x' : s)).join('/') || '/';
}

test('every route declared in App.tsx is recognised', () => {
  const src = readFileSync(APP_TSX, 'utf8');
  const declared = [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(declared.length > 50, `expected to parse many routes, got ${declared.length}`);

  const missing = [];
  for (const pattern of new Set(declared)) {
    const url = sampleUrl(pattern);
    if (url === null) continue;
    if (!isSpaRoute(url)) missing.push(`${pattern} (tried ${url})`);
  }
  assert.deepEqual(
    missing, [],
    `These routes exist in client/src/App.tsx but are not matched by\n`
    + `server/lib/spaRoutes.js, so Express will 404 them:\n  ${missing.join('\n  ')}`,
  );
});

test('the list has no stale entries the router no longer declares', () => {
  const src = readFileSync(APP_TSX, 'utf8');
  const declared = new Set([...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
  // Nested sub-app routes are declared in their own files, so only check the
  // top-level shapes that should come straight from App.tsx.
  const stale = SPA_ROUTE_PATTERNS.filter((p) => !declared.has(p));
  assert.deepEqual(stale, [], `No longer in App.tsx: ${stale.join(', ')}`);
});

// ── The bug ───────────────────────────────────────────────────────────────

test('unknown paths are not SPA routes', () => {
  for (const p of [
    '/this-page-does-not-exist-xyz',
    '/occasions/graduation',          // real page, but at /gift-club/occasions/*
    '/shop/product/1002523',          // never a route; products are /product/:slug
    '/wp-admin',
    '/.env',
    '/shop/extra/segments/here',
  ]) {
    assert.equal(isSpaRoute(p), false, `${p} should 404`);
  }
});

test('a deeper path under a real route is not itself a route', () => {
  assert.equal(isSpaRoute('/shop'), true);
  assert.equal(isSpaRoute('/shop/anything'), false);
  assert.equal(isSpaRoute('/embroidery'), true);
  assert.equal(isSpaRoute('/embroidery/nope'), false);
});

// ── What must keep working ────────────────────────────────────────────────

test('dynamic routes match with a real-looking value', () => {
  assert.equal(isSpaRoute('/invoice/view/1042'), true);
  assert.equal(isSpaRoute('/mockup/9f8e7d6c5b4a'), true);
  assert.equal(isSpaRoute('/quote/artwork/270'), true);
  assert.equal(isSpaRoute('/custom-shirts/fairburn'), true);
  assert.equal(isSpaRoute('/stores/sensory-seasons/product/adult-tee'), true);
  assert.equal(isSpaRoute('/blog/how-dtf-works'), true);
});

test('a dynamic segment must not be empty', () => {
  assert.equal(isSpaRoute('/invoice/view/'), false);
  assert.equal(isSpaRoute('/mockup/'), false);
});

test('sister-brand sub-apps own everything under their prefix', () => {
  assert.equal(isSpaRoute('/gift-club'), true);
  assert.equal(isSpaRoute('/gift-club/shop'), true);
  assert.equal(isSpaRoute('/gift-club/occasions/graduation'), true);
  assert.equal(isSpaRoute('/live-hard-truth/anything/deep'), true);
  assert.equal(isSpaRoute('/print-club/cart'), true);
  // Not a prefix match on a different brand name.
  assert.equal(isSpaRoute('/gift-clubbing'), false);
});

test('a trailing slash is tolerated', () => {
  assert.equal(isSpaRoute('/shop/'), true);
  assert.equal(isSpaRoute('/'), true);
  assert.equal(isSpaRoute('/custom-shirts/fairburn/'), true);
});

// ── Things Express must not claim ─────────────────────────────────────────

test('API, uploads and build assets are never SPA routes', () => {
  for (const p of ['/api/quotes', '/api/', '/uploads/x.png', '/assets/index-abc123.js']) {
    assert.equal(isSpaRoute(p), false, `${p} should not be treated as a page`);
  }
});

test('static file requests are never SPA routes', () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/tsb-splat.png', '/site.webmanifest']) {
    assert.equal(isSpaRoute(p), false, `${p} should be served as a file, not the app`);
  }
});

test('junk input is refused rather than thrown on', () => {
  for (const p of [null, undefined, '', 'shop', 'https://evil.test/shop', 42]) {
    assert.equal(isSpaRoute(p), false);
  }
});
