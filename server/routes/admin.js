import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchProducts } from '../services/ssActivewear.js';
import pool from '../db.js';

const router = Router();

router.use(authenticate, adminOnly);

// POST /sync-products - Sync products from S&S Activewear
router.post('/sync-products', async (req, res, next) => {
  try {
    const result = await fetchProducts({ limit: 10000 });
    const products = result.products || [];
    console.log(`Syncing ${products.length} products...`);

    let upserted = 0;
    for (const product of products) {
      await pool.query(
        `INSERT INTO products (ss_id, name, brand, category, base_price, colors, sizes, image_url, back_image_url, specifications, price_breaks, last_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (ss_id) DO UPDATE SET
           name = EXCLUDED.name,
           brand = EXCLUDED.brand,
           category = EXCLUDED.category,
           base_price = EXCLUDED.base_price,
           colors = EXCLUDED.colors,
           sizes = EXCLUDED.sizes,
           image_url = EXCLUDED.image_url,
           back_image_url = EXCLUDED.back_image_url,
           specifications = EXCLUDED.specifications,
           price_breaks = EXCLUDED.price_breaks,
           last_synced = NOW()`,
        [
          product.ss_id,
          product.name,
          product.brand,
          product.category,
          product.base_price,
          JSON.stringify(product.colors || []),
          JSON.stringify(product.sizes || []),
          product.image_url,
          product.back_image_url,
          JSON.stringify(product.specifications || {}),
          JSON.stringify(product.price_breaks || []),
        ]
      );
      upserted++;
    }

    res.json({ message: 'Product sync complete', upserted });
  } catch (err) {
    next(err);
  }
});

// POST /upload-url - Generate presigned upload URL for DO Spaces
router.post('/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const s3Client = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_REGION,
      credentials: {
        accessKeyId: process.env.SPACES_KEY,
        secretAccessKey: process.env.SPACES_SECRET,
      },
    });

    const key = `uploads/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`;

    res.json({ uploadUrl, fileUrl });
  } catch (err) {
    next(err);
  }
});

// GET /customers - List all registered customers with design/quote counts
router.get('/customers', async (req, res, next) => {
  try {
    const { search } = req.query;
    let whereClause = "WHERE u.role = 'customer'";
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT
         u.id, u.email, u.name, u.created_at,
         COALESCE(d.design_count, 0)::int AS design_count,
         COALESCE(q.quote_count, 0)::int AS quote_count
       FROM users u
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS design_count FROM saved_designs GROUP BY user_id
       ) d ON d.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS quote_count FROM quotes GROUP BY user_id
       ) q ON q.user_id = u.id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id - Get single customer with their designs and quotes
router.get('/customers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const userResult = await pool.query(
      "SELECT id, email, name, created_at FROM users WHERE id = $1 AND role = 'customer'",
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = userResult.rows[0];

    const designsResult = await pool.query(
      `SELECT id, name, product_name, mockup_url, print_url, created_at
       FROM saved_designs WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    const quotesResult = await pool.query(
      `SELECT id, product_name, quantity, status, estimated_price, created_at
       FROM quotes WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...customer,
      designs: designsResult.rows,
      quotes: quotesResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /customer-designs - List all saved designs across all customers
router.get('/customer-designs', async (req, res, next) => {
  try {
    const { search } = req.query;
    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE sd.name ILIKE $${params.length} OR u.name ILIKE $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         sd.id, sd.name, sd.product_name, sd.mockup_url, sd.print_url, sd.created_at,
         u.name AS user_name, u.email AS user_email
       FROM saved_designs sd
       JOIN users u ON u.id = sd.user_id
       ${whereClause}
       ORDER BY sd.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /orders - List all orders (using quotes table)
router.get('/orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    let whereClause = '';
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE q.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         q.id, q.product_name, q.quantity, q.status, q.estimated_price,
         q.created_at,
         q.customer_name, q.customer_email, q.customer_phone
       FROM quotes q
       ${whereClause}
       ORDER BY q.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /settings - Get all settings as key-value object
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PUT /settings - Upsert settings
router.put('/settings', async (req, res, next) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ success: true, updated: entries.length });
  } catch (err) {
    next(err);
  }
});

export default router;
