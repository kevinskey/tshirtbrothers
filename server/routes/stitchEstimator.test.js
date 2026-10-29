import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createStitchEstimatorRouter } from './stitchEstimator.js';

test('stitch estimator protects uploads, validates PNGs and handles service outages', async () => {
  process.env.JWT_SECRET = 'stitch-estimator-test-only';
  const token = role => jwt.sign({ id: 1, role }, process.env.JWT_SECRET);
  let calls = 0;
  let unavailable = false;
  let release;
  let hold = false;
  const app = express();
  app.use('/estimate', createStitchEstimatorRouter({ request: async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:8765/api/v1/embroidery/estimate');
    assert.equal(options.body.get('width_in'), '3.5');
    const meta = await sharp(Buffer.from(await options.body.get('file').arrayBuffer())).metadata();
    assert.equal(meta.format, 'png');
    assert.ok(meta.width <= 1200);
    if (hold) await new Promise(resolve => { release = resolve; });
    if (unavailable) throw new Error('connection refused');
    return Response.json({ estimated_stitches: 4200, low_stitches: 2900, high_stitches: 6100 });
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/estimate`;
  const png = await sharp({ create: { width: 1600, height: 800, channels: 4, background: '#f97316' } }).png().toBuffer();
  const send = (role, image = png, width = '3.5') => {
    const body = new FormData(); body.append('file', new Blob([image]), 'test.png'); body.append('width_in', width);
    return fetch(url, { method: 'POST', headers: role ? { Authorization: `Bearer ${token(role)}` } : {}, body });
  };
  try {
    assert.equal((await send()).status, 401);
    assert.equal((await send('customer')).status, 403);
    assert.equal(calls, 0);
    assert.equal((await send('admin', Buffer.from('fake png'))).status, 422);
    assert.equal((await send('admin', png, 'Infinity')).status, 422);
    assert.equal((await send('admin', Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
    const ok = await send('admin');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).estimated_stitches, 4200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    unavailable = true;
    assert.equal((await send('admin')).status, 503);
    unavailable = false; hold = true;
    const first = send('admin');
    while (!release) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await send('admin')).status, 429);
    release();
    assert.equal((await first).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
