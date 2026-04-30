import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';

const router = Router();

// All design routes require authentication
router.use(authenticate);

// Helper: upload base64 image to DO Spaces. Delegates to the shared helper
// in services/spaces.js so the endpoint/region/URL stay consistent with
// every other uploader in the app.
async function uploadToSpaces(base64Data, folder, filename) {
  if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) return null;
  try {
    return await uploadObject({
      key: `${folder}/${filename}`,
      body: base64Data,
      contentType: 'image/png',
    });
  } catch (err) {
    console.error('[designs] upload failed:', err.message);
    return null;
  }
}

// GET / - List user's saved designs
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, product_name, product_image, thumbnail, updated_at FROM saved_designs WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ designs: result.rows });
  } catch (err) {
    next(err);
  }
});

// --- Upload library routes MUST be before /:id to avoid "uploads" matching the :id param ---

// GET /uploads - Get user's upload library
router.get('/uploads', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, url, filename, created_at FROM user_uploads WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /uploads - Save an uploaded image to the user's library
router.post('/uploads', async (req, res, next) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const url = await uploadToSpaces(
      imageBase64,
      `customers/${req.user.id}/uploads`,
      `${(filename || 'upload').replace(/[^a-zA-Z0-9.-]/g, '-')}-${Date.now()}.png`
    );

    if (!url) return res.status(500).json({ error: 'Upload failed' });

    const result = await pool.query(
      'INSERT INTO user_uploads (user_id, url, filename) VALUES ($1, $2, $3) RETURNING id, url, filename, created_at',
      [req.user.id, url, filename || 'upload.png']
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /uploads/:id - Remove an upload from library
router.delete('/uploads/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_uploads WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// --- End upload library routes ---

// GET /:id - Load a specific design
router.get('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      'SELECT * FROM saved_designs WHERE id = $1 AND user_id = $2',
      [designId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST / - Save a new design
router.post('/', async (req, res, next) => {
  try {
    const { name, product_ss_id, product_name, product_image, color_index, elements } = req.body;
    const designName = name || 'Untitled design';

    // Upload any design element images that are data URLs to Spaces
    const savedElements = [];
    for (const el of (elements || [])) {
      if (el.type === 'image' && el.content && el.content.startsWith('data:')) {
        try {
          const url = await uploadToSpaces(
            el.content,
            `customers/${req.user.id}/design-elements`,
            `element-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
          );
          savedElements.push({ ...el, content: url || el.content });
        } catch {
          savedElements.push(el);
        }
      } else {
        savedElements.push(el);
      }
    }

    // Upload thumbnail snapshot to Spaces if it's a data URL
    let thumbnailUrl = product_image;
    const { thumbnail } = req.body;
    if (thumbnail && thumbnail.startsWith('data:')) {
      try {
        const url = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (url) thumbnailUrl = url;
      } catch { /* keep default */ }
    } else if (thumbnail) {
      thumbnailUrl = thumbnail;
    }

    const result = await pool.query(
      `INSERT INTO saved_designs (user_id, name, product_ss_id, product_name, product_image, color_index, elements, thumbnail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, updated_at`,
      [req.user.id, designName, product_ss_id, product_name, product_image, color_index || 0, JSON.stringify(savedElements), thumbnailUrl]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - Update an existing design
router.put('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const { name, product_ss_id, product_name, product_image, color_index, elements, thumbnail } = req.body;

    // Upload thumbnail snapshot to Spaces if it's a data URL
    let thumbnailUrl = thumbnail;
    if (thumbnail && thumbnail.startsWith('data:')) {
      try {
        const url = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (url) thumbnailUrl = url;
      } catch { /* keep as-is */ }
    }

    const result = await pool.query(
      `UPDATE saved_designs SET
        name = COALESCE($1, name),
        product_ss_id = COALESCE($2, product_ss_id),
        product_name = COALESCE($3, product_name),
        product_image = COALESCE($4, product_image),
        color_index = COALESCE($5, color_index),
        elements = COALESCE($6, elements),
        thumbnail = COALESCE($7, thumbnail),
        updated_at = NOW()
       WHERE id = $8 AND user_id = $9
       RETURNING id, name, updated_at`,
      [name, product_ss_id, product_name, product_image, color_index, elements ? JSON.stringify(elements) : null, thumbnailUrl, designId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - Delete a design
router.delete('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      'DELETE FROM saved_designs WHERE id = $1 AND user_id = $2 RETURNING id',
      [designId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// GET /my-assets - the logged-in customer's private asset library
// (admin uploads graphics to a customer via /api/admin/customers/:id/assets;
// the customer sees them here.)
router.get('/my-assets', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, image_url, file_type, width, height, size_bytes, created_at FROM customer_assets WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
