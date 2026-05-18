import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getSpacesClient, SPACES_BUCKET, uploadObject, publicUrl } from '../services/spaces.js';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

// PUBLIC — homepage HeroSection reads this. Returns active slides ordered.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, image_url, label, link_url, sort_order
         FROM hero_slides WHERE active = TRUE
         ORDER BY sort_order ASC, id ASC`
    );
    res.json({ slides: rows });
  } catch (err) { next(err); }
});

export default router;

// ADMIN sub-router — mounted at /api/admin/hero-slides.
export const adminRouter = Router();
adminRouter.use(authenticate, adminOnly);

// List ALL slides (incl. inactive) for the admin grid.
adminRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, image_url, label, link_url, sort_order, active, created_at, updated_at
         FROM hero_slides ORDER BY sort_order ASC, id ASC`
    );
    res.json({ slides: rows });
  } catch (err) { next(err); }
});

// List files already in Spaces under hero-slides/v2/ so admin can pick
// from existing artwork without re-uploading.
adminRouter.get('/available', async (_req, res, next) => {
  try {
    const r = await getSpacesClient().send(new ListObjectsV2Command({
      Bucket: SPACES_BUCKET,
      Prefix: 'hero-slides/',
      MaxKeys: 200,
    }));
    const objs = (r.Contents || [])
      .filter((o) => o.Size > 0 && /\.(png|jpe?g|webp)$/i.test(o.Key))
      .map((o) => ({ key: o.Key, url: publicUrl(o.Key), size: o.Size }));
    res.json({ files: objs });
  } catch (err) { next(err); }
});

// Upload a new slide (base64 PNG/JPEG). Returns the public URL only —
// admin still has to POST / to actually add a slide row referencing it.
adminRouter.post('/upload', async (req, res, next) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    const match = String(imageBase64).match(/^data:([^;]+);base64,/);
    const contentType = match ? match[1] : 'image/png';
    const extFromCT = contentType.split('/')[1]?.split('+')[0] || 'png';
    const safe = String(filename || `slide.${extFromCT}`).replace(/[^a-zA-Z0-9.-]/g, '-');
    const key = `hero-slides/v3/${Date.now()}-${safe}`;
    const url = await uploadObject({ key, body: imageBase64, contentType });
    res.json({ url, key });
  } catch (err) { next(err); }
});

// Create a hero_slides row.
adminRouter.post('/', async (req, res, next) => {
  try {
    const { image_url, label, link_url, sort_order, active } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url required' });
    const { rows } = await pool.query(
      `INSERT INTO hero_slides (image_url, label, link_url, sort_order, active)
       VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, TRUE))
       RETURNING *`,
      [image_url, label || null, link_url || null, sort_order ?? null, active ?? null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Patch a row. Any subset of label/link_url/sort_order/active can change.
adminRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const allowed = ['image_url', 'label', 'link_url', 'sort_order', 'active'];
    const updates = [];
    const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        vals.push(req.body[k]);
        updates.push(`${k} = $${vals.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'no updatable fields' });
    updates.push(`updated_at = NOW()`);
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE hero_slides SET ${updates.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete a row. Doesn't delete the underlying Spaces file — admin can
// still re-link it from /available.
adminRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { rowCount } = await pool.query('DELETE FROM hero_slides WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// Hard-delete the underlying Spaces file (separate action so the admin
// can't trip into this accidentally via the row-delete endpoint).
adminRouter.delete('/file/*', async (req, res, next) => {
  try {
    const key = req.params[0];
    if (!key || !key.startsWith('hero-slides/')) {
      return res.status(400).json({ error: 'key must be under hero-slides/' });
    }
    await getSpacesClient().send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
    res.json({ deleted: true, key });
  } catch (err) { next(err); }
});
