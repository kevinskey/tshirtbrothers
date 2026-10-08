import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterObjects, folderCounts, extOf, isPrivateKey } from './adminUploads.js';

const objs = [
  { key: 'quote-designs/a-b-com/logo-1.png', size: 10, lastModified: '2026-10-01T00:00:00.000Z' },
  { key: 'gangsheet-orders/2026-10/x.png', size: 500, lastModified: '2026-10-05T00:00:00.000Z' },
  { key: 'custom-fonts/font.ttf', size: 50, lastModified: '2026-10-07T00:00:00.000Z' },
  { key: 'embroidery/stitch.DST', size: 5, lastModified: '2026-09-01T00:00:00.000Z' },
  { key: 'loose.jpg', size: 1, lastModified: '2026-08-01T00:00:00.000Z' },
];

test('graphics filter drops fonts, keeps stitch files, newest first', () => {
  const keys = filterObjects(objs).map((o) => o.key);
  assert.deepEqual(keys, [
    'gangsheet-orders/2026-10/x.png',
    'quote-designs/a-b-com/logo-1.png',
    'embroidery/stitch.DST',
    'loose.jpg',
  ]);
});

test('type=all includes everything', () => {
  assert.equal(filterObjects(objs, { type: 'all' }).length, 5);
});

test('folder and search filters', () => {
  assert.deepEqual(filterObjects(objs, { folder: 'quote-designs' }).map((o) => o.key), ['quote-designs/a-b-com/logo-1.png']);
  assert.deepEqual(filterObjects(objs, { q: 'A-B-COM' }).map((o) => o.key), ['quote-designs/a-b-com/logo-1.png']);
  // "embroidery" folder must not match a sibling like "embroidery-old"
  assert.equal(filterObjects([{ key: 'embroidery-old/a.png', size: 1, lastModified: '' }], { folder: 'embroidery' }).length, 0);
});

test('root folder chip', () => {
  assert.deepEqual(filterObjects(objs, { folder: '(root)' }).map((o) => o.key), ['loose.jpg']);
});

test('largest sort', () => {
  assert.equal(filterObjects(objs, { sort: 'largest' })[0].key, 'gangsheet-orders/2026-10/x.png');
});

test('folder counts and helpers', () => {
  const counts = Object.fromEntries(folderCounts(objs).map((f) => [f.name, f.count]));
  assert.deepEqual(counts, { 'quote-designs': 1, 'gangsheet-orders': 1, embroidery: 1, '(root)': 1 });
  assert.equal(extOf('a/b/C.PNG'), 'png');
  assert.equal(isPrivateKey('gangsheet-orders/2026-10/x.png'), true);
  assert.equal(isPrivateKey('quote-designs/x.png'), false);
});
