import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceDtfCart, orderSheets, selectOrderSheet } from './dtfCart.js';
import { priceCents, widthInFromPx } from '../routes/gangsheetStore.js';
const key = (w, h, prefix = 'abc') => `gangsheet-orders/2026-11/${prefix}-${w}x${h}.png`;
const settings = { min_ft: 1, max_ft: 10, rate_standard_cents: 600, rate_34_standard_cents: 900 };
const options = { widthFromPixels: widthInFromPx, enabledWidths: [22, 34], priceSheet: (ft, width) => priceCents(settings, ft, 'standard', width) };

test('mixed roll cart prices each sheet and each copy, using server-issued dimensions', () => {
  const result = priceDtfCart({ sheets: [
    { file_key: key(6600, 3600), length_ft: 1, copies: 3, unit_cents: 1, width_in: 34 },
    { file_key: key(10200, 7200), length_ft: 2, copies: 2, width_px: 6600 },
  ] }, options);
  assert.equal(result.total_cents, 5400);
  assert.deepEqual(result.sheets.map(s => [s.width_in, s.unit_cents, s.copies]), [[22, 600, 3], [34, 1800, 2]]);
});

test('legacy single-sheet checkout retains its original shape and rounded-foot price', () => {
  const cart = priceDtfCart({ file_key: key(6600, 3600), length_ft: '1.2' }, options);
  assert.equal(cart.total_cents, 1200);
  assert.equal(cart.sheets[0].copies, 1);
});

test('bad copies, empty carts, invalid files and artwork truncation are rejected', () => {
  for (const copies of [0, -1, 1.5, '2', 1001, NaN]) assert.throws(() => priceDtfCart({ sheets: [{ file_key: key(6600, 3600), length_ft: 1, copies }] }, options), /copies/);
  assert.throws(() => priceDtfCart({ sheets: [] }, options), /1 and 50/);
  assert.throws(() => priceDtfCart({ sheets: [{ file_key: key(6600, 7200), length_ft: 1 }] }, options), /taller/);
  assert.throws(() => priceDtfCart({ sheets: [{ file_key: 'javascript:bad', length_ft: 1 }] }, options), /upload/);
  assert.throws(() => priceDtfCart({ sheets: [{ file_key: key(10200, 3600), length_ft: 1 }] }, { ...options, enabledWidths: [22] }), /available/);
});

test('every purchased file is independently selectable; historic orders still expose sheet zero', () => {
  const order = { sheets_json: [{ file_key: key(6600, 3600), copies: 2 }, { file_key: key(10200, 3600), copies: 3 }] };
  assert.equal(orderSheets(order).length, 2);
  assert.equal(selectOrderSheet(order, '1').copies, 3);
  for (const index of ['-1', '1.5', 'abc', '2']) assert.equal(selectOrderSheet(order, index), null);
  assert.equal(selectOrderSheet({ file_key: key(6600, 3600) }).copies, 1);
});

test('new cart sheets require whole feet and reject totals over the online payment limit', () => {
  assert.throws(() => priceDtfCart({ sheets: [{ file_key: key(6600, 3600), length_ft: 1.5 }] }, options), /whole number/);
  assert.throws(() => priceDtfCart({ sheets: [{ file_key: key(6600, 3600), length_ft: 1, copies: 1000 }] }, { ...options, priceSheet: () => 100000 }), /checkout limit/);
});
