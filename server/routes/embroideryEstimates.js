import { Router } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import pool from '../db.js';
import { uploadObject, getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';
import { embroideryMockupFields } from '../lib/embroideryMockup.js';

export function createEstimateRecordsRouter({ cache, db = pool, upload = uploadObject }) {
  const router = Router();
  router.param('id', (req, res, next, id) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? next() : res.status(422).json({ error: 'Invalid estimate number.' }));
  const expose = row => ({ ...row, data: { ...row.data, embroidery_preview: { ...row.data.embroidery_preview, data_url: row.preview_url } }, source_key: undefined, preview_key: undefined });
  router.get('/', async (req, res, next) => {
    try {
      const quote = req.query.quote_id;
      if (quote && (!/^\d+$/.test(String(quote)) || !Number.isSafeInteger(Number(quote)))) return res.status(422).json({ error: 'Invalid quote number.' });
      const { rows } = await db.query(`SELECT id,name,quote_id,mockup_id,actual_stitches,created_at,data->>'estimated_stitches' AS estimated_stitches FROM embroidery_estimates ${quote ? 'WHERE quote_id=$1' : ''} ORDER BY created_at DESC LIMIT 30`, quote ? [quote] : []);
      res.json(rows);
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT * FROM embroidery_estimates WHERE id=$1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Saved estimate not found.' });
      res.set('Cache-Control', 'no-store').json(expose(rows[0]));
    } catch (error) { next(error); }
  });
  for (const asset of ['source', 'preview']) router.get(`/:id/${asset}`, async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT * FROM embroidery_estimates WHERE id=$1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Saved estimate not found.' });
      const object = await getSpacesClient().send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: rows[0][`${asset}_key`] }));
      res.set('Content-Type', 'image/png').set('Cache-Control', 'private, no-store').send(Buffer.from(await object.Body.transformToByteArray()));
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try {
      const { estimate_key, name, quote_id } = req.body;
      if (typeof estimate_key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(estimate_key)) return res.status(422).json({ error: 'Estimate again before saving.' });
      const existing = await db.query('SELECT * FROM embroidery_estimates WHERE estimate_key=$1', [estimate_key]);
      if (existing.rows[0]) return res.json(expose(existing.rows[0]));
      const entry = cache.get(estimate_key);
      if (!entry || entry.expires < Date.now() || String(entry.user) !== String(req.user.id)) return res.status(410).json({ error: 'Unsaved estimate expired. Estimate again to save it.' });
      const quote = quote_id == null || quote_id === '' ? null : Number(quote_id);
      if (quote !== null && (!Number.isSafeInteger(quote) || quote < 1)) return res.status(422).json({ error: 'Enter a valid quote number.' });
      if (quote !== null && !(await db.query('SELECT id FROM quotes WHERE id=$1', [quote])).rows.length) return res.status(422).json({ error: 'Quote does not exist.' });
      const sourceKey = `embroidery-estimates/${estimate_key}/source.png`, previewKey = `embroidery-estimates/${estimate_key}/preview.png`;
      await upload({ key: sourceKey, body: entry.source, acl: 'private' });
      const previewUrl = await upload({ key: previewKey, body: entry.result.embroidery_preview.data_url });
      const data = { ...entry.result, embroidery_preview: { ...entry.result.embroidery_preview, data_url: undefined } };
      const { rows } = await db.query(`INSERT INTO embroidery_estimates (estimate_key,name,quote_id,data,source_key,preview_key,preview_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (estimate_key) DO UPDATE SET estimate_key=EXCLUDED.estimate_key RETURNING *`,
      [estimate_key, String(name || entry.filename || 'Embroidery artwork').slice(0, 200), quote, JSON.stringify(data), sourceKey, previewKey, previewUrl]);
      cache.delete(estimate_key);
      res.json(expose(rows[0]));
    } catch (error) { next(error); }
  });
  router.post('/:id/actual', async (req, res, next) => {
    const actual = Number(req.body.actual_stitches);
    if (!Number.isSafeInteger(actual) || actual < 1 || actual > 10_000_000) return res.status(422).json({ error: 'Enter the actual digitized stitch count (1–10,000,000).' });
    try {
      const { rows } = await db.query('UPDATE embroidery_estimates SET actual_stitches=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [actual, req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Saved estimate not found.' });
      res.json(expose(rows[0]));
    } catch (error) { next(error); }
  });
  router.post('/:id/mockup', async (req, res, next) => {
    let client;
    try {
      client = await db.connect();
      await client.query('BEGIN');
      const record = (await client.query('SELECT * FROM embroidery_estimates WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!record) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Saved estimate not found.' }); }
      if (record.mockup_id) { await client.query('COMMIT'); return res.json({ id: record.mockup_id }); }
      const m = embroideryMockupFields(record);
      const quote = record.quote_id ? (await client.query('SELECT customer_email,customer_name FROM quotes WHERE id=$1', [record.quote_id])).rows[0] : null;
      const { rows } = await client.query(`INSERT INTO mockups (name,quote_id,customer_email,customer_name,graphic_url,preview_image_url,notes,design_elements,design_canvas_inches,design_canvas_inches_h)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [m.name,m.quote_id,quote?.customer_email || null,quote?.customer_name || null,m.graphic_url,m.preview_image_url,m.notes,JSON.stringify(m.design_elements),m.design_canvas_inches,m.design_canvas_inches_h]);
      await client.query('UPDATE embroidery_estimates SET mockup_id=$1,updated_at=NOW() WHERE id=$2', [rows[0].id, record.id]);
      await client.query('COMMIT'); res.json(rows[0]);
    } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client?.release(); }
  });
  return router;
}
