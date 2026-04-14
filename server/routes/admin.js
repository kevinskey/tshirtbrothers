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
// POST /customers - Create a new customer
router.post('/customers', async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already exists' });

    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, created_at',
      [name, email, phone || null, hash, 'customer']
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /customers/bulk-import - Create many customers at once from a CSV upload
// Body: { rows: [{ name, email, phone? }, ...], update_existing?: boolean }
// If update_existing is true, existing emails have their name/phone updated
// (empty fields in the CSV leave the existing value alone). Otherwise they're
// skipped. Returns per-row status so the UI can show a preview.
router.post('/customers/bulk-import', async (req, res, next) => {
  try {
    const { rows, update_existing = false } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ error: 'Too many rows (max 5000 per import)' });
    }

    const bcrypt = (await import('bcryptjs')).default;
    const results = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
      const phoneValue = typeof row.phone === 'string' && row.phone.trim() ? row.phone.trim() : null;

      if (!name || !email) {
        failed++;
        results.push({ row: i + 1, email, status: 'error', message: 'name and email are required' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed++;
        results.push({ row: i + 1, email, status: 'error', message: 'invalid email' });
        continue;
      }

      try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
          if (update_existing) {
            await pool.query(
              'UPDATE users SET name = COALESCE(NULLIF($1, \'\'), name), phone = COALESCE($2, phone) WHERE id = $3',
              [name, phoneValue, existing.rows[0].id]
            );
            updated++;
            results.push({ row: i + 1, email, status: 'updated' });
          } else {
            skipped++;
            results.push({ row: i + 1, email, status: 'skipped', message: 'email already exists' });
          }
          continue;
        }
        const hash = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10);
        await pool.query(
          'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
          [name, email, phoneValue, hash, 'customer']
        );
        created++;
        results.push({ row: i + 1, email, status: 'created' });
      } catch (innerErr) {
        failed++;
        results.push({ row: i + 1, email, status: 'error', message: innerErr.message || 'insert failed' });
      }
    }

    res.json({ created, updated, skipped, failed, total: rows.length, results });
  } catch (err) {
    next(err);
  }
});

// DELETE /customers/:id - Delete a customer
router.delete('/customers/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id', [req.params.id, 'customer']);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

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
         u.id, u.email, u.name, u.phone,
         u.address_street, u.address_city, u.address_state, u.address_zip,
         u.created_at,
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
      "SELECT id, email, name, phone, address_street, address_city, address_state, address_zip, created_at FROM users WHERE id = $1 AND role = 'customer'",
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
         sd.id, sd.name, sd.product_name, sd.product_ss_id, sd.product_image, sd.color_index,
         sd.elements, sd.mockup_url, sd.print_url, sd.thumbnail, sd.created_at,
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

// GET /orders - Only quotes with deposit paid (accepted/completed)
router.get('/orders', async (req, res, next) => {
  try {
    const { status, search, sort } = req.query;
    const params = [];
    let whereClause = "WHERE q.status IN ('accepted', 'completed')";

    if (status && status !== 'all') {
      params.push(status);
      whereClause += ` AND q.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (q.customer_name ILIKE $${params.length} OR q.customer_email ILIKE $${params.length} OR q.product_name ILIKE $${params.length})`;
    }

    let orderClause = 'ORDER BY q.accepted_at DESC NULLS LAST';
    if (sort === 'date_needed') {
      orderClause = 'ORDER BY q.date_needed ASC NULLS LAST, q.accepted_at DESC';
    } else if (sort === 'newest') {
      orderClause = 'ORDER BY q.created_at DESC';
    }

    const { rows } = await pool.query(
      `SELECT
         q.id, q.product_name, q.quantity, q.status, q.estimated_price, q.deposit_amount, q.accepted_at,
         q.created_at, q.date_needed, q.notes, q.admin_notes, q.shipping_method,
         q.customer_name, q.customer_email, q.customer_phone
       FROM quotes q
       ${whereClause}
       ${orderClause}`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /stats - Dashboard stats including pending quote count
router.get('/stats/counts', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_quotes,
        COUNT(*) FILTER (WHERE status IN ('pending','reviewed','quoted')) AS active_quotes,
        COUNT(*) FILTER (WHERE status = 'accepted') AS active_orders
       FROM quotes`
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /designs/:id - Delete a saved design
router.delete('/designs/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM saved_designs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Design not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id/pricing - Update product pricing
router.put('/products/:id/pricing', async (req, res, next) => {
  try {
    const { custom_price, price_visible } = req.body;
    const result = await pool.query(
      `UPDATE products SET
        custom_price = $1,
        price_visible = COALESCE($2, price_visible)
      WHERE id = $3 RETURNING id, name, base_price, custom_price, price_visible`,
      [custom_price !== undefined ? custom_price : null, price_visible, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /products/bulk-markup - Apply markup to all products without custom prices
router.put('/products/bulk-markup', async (req, res, next) => {
  try {
    const { markupPercent } = req.body;
    if (markupPercent === undefined) return res.status(400).json({ error: 'markupPercent required' });

    // Update settings
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('defaultMarkup', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(markupPercent)]
    );

    // Fetch S&S pricing and apply markup to products that don't have custom prices
    // For now, just update the setting — pricing is calculated on the fly
    res.json({ success: true, markupPercent });
  } catch (err) {
    next(err);
  }
});

// --- Custom Products ---

// GET /custom-products - List all custom products
router.get('/custom-products', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM custom_products ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /custom-products - Create custom product
router.post('/custom-products', async (req, res, next) => {
  try {
    const { name, description, category, image_url, price, price_unit, sizes, options } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await pool.query(
      `INSERT INTO custom_products (name, description, category, image_url, price, price_unit, sizes, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, description || null, category || 'Custom', image_url || null, price || null, price_unit || 'per item', JSON.stringify(sizes || []), JSON.stringify(options || [])]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /custom-products/:id - Update custom product
router.put('/custom-products/:id', async (req, res, next) => {
  try {
    const { name, description, category, image_url, price, price_unit, sizes, options, is_active } = req.body;
    const result = await pool.query(
      `UPDATE custom_products SET
        name = COALESCE($1, name), description = COALESCE($2, description), category = COALESCE($3, category),
        image_url = COALESCE($4, image_url), price = COALESCE($5, price), price_unit = COALESCE($6, price_unit),
        sizes = COALESCE($7, sizes), options = COALESCE($8, options), is_active = COALESCE($9, is_active), updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name, description, category, image_url, price, price_unit, sizes ? JSON.stringify(sizes) : null, options ? JSON.stringify(options) : null, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /custom-products/:id - Delete custom product
router.delete('/custom-products/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM custom_products WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
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

// ── Admin Design Library ─────────────────────────────────────────────────────

router.get('/designs-library', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const conditions = [];
    const params = [];
    if (category && category !== 'all') {
      params.push(category);
      conditions.push('category = $' + params.length);
    }
    if (search) {
      params.push('%' + search + '%');
      conditions.push('(name ILIKE $' + params.length + ' OR description ILIKE $' + params.length + ')');
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const { rows } = await pool.query('SELECT * FROM admin_designs' + where + ' ORDER BY created_at DESC', params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/designs-library', async (req, res, next) => {
  try {
    const { name, description, image_url, thumbnail_url, tags, width, height, file_size, category } = req.body;
    if (!name || !image_url) return res.status(400).json({ error: 'name and image_url required' });
    const { rows } = await pool.query(
      'INSERT INTO admin_designs (name, description, image_url, thumbnail_url, tags, width, height, file_size, category, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [name, description || null, image_url, thumbnail_url || image_url, tags || [], width || null, height || null, file_size || null, category || 'general', req.user?.id || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/designs-library/:id', async (req, res, next) => {
  try {
    const { name, description, tags, category } = req.body;
    const { rows } = await pool.query(
      'UPDATE admin_designs SET name=COALESCE($1,name), description=COALESCE($2,description), tags=COALESCE($3,tags), category=COALESCE($4,category), updated_at=NOW() WHERE id=$5 RETURNING *',
      [name, description, tags, category, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/designs-library/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM admin_designs WHERE id=$1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
