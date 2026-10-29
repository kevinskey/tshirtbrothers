import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareEmbroideryArtwork } from './embroideryArtwork.js';
import { embroideryMockupFields } from './embroideryMockup.js';
import { runEmbroideryWorker } from './embroideryWorkers.js';

test('padding has no effect on trimmed artwork or finished dimensions', async () => {
  const art = await sharp({ create: { width: 80, height: 40, channels: 4, background: '#f97316' } }).png().toBuffer();
  const padded = await sharp(art).extend({ top: 100, bottom: 100, left: 100, right: 100, background: '#00000000' }).png().toBuffer();
  const a = await prepareEmbroideryArtwork(art, { widthIn: 3.5, background: 'preserve' });
  const b = await prepareEmbroideryArtwork(padded, { widthIn: 3.5, background: 'preserve' });
  assert.equal(a.height_in, 1.75); assert.equal(b.height_in, 1.75);
  assert.deepEqual(a.png, b.png);
  assert.equal(b.bounds.left, 100);
});

test('only edge-connected white is removed; preserve mode keeps it all', async () => {
  const orange = await sharp({ create: { width: 60, height: 60, channels: 4, background: '#f97316' } }).png().toBuffer();
  const white = await sharp({ create: { width: 20, height: 20, channels: 4, background: 'white' } }).png().toBuffer();
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: 'white' } })
    .composite([{ input: orange, left: 20, top: 20 }, { input: white, left: 40, top: 40 }]).png().toBuffer();
  const clean = await prepareEmbroideryArtwork(source, { widthIn: 4 });
  assert.equal(clean.bounds.width, 60);
  const { data, info } = await sharp(clean.png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[(30 * info.width + 30) * 4 + 3], 255, 'Interior white remains visible');
  const preserved = await prepareEmbroideryArtwork(source, { widthIn: 4, background: 'preserve' });
  assert.equal(preserved.bounds.width, 100);
});

test('unlocked dimensions stretch preview and mockup to the same physical ratio', async () => {
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#f97316' } }).png().toBuffer();
  const prepared = await prepareEmbroideryArtwork(source, { widthIn: 4, heightIn: 2 });
  const meta = await sharp(prepared.png).metadata();
  assert.equal(meta.width / meta.height, 2);
  const fields = embroideryMockupFields({ id: 1, name: 'Logo', quote_id: 17, preview_url: 'https://example.test/preview.png', data: { width_in: 4, height_in: 2, estimated_stitches: 5000 } });
  assert.ok(Math.abs(fields.design_elements[0].width * fields.design_canvas_inches / 100 - 4) < 1e-9);
  assert.ok(Math.abs(fields.design_elements[0].height * fields.design_canvas_inches_h / 100 - 2) < 1e-9);
  assert.equal(fields.quote_id, 17);
});

test('worker queue bounds work without blocking the main event loop', async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#f97316' } }).png().toBuffer();
  let ticked = false; setImmediate(() => { ticked = true; });
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => runEmbroideryWorker('prepare', png, { widthIn: 3.5 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 1);
  assert.ok(ticked);
});
