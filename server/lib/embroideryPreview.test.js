import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderEmbroideryPreview } from './embroideryPreview.js';

test('technical preview draws stitch segments without filling transparent margins', async () => {
  const width = 120, height = 100;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 10; y < 90; y++) for (let x = 10; x < 110; x++) {
    const i = (y * width + x) * 4;
    raw.set(x < 60 ? [15, 45, 210, 255] : [160, 35, 150, 255], i);
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const preview = await renderEmbroideryPreview(png, { widthIn: 4, spacingMm: .42 });
  assert.equal(preview.preview_mode, 'object-aware-stitch-plan');
  assert.ok(preview.stitch_segments > 0);
  const { data, info } = await sharp(Buffer.from(preview.data_url.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width); assert.equal(info.height, height);
  assert.equal(data[3], 0);
  assert.ok(data.some((v, i) => i % 4 === 3 && v > 0));
});
