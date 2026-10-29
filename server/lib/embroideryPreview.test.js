import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderEmbroideryPreview } from './embroideryPreview.js';

test('preview adds thread detail while preserving silhouette, alpha and dimensions', async () => {
  const width = 80, height = 60;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 12; y < 48; y++) for (let x = 12; x < 68; x++) {
    const i = (y * width + x) * 4;
    raw.set([240, 90, 20, x === 12 ? 128 : 255], i);
  }
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const preview = await renderEmbroideryPreview(source, { widthIn: 3.5 });
  assert.equal(preview.width, width); assert.equal(preview.height, height);
  assert.match(preview.data_url, /^data:image\/png;base64,/);
  const pixels = await sharp(Buffer.from(preview.data_url.split(',')[1], 'base64')).raw().toBuffer();
  const colors = new Set();
  for (let i = 0; i < raw.length; i += 4) {
    assert.equal(pixels[i + 3], raw[i + 3], 'Alpha must match the original exactly');
    if (raw[i + 3]) {
      assert.ok(pixels[i] > pixels[i + 1] && pixels[i + 1] > pixels[i + 2], 'Keep orange hue');
      colors.add(pixels.subarray(i, i + 3).toString('hex'));
    }
  }
  assert.ok(colors.size > 20, 'Thread lighting must introduce visible detail');
});

test('opaque white canvas becomes transparent, white artwork on alpha stays visible', async () => {
  const opaque = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#000000' } }).png().toBuffer(), left: 10, top: 10 }]).png().toBuffer();
  const rendered = await renderEmbroideryPreview(opaque, { widthIn: 3.5 });
  const pixels = await sharp(Buffer.from(rendered.data_url.split(',')[1], 'base64')).raw().toBuffer();
  assert.equal(pixels[3], 0);
  assert.equal(pixels[(20 * 40 + 20) * 4 + 3], 255);
  const white = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#00000000' } })
    .composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#ffffff' } }).png().toBuffer(), left: 10, top: 10 }]).png().toBuffer();
  const whiteResult = await renderEmbroideryPreview(white, { widthIn: 3.5 });
  const whitePixels = await sharp(Buffer.from(whiteResult.data_url.split(',')[1], 'base64')).raw().toBuffer();
  assert.equal(whitePixels[(20 * 40 + 20) * 4 + 3], 255);
});
