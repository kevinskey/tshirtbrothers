import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createEstimateRecordsRouter } from './embroideryEstimates.js';

test('saved estimates reuse assets and mockups, retain quote context and actual counts', async () => {
  const key = 'bb10c5e7-afad-4092-bf96-100000000001';
  const cache = new Map([[key, { user: 1, expires: Date.now() + 60_000, source: Buffer.from('original'), filename: 'logo.png', result: { estimate_key: key, width_in: 3.5, height_in: 2, estimated_stitches: 5000, embroidery_preview: { data_url: 'data:image/png;base64,YQ==' } } }]]);
  const uploads = []; let record; let mockupCount = 0;
  const query = async (sql, args = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
    if (sql.startsWith('SELECT id FROM quotes')) return { rows: args[0] === 17 ? [{ id: 17 }] : [] };
    if (sql.startsWith('SELECT customer_email')) return { rows: [{ customer_email: 'customer@example.test', customer_name: 'Customer' }] };
    if (sql.startsWith('SELECT * FROM embroidery_estimates')) return { rows: record ? [record] : [] };
    if (sql.startsWith('INSERT INTO embroidery_estimates')) {
      record = { id: 1, estimate_key: args[0], name: args[1], quote_id: args[2], data: JSON.parse(args[3]), source_key: args[4], preview_key: args[5], preview_url: args[6] }; return { rows: [record] };
    }
    if (sql.startsWith('INSERT INTO mockups')) {
      mockupCount++; assert.equal(args[1], 17); assert.equal(args[2], 'customer@example.test');
      const elements = JSON.parse(args[7]); assert.equal(elements[0].width * args[8] / 100, 3.5);
      return { rows: [{ id: 99 }] };
    }
    if (sql.startsWith('UPDATE embroidery_estimates SET mockup_id')) { record.mockup_id = args[0]; return { rows: [] }; }
    if (sql.startsWith('UPDATE embroidery_estimates SET actual_stitches')) { record.actual_stitches = args[0]; return { rows: [record] }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const db = { query, connect: async () => ({ query, release() {} }) };
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { id: 1 }; next(); });
  app.use('/saved', createEstimateRecordsRouter({ cache, db, upload: async options => { uploads.push(options); return `https://example.test/${options.key}`; } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/saved`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const save = await post('', { estimate_key: key, quote_id: 17 }); assert.equal(save.status, 200);
    const saved = await save.json(); assert.equal(saved.quote_id, 17); assert.equal(saved.source_key, undefined);
    assert.equal(uploads.length, 2); assert.equal(uploads[0].acl, 'private'); assert.equal(cache.size, 0);
    assert.equal((await post('', { estimate_key: key, quote_id: 17 })).status, 200); assert.equal(uploads.length, 2);
    assert.equal((await (await post('/1/mockup', {})).json()).id, 99);
    assert.equal((await (await post('/1/mockup', {})).json()).id, 99); assert.equal(mockupCount, 1);
    assert.equal((await post('/1/actual', { actual_stitches: -1 })).status, 422);
    const actual = await (await post('/1/actual', { actual_stitches: 5400 })).json(); assert.equal(actual.actual_stitches, 5400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('accuracy spans all records; metadata validates, persists and preserves saved payload', async () => {
  let metadata;
  const record = { id: 1, data: { estimated_stitches: 1000, width_in: 3.5, embroidery_preview: {} }, preview_url: 'preview' };
  const db = { query: async (sql, args) => {
    if (sql.startsWith('SELECT id,name,actual_stitches')) {
      assert.ok(!sql.includes('LIMIT')); assert.ok(!sql.includes('source_key'));
      return { rows: Array.from({ length: 35 }, (_, id) => ({ id: id + 1, actual_stitches: 1000, data: record.data })) };
    }
    assert.ok(sql.includes("jsonb_set(data,'{calibration}'"));
    metadata = JSON.parse(args[0]);
    return { rows: args[1] === '999' ? [] : [{ ...record, data: { ...record.data, calibration: metadata } }] };
  } };
  const app = express(); app.use(express.json()); app.use('/saved', createEstimateRecordsRouter({ cache: new Map(), db }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/saved`;
  const post = (id, complexity) => fetch(`${base}/${id}/calibration`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ complexity }) });
  try {
    const response = await fetch(`${base}/accuracy`); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const r = await response.json(); assert.equal(r.paired, 35); assert.equal(r.mape, 0);
    assert.equal((await post(1, 'unknown')).status, 422); assert.equal(metadata, undefined);
    const updated = await (await post(1, 'complex')).json(); assert.equal(updated.data.calibration.complexity, 'complex'); assert.equal(updated.data.estimated_stitches, 1000); assert.equal(updated.data.embroidery_preview.data_url, 'preview');
    assert.equal((await post(999, 'simple')).status, 404); assert.equal((await post('bad', 'simple')).status, 422);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
