import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { authenticate } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

// All design routes require authentication
router.use(authenticate);

// Helper: upload base64 image to DO Spaces
async function uploadToSpaces(base64Data, folder, filename, contentType = 'image/png') {
  const spacesKey = process.env.SPACES_KEY;
  const spacesSecret = process.env.SPACES_SECRET;
  if (!spacesKey || !spacesSecret) return null;

  const s3 = new S3Client({
    endpoint: process.env.SPACES_ENDPOINT,
    region: process.env.SPACES_REGION || 'atl1',
    credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
  });

  const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  const key = `${folder}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: `attachment; filename="${filename.split('/').pop()}"`,
    ACL: 'public-read',
  }));

  const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
  const region = process.env.SPACES_REGION || 'atl1';
  return { url: `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`, size: buffer.length };
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

    // Preserve the original file type so PDFs, AI, PSD, TIFF, etc. are stored
    // with the correct bytes and downloadable later.
    const dataUrlMatch = /^data:([^;]+);base64,/.exec(imageBase64);
    const contentType = dataUrlMatch?.[1] || 'image/png';
    const origName = (filename || 'upload').replace(/[^a-zA-Z0-9.\-_]/g, '-');
    const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(origName);
    const extFromMime = contentType.split('/')[1]?.split('+')[0] || 'bin';
    const safeName = hasExt ? origName : `${origName}.${extFromMime}`;
    const keyName = `${Date.now()}-${safeName}`;

    const uploaded = await uploadToSpaces(
      imageBase64,
      `customers/${req.user.id}/uploads`,
      keyName,
      contentType,
    );

    if (!uploaded) return res.status(500).json({ error: 'Upload failed' });
    const { url, size } = uploaded;

    const result = await pool.query(
      'INSERT INTO user_uploads (user_id, url, filename) VALUES ($1, $2, $3) RETURNING id, url, filename, created_at',
      [req.user.id, url, filename || safeName]
    );

    // If the Design Lab request specifies which customer this graphic is for
    // (admin working on behalf of a customer), also file it under that
    // customer's private asset library so it shows up in the customer's
    // folder, not the admin's.
    const { customer_id } = req.body;
    if (customer_id) {
      try {
        const target = await pool.query(
          "SELECT id FROM users WHERE id = $1 AND role = 'customer'",
          [customer_id],
        );
        if (target.rows.length) {
          await pool.query(
            `INSERT INTO customer_assets (user_id, name, image_url, file_type, size_bytes, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [customer_id, filename || safeName, url, contentType, size, 'Uploaded in Design Lab', req.user.id],
          );
        }
      } catch (assetErr) {
        console.error('[designs/uploads] customer_assets filing failed:', assetErr.message);
      }
    }

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
          const result = await uploadToSpaces(
            el.content,
            `customers/${req.user.id}/design-elements`,
            `element-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
          );
          savedElements.push({ ...el, content: result?.url || el.content });
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
        const result = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (result?.url) thumbnailUrl = result.url;
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
        const result = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (result?.url) thumbnailUrl = result.url;
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
