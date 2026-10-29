// Deployment smoke check. Disposable estimate/mockup/assets are removed in finally; customer quotes are unchanged.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import pool from '../db.js';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';

const base = 'http://127.0.0.1:3001';
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) break;
  } catch { /* wait for PM2 */ }
  if (attempt === 29) throw new Error('API failed to start');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const endpoint = `${base}/api/admin/stitch-estimator`;
assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401, 'Estimator must require sign-in');
// Short-lived synthetic admin token exists only in this process.
const token = jwt.sign({ id: 0, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '180s' });
// Read production aggregates before this smoke test creates any disposable records.
const accuracyResponse = await fetch(`${endpoint}/saved/accuracy`, {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
});
assert.equal(accuracyResponse.status, 200, 'Accuracy dashboard report failed');
const accuracy = await accuracyResponse.json();
assert.ok(Number.isSafeInteger(accuracy.saved) && Number.isSafeInteger(accuracy.paired));
assert.equal(accuracy.calibration.applied, false, 'Accuracy reporting must not apply correction factors');
console.log('Production embroidery accuracy aggregates:', JSON.stringify({
  saved: accuracy.saved, paired: accuracy.paired, missing_actual: accuracy.missing_actual,
  mape: accuracy.mape, bias: accuracy.bias, outliers: accuracy.outliers,
  collection_target_met: accuracy.calibration.review_ready, additional_examples: accuracy.calibration.missing,
}));
const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: '#f97316' } }).png().toBuffer();
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'deployment-check.png');
form.append('width_in', '3.5');
const response = await fetch(endpoint, {
  method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  signal: AbortSignal.timeout(35_000),
});
assert.equal(response.status, 200, 'PNG proxy estimate failed');
const data = await response.json();
assert.ok(Number.isFinite(data.estimated_stitches) && data.estimated_stitches > 0);
assert.ok(data.low_stitches <= data.estimated_stitches && data.high_stitches >= data.estimated_stitches);
assert.match(data.embroidery_preview.data_url, /^data:image\/png;base64,/);
const preview = await sharp(Buffer.from(data.embroidery_preview.data_url.split(',')[1], 'base64')).metadata();
// The current SVG renderer rasterizes at 144 DPI (2× its logical dimensions).
assert.equal(preview.width, 400);
assert.ok(preview.hasAlpha, 'Embroidery preview must support transparency');
let record, mockup;
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = await pool.query("SELECT to_regclass('public.embroidery_estimates') AS ready");
    if (ready.rows[0].ready) break;
    if (attempt === 29) throw new Error('Saved-estimate migration missing');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const post = async (path, body) => {
    const response = await fetch(`${endpoint}/saved${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, `Saved workflow failed at ${path}`);
    return response.json();
  };
  record = await post('', { estimate_key: data.estimate_key, name: '__deployment_check__' });
  const original = await fetch(`${endpoint}/saved/${record.id}/source`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
  mockup = await post(`/${record.id}/mockup`, {});
  const again = await post(`/${record.id}/mockup`, {}); assert.equal(again.id, mockup.id);
  const row = (await pool.query('SELECT design_elements,design_canvas_inches,design_canvas_inches_h FROM mockups WHERE id=$1', [mockup.id])).rows[0];
  assert.ok(Math.abs(row.design_elements[0].width * row.design_canvas_inches / 100 - 3.5) < 0.001);
  const actual = await post(`/${record.id}/actual`, { actual_stitches: data.estimated_stitches + 100 });
  assert.equal(actual.actual_stitches, data.estimated_stitches + 100);
  console.log('Saved estimate, private source restore, exact-size reusable mockup and actual-count capture passed.');
} finally {
  if (record) {
    const row = (await pool.query('DELETE FROM embroidery_estimates WHERE id=$1 AND name=$2 RETURNING source_key,preview_key,mockup_id', [record.id, '__deployment_check__'])).rows[0];
    if (row) {
      if (row.mockup_id) await pool.query('DELETE FROM mockups WHERE id=$1 AND name=$2', [row.mockup_id, 'Embroidery — __deployment_check__']);
      await getSpacesClient().send(new DeleteObjectsCommand({ Bucket: SPACES_BUCKET, Delete: { Objects: [{ Key: row.source_key }, { Key: row.preview_key }] } }));
    }
  }
  await pool.end();
}
const page = await fetch('https://tshirtbrothers.com/stitch-estimator', { signal: AbortSignal.timeout(10_000) });
assert.equal(page.status, 200, 'HTTPS page unavailable');
assert.match(await page.text(), /<div id="root"/);
console.log('Stitch estimator HTTPS page, authentication, real PNG estimate and embroidery preview passed.');
