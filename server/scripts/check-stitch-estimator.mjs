// Deployment-only smoke check: no user records, uploads or quote changes.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import assert from 'node:assert/strict';

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
const token = jwt.sign({ id: 0, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '60s' });
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
assert.equal(preview.width, 200);
assert.ok(preview.hasAlpha, 'Embroidery preview must support transparency');
const page = await fetch('https://tshirtbrothers.com/stitch-estimator', { signal: AbortSignal.timeout(10_000) });
assert.equal(page.status, 200, 'HTTPS page unavailable');
assert.match(await page.text(), /<div id="root"/);
console.log('Stitch estimator HTTPS page, authentication, real PNG estimate and embroidery preview passed.');
