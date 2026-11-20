import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidNeedByDate, normalizeArtworkPlacements, normalizeMockups, printAreasFor } from './quoteIntake.js';

test('need-by dates require real calendar dates with exact ISO formatting', () => {
  for (const value of [null, undefined, '', '11/14/2026', '2026-2-01', '2026-02-29', '2026-02-31', '2026-13-01', '2026-11-14T00:00:00Z', 20261114]) {
    assert.equal(isValidNeedByDate(value), false, String(value));
  }
  assert.equal(isValidNeedByDate('2028-02-29'), true);
  assert.equal(isValidNeedByDate('2026-11-14'), true);
});

test('multiple alternate designs on one side remain one priced location', () => {
  assert.deepEqual(printAreasFor({}, [
    { url: 'https://example.com/a.png', placement: 'front' },
    { url: 'https://example.com/b.png', placement: 'front' },
  ]), ['front']);
});

test('front, back and both sleeves all survive intake and count separately', () => {
  const art = ['front', 'back', 'left_sleeve', 'right_sleeve'].map(placement => ({ url: `https://example.com/${placement}.png`, placement }));
  assert.deepEqual(normalizeArtworkPlacements(art), art);
  assert.deepEqual(normalizeMockups(art), art);
  assert.equal(printAreasFor({ locations: { front: true, back: true } }, art).length, 4);
});

test('legacy sleeve flag remains compatible and invalid URLs are discarded', () => {
  assert.deepEqual(printAreasFor({ locations: { front: true, sleeve: true, back: false, made_up: true } }), ['front', 'sleeve']);
  assert.deepEqual(normalizeMockups([null, {}, { url: 'javascript:alert(1)', placement: 'front' }, { url: 'https://example.com/a', placement: 'invalid' }]), []);
});
