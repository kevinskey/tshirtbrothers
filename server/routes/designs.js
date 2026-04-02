import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { authenticate } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

// All design routes require authentication
router.use(authenticate);

// Helper: upload base64 image to DO Spaces
async function uploadToSpaces(base64Data, folder, filename) {
  const spacesKey = process.env.SPACES_KEY;
  const spacesSecret = process.env.SPACES_SECRET;
  if (!spacesKey || !spacesSecret) return null;

  const s3 = new S3Client({
    endpoint: process.env.SPACES_ENDPOINT,
    region: process.env.SPACES_REGION || 'atl1',
    credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
  });

  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const key = `${folder}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    ACL: 'public-read',
  }));

  const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
  const region = process.env.SPACES_REGION || 'atl1';
  return `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`;
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

// GET /:id - Load a specific design
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM saved_designs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
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
    const { name, product_ss_id, product_name, product_image, color_index, elements, mockup_image, print_file } = req.body;
    const designName = name || 'Untitled design';
    const timestamp = Date.now();
    const safeName = designName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    // Upload mockup and print file to DO Spaces
    let mockupUrl = null;
    let printUrl = null;

    if (mockup_image) {
      mockupUrl = await uploadToSpaces(
        mockup_image,
        `customers/${req.user.id}/mockups`,
        `${safeName}-mockup-${timestamp}.png`
      );
    }
    if (print_file) {
      printUrl = await uploadToSpaces(
        print_file,
        `customers/${req.user.id}/print-ready`,
        `${safeName}-print-300dpi-${timestamp}.png`
      );
    }

    const result = await pool.query(
      `INSERT INTO saved_designs (user_id, name, product_ss_id, product_name, product_image, color_index, elements, thumbnail, mockup_url, print_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, updated_at, mockup_url, print_url`,
      [req.user.id, designName, product_ss_id, product_name, product_image, color_index || 0, JSON.stringify(elements || []), mockupUrl, mockupUrl, printUrl]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - Update an existing design
router.put('/:id', async (req, res, next) => {
  try {
    const { name, product_ss_id, product_name, product_image, color_index, elements, thumbnail } = req.body;
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
      [name, product_ss_id, product_name, product_image, color_index, elements ? JSON.stringify(elements) : null, thumbnail, req.params.id, req.user.id]
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
    const result = await pool.query(
      'DELETE FROM saved_designs WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
