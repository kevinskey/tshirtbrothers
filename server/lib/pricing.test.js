// Run: node --test server/lib/pricing.test.js
//
// There are two copies of the markup constants — server/lib/pricing.js (plain
// JS, for the API) and client/src/lib/pricing.ts (TypeScript, for vite).
// A single shared package would need the server to import TypeScript, which
// it cannot do without a build step.
//
// This test is the thing that makes two copies safe: it parses the client
// file and asserts the numbers match the server's. Change one and the suite
// fails. Without it, the duplication is exactly the bug the refactor was
// meant to remove.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QUOTE_MARKUP, RETAIL_MARKUP, quotePrice, retailPrice, toCents2 } from './pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = readFileSync(
  join(__dirname, '..', '..', 'client', 'src', 'lib', 'pricing.ts'), 'utf8',
);

function clientConst(name) {
  const m = CLIENT_SRC.match(new RegExp(`export const ${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(m, `${name} not found in client/src/lib/pricing.ts`);
  return Number(m[1]);
}

// ── The mirrors must agree ────────────────────────────────────────────────

test('client and server agree on QUOTE_MARKUP', () => {
  assert.equal(clientConst('QUOTE_MARKUP'), QUOTE_MARKUP);
});

test('client and server agree on RETAIL_MARKUP', () => {
  assert.equal(clientConst('RETAIL_MARKUP'), RETAIL_MARKUP);
});

// ── The values themselves ─────────────────────────────────────────────────
//
// Pinned deliberately. This refactor changed NO prices; if either number is
// ever meant to move, this test should fail and make someone say so out loud.

test('the two channels keep the rates they had before the refactor', () => {
  assert.equal(QUOTE_MARKUP, 1.7, 'quoted work was cost x 1.7');
  assert.equal(RETAIL_MARKUP, 2.0, 'retail was wholesale x 2');
});

// ── Behaviour ─────────────────────────────────────────────────────────────

test('a quoted line is cost x 1.7, rounded to cents', () => {
  assert.equal(quotePrice(10), 17);
  assert.equal(quotePrice(3.33), 5.66);
  assert.equal(quotePrice('8.50'), 14.45);
});

test('retail is wholesale x 2', () => {
  assert.equal(retailPrice({ base_price: 6.49 }), 12.98);
  assert.equal(retailPrice({ base_price: '11.99' }), 23.98);
});

// The override the shop uses for house blanks and varsity jackets. Marking
// it up again would silently double those prices.
test('custom_price wins and is never marked up again', () => {
  assert.equal(retailPrice({ custom_price: 25, base_price: 6.49 }), 25);
  assert.equal(retailPrice({ custom_price: '18.00', base_price: 6.49 }), 18);
});

test('a zero or absent custom_price falls through to the markup', () => {
  assert.equal(retailPrice({ custom_price: 0, base_price: 10 }), 20);
  assert.equal(retailPrice({ custom_price: null, base_price: 10 }), 20);
});

// Unpriced must be 0, never NaN — callers render this straight into the DOM.
test('missing or junk input yields 0, not NaN', () => {
  for (const p of [{}, null, undefined, { base_price: null }, { base_price: 'free' }, { base_price: 0 }]) {
    const out = retailPrice(p);
    assert.equal(out, 0, `${JSON.stringify(p)} should price at 0`);
    assert.ok(!Number.isNaN(out));
  }
  assert.equal(quotePrice(undefined), 0);
  assert.equal(quotePrice(-5), 0);
});

test('rounding does not leave a float tail', () => {
  // 0.1 * 3 style errors show up as $20.070000000000002 in an invoice.
  assert.equal(toCents2(20.0699999999), 20.07);
  assert.equal(String(retailPrice({ base_price: 10.035 })), '20.07');
});
