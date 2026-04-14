import express, { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

// ── S3 client (DO Spaces) ────────────────────────────────────────────────────

function getS3() {
  const key = process.env.SPACES_KEY;
  const secret = process.env.SPACES_SECRET;
  if (!key || !secret) throw new Error('DO Spaces credentials not configured');
  const region = process.env.SPACES_REGION || 'atl1';
  return new S3Client({
    endpoint: `https://${region}.digitaloceanspaces.com`,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
}

async function uploadToSpaces(buffer, keyPath, contentType) {
  const s3 = getS3();
  const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: keyPath,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  }));
  const region = process.env.SPACES_REGION || 'atl1';
  return `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${keyPath}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /embroidery-jobs - list all jobs (admin)
router.get('/embroidery-jobs', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const clauses = [];
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`j.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(j.name ILIKE $${params.length} OR j.notes ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT j.*, u.name AS customer_name, u.email AS customer_email
       FROM embroidery_jobs j
       LEFT JOIN users u ON u.id = j.customer_id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /embroidery-jobs/:id - single job
router.get('/embroidery-jobs/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT j.*, u.name AS customer_name, u.email AS customer_email
       FROM embroidery_jobs j
       LEFT JOIN users u ON u.id = j.customer_id
       WHERE j.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /embroidery-jobs - create a new job (upload source image)
// Body: { name, notes?, imageBase64, filename?, quote_id?, customer_id?, colors? }
router.post('/embroidery-jobs', authenticate, adminOnly, express.json({ limit: '25mb' }), async (req, res, next) => {
  try {
    const { name, notes, imageBase64, filename, quote_id, customer_id, colors } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    // Strip data URL prefix if present
    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const safeName = (filename || 'artwork.png').replace(/[^a-zA-Z0-9.\-]/g, '-');
    const rand = crypto.randomBytes(4).toString('hex');
    const key = `embroidery/${Date.now()}-${rand}-${safeName}`;
    const url = await uploadToSpaces(buf, key, 'image/png');

    const { rows } = await pool.query(
      `INSERT INTO embroidery_jobs (name, notes, source_image_url, quote_id, customer_id, colors)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, notes || null, url, quote_id || null, customer_id || null, colors || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /embroidery-jobs/:id - update fields (status, notes, digitizer, cost)
router.patch('/embroidery-jobs/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, notes, status, digitizer, cost, colors, quote_id, customer_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE embroidery_jobs SET
         name        = COALESCE($1, name),
         notes       = COALESCE($2, notes),
         status      = COALESCE($3, status),
         digitizer   = COALESCE($4, digitizer),
         cost        = COALESCE($5, cost),
         colors      = COALESCE($6, colors),
         quote_id    = COALESCE($7, quote_id),
         customer_id = COALESCE($8, customer_id),
         updated_at  = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, notes, status, digitizer, cost, colors, quote_id, customer_id, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /embroidery-jobs/:id/dst - attach the digitized DST file
// Body: { dstBase64, filename? }
router.post('/embroidery-jobs/:id/dst', authenticate, adminOnly, express.json({ limit: '15mb' }), async (req, res, next) => {
  try {
    const { dstBase64, filename } = req.body;
    if (!dstBase64) return res.status(400).json({ error: 'dstBase64 is required' });
    const base64 = dstBase64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const safeName = (filename || 'design.dst').replace(/[^a-zA-Z0-9.\-]/g, '-');
    const key = `embroidery/dst/${Date.now()}-${safeName}`;
    const url = await uploadToSpaces(buf, key, 'application/octet-stream');
    const { rows } = await pool.query(
      `UPDATE embroidery_jobs
       SET dst_file_url = $1, status = 'dst_ready', updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [url, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /embroidery-jobs/:id/vectorize - trace the source image and save SVG
router.post('/embroidery-jobs/:id/vectorize', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM embroidery_jobs WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const job = rows[0];
    if (!job.source_image_url) return res.status(400).json({ error: 'Job has no source image' });

    // Delegate to the existing /api/design/vectorize endpoint (internal call).
    // That endpoint returns { svg: string } which we save to Spaces so we can
    // render it without always re-tracing.
    const base = process.env.INTERNAL_BASE_URL || 'http://localhost:' + (process.env.PORT || 3001);
    const authHeader = req.headers.authorization || '';
    const vectorResp = await fetch(`${base}/api/design/vectorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ imageUrl: job.source_image_url, colors: req.body.colors || 1 }),
    });
    if (!vectorResp.ok) {
      const errText = await vectorResp.text();
      return res.status(500).json({ error: `Vectorize failed: ${errText}` });
    }
    const { svg } = await vectorResp.json();
    if (!svg) return res.status(500).json({ error: 'Vectorize returned empty SVG' });

    const key = `embroidery/svg/${Date.now()}-job-${job.id}.svg`;
    const svgUrl = await uploadToSpaces(Buffer.from(svg, 'utf-8'), key, 'image/svg+xml');
    const updated = await pool.query(
      'UPDATE embroidery_jobs SET vector_svg_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [svgUrl, job.id]
    );
    res.json(updated.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /embroidery-jobs/:id
router.delete('/embroidery-jobs/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM embroidery_jobs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
