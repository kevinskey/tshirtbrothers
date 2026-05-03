import express, { Router } from 'express';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchProducts, fetchStyleSizes } from '../services/ssActivewear.js';
import pool from '../db.js';

const router = Router();

// Public diagnostic — calls the same fetchStyleSizes the sync uses.
// Lets us isolate whether the function itself is broken vs the worker
// pool / upsert step.
router.get('/debug-fetchsizes-public/:styleId', async (req, res, next) => {
  try {
    const sizes = await fetchStyleSizes(req.params.styleId);
    return res.json({ styleId: req.params.styleId, sizes, count: sizes.length });
  } catch (err) {
    return res.json({ error: err.message, styleId: req.params.styleId });
  }
});

// Public diagnostic — temporary, see comment in handler. Revealed data is
// public product info (S&S styles + sizes), not a secret.
router.get('/debug-sizes-public/:styleId', async (req, res, next) => {
  try {
    const accountNumber = process.env.SS_ACCOUNT_NUMBER;
    const apiKey = process.env.SS_API_KEY;
    if (!accountNumber || !apiKey) {
      return res.json({ error: 'S&S credentials not configured', accountSet: !!accountNumber, keySet: !!apiKey });
    }
    const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
    const url = `https://api.ssactivewear.com/v2/products/?styleid=${req.params.styleId}&fields=sizeName,colorName`;
    const r = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
    });
    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const sample = Array.isArray(parsed) ? parsed.slice(0, 3) : null;
    return res.json({
      url,
      status: r.status,
      ok: r.ok,
      isArray: Array.isArray(parsed),
      itemCount: Array.isArray(parsed) ? parsed.length : null,
      sample,
      rawFirst300: text.slice(0, 300),
    });
  } catch (err) {
    next(err);
  }
});

router.use(authenticate, adminOnly);

// POST /sync-products - Sync products from S&S Activewear
router.post('/sync-products', async (req, res, next) => {
  try {
    const result = await fetchProducts({ limit: 10000 });
    const products = result.products || [];
    console.log(`Syncing ${products.length} products...`);

    // Backfill sizes per-style with bounded concurrency. S&S rate-limits
    // aggressively if you go too parallel — 3 in flight is the sweet spot
    // we've found that keeps the sync moving without 429s.
    const CONCURRENCY = 3;
    let nextIdx = 0;
    let sizesFilled = 0;
    async function worker() {
      while (true) {
        const i = nextIdx++;
        if (i >= products.length) return;
        const p = products[i];
        try {
          const sizes = await fetchStyleSizes(p.ss_id);
          if (sizes.length > 0) {
            p.sizes = sizes;
            sizesFilled++;
          }
        } catch (err) {
          console.error(`[sync] sizes fetch failed for style ${p.ss_id}:`, err.message);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`Sizes backfilled for ${sizesFilled}/${products.length} styles`);

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

    res.json({ message: 'Product sync complete', upserted, sizesFilled });
  } catch (err) {
    next(err);
  }
});

// GET /debug-sizes/:styleId — diagnostic for the size-backfill sync.
// Returns the raw S&S response so we can verify field names and data
// shape on prod without SSH access.
router.get('/debug-sizes/:styleId', async (req, res, next) => {
  try {
    const accountNumber = process.env.SS_ACCOUNT_NUMBER;
    const apiKey = process.env.SS_API_KEY;
    if (!accountNumber || !apiKey) {
      return res.json({ error: 'S&S credentials not configured', accountSet: !!accountNumber, keySet: !!apiKey });
    }
    const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
    const url = `https://api.ssactivewear.com/v2/products/?styleid=${req.params.styleId}&fields=sizeName,colorName`;
    const r = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
    });
    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const sample = Array.isArray(parsed) ? parsed.slice(0, 3) : null;
    return res.json({
      url,
      status: r.status,
      ok: r.ok,
      isArray: Array.isArray(parsed),
      itemCount: Array.isArray(parsed) ? parsed.length : null,
      sample,
      rawFirst300: text.slice(0, 300),
    });
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

    const { getSpacesClient, publicUrl, SPACES_BUCKET } = await import('../services/spaces.js');

    const key = `uploads/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    const uploadUrl = await getSignedUrl(getSpacesClient(), command, { expiresIn: 3600 });
    const fileUrl = publicUrl(key);

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

// PUT /customers/:id - Update customer contact info
router.put('/customers/:id', async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      address_street,
      address_city,
      address_state,
      address_zip,
    } = req.body || {};

    // If email is being changed, ensure it's not already in use
    if (email) {
      const dup = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id <> $2',
        [email, req.params.id],
      );
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET
         name           = COALESCE($1, name),
         email          = COALESCE($2, email),
         phone          = COALESCE($3, phone),
         address_street = COALESCE($4, address_street),
         address_city   = COALESCE($5, address_city),
         address_state  = COALESCE($6, address_state),
         address_zip    = COALESCE($7, address_zip)
       WHERE id = $8 AND role = 'customer'
       RETURNING id, name, email, phone, address_street, address_city, address_state, address_zip, created_at`,
      [
        name || null,
        email || null,
        phone || null,
        address_street || null,
        address_city || null,
        address_state || null,
        address_zip || null,
        req.params.id,
      ],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
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

    // Customer 360°: also pull invoices for this customer's email so the
    // detail modal shows the full revenue picture, not just open quotes.
    // Invoices link by email (no FK to users), so we match on the lowered email.
    const invoicesResult = await pool.query(
      `SELECT id, invoice_number, total, amount_paid, amount_due, status, payments,
              created_at, due_date, sent_at
       FROM invoices WHERE LOWER(customer_email) = LOWER($1) ORDER BY created_at DESC`,
      [customer.email]
    );

    // Lifetime revenue summary (paid only) + outstanding balance.
    const totalsRow = await pool.query(
      `SELECT
         COALESCE(SUM(amount_paid), 0)::numeric AS lifetime_paid,
         COALESCE(SUM(amount_due), 0)::numeric AS outstanding_balance,
         COUNT(*) FILTER (WHERE status = 'paid') AS paid_invoice_count
       FROM invoices WHERE LOWER(customer_email) = LOWER($1)`,
      [customer.email]
    );
    const totals = totalsRow.rows[0] || { lifetime_paid: 0, outstanding_balance: 0, paid_invoice_count: 0 };

    res.json({
      ...customer,
      designs: designsResult.rows,
      quotes: quotesResult.rows,
      invoices: invoicesResult.rows,
      totals: {
        lifetime_paid: Number(totals.lifetime_paid),
        outstanding_balance: Number(totals.outstanding_balance),
        paid_invoice_count: Number(totals.paid_invoice_count),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /customer-designs — list real customer artwork only:
//   1. Saved studio designs that actually have elements (skip blanks where the
//      customer opened the studio, picked a product, and saved without doing
//      anything — those rows show up as the customer's name with no design).
//   2. Quote uploads (`design_url` / `mockup_image_url`) — artwork the customer
//      attached when requesting a quote.
// Each row carries a `source` of 'design' | 'quote' so the admin UI can
// render the right action set.
router.get('/customer-designs', async (req, res, next) => {
  try {
    const { search } = req.query;
    const designSearch = [];
    const quoteSearch = [];
    const mockupSearch = [];
    const designParams = [];
    const quoteParams = [];
    const mockupParams = [];

    if (search) {
      designParams.push(`%${search}%`);
      designSearch.push(`(sd.name ILIKE $${designParams.length} OR u.name ILIKE $${designParams.length} OR u.email ILIKE $${designParams.length})`);
      quoteParams.push(`%${search}%`);
      quoteSearch.push(`(q.product_name ILIKE $${quoteParams.length} OR q.customer_name ILIKE $${quoteParams.length} OR q.customer_email ILIKE $${quoteParams.length})`);
      mockupParams.push(`%${search}%`);
      mockupSearch.push(`(m.name ILIKE $${mockupParams.length} OR m.customer_name ILIKE $${mockupParams.length} OR m.customer_email ILIKE $${mockupParams.length})`);
    }

    // Studio designs — only rows where the customer actually placed at least
    // one element with real content (text string or image data). Earlier
    // jsonb_array_length > 0 still let through rows like `[{}]` or rows with
    // placeholder elements where `content` was empty, which rendered as blank
    // tiles titled with the customer's name.
    const designsQ = await pool.query(
      `SELECT
         sd.id, sd.name, sd.product_name, sd.product_ss_id, sd.product_image, sd.color_index,
         sd.elements, sd.canvas_inches, sd.mockup_url, sd.print_url, sd.thumbnail, sd.created_at,
         u.name AS user_name, u.email AS user_email
       FROM saved_designs sd
       JOIN users u ON u.id = sd.user_id
       WHERE sd.elements IS NOT NULL
         AND jsonb_typeof((sd.elements)::jsonb) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements((sd.elements)::jsonb) e
           WHERE COALESCE(e ->> 'content', '') <> ''
         )
         ${designSearch.length ? 'AND ' + designSearch.join(' AND ') : ''}
       ORDER BY sd.created_at DESC`,
      designParams,
    );

    // Quote uploads — anything where the customer attached artwork.
    const quotesQ = await pool.query(
      `SELECT
         q.id, q.product_name, q.design_url, q.mockup_image_url, q.created_at,
         q.customer_name, q.customer_email, q.status
       FROM quotes q
       WHERE (q.design_url IS NOT NULL OR q.mockup_image_url IS NOT NULL)
         ${quoteSearch.length ? 'AND ' + quoteSearch.join(' AND ') : ''}
       ORDER BY q.created_at DESC`,
      quoteParams,
    );

    // Customer Designs — pass through every studio design with non-empty
    // elements. Thumbnail uses print_url (bare graphic) only; fall back to
    // null and let the frontend render the elements client-side onto a
    // transparent canvas. Don't use the canvas-snapshot thumbnail because
    // it includes the product backdrop (= mockup).
    const designRows = designsQ.rows.map((d) => ({
      ...d,
      id: `design-${d.id}`,
      source: 'design',
      source_id: d.id,
      thumbnail: d.print_url || null,
      product_image: null,
      mockup_url: null,
    }));

    const quoteRows = quotesQ.rows
      .filter((q) => !!q.design_url)
      .map((q) => ({
        id: `quote-${q.id}`,
        source: 'quote',
        source_id: q.id,
        name: q.product_name || 'Quote artwork',
        product_name: q.product_name || null,
        product_ss_id: null,
        product_image: null,
        color_index: null,
        elements: [],
        mockup_url: null,
        print_url: q.design_url,
        thumbnail: q.design_url,
        created_at: q.created_at,
        user_name: q.customer_name || null,
        user_email: q.customer_email || null,
        quote_status: q.status,
      }));

    // Mockups table — pre-existing customer artwork rows. Surface their
    // bare graphic (graphic_url), no product image.
    const mockupsQ = await pool.query(
      `SELECT m.id, m.name, m.graphic_url, m.customer_name, m.customer_email,
              m.created_at, m.status
       FROM mockups m
       WHERE m.graphic_url IS NOT NULL
         ${mockupSearch.length ? 'AND ' + mockupSearch.join(' AND ') : ''}
       ORDER BY m.created_at DESC`,
      mockupParams,
    );

    const mockupRows = mockupsQ.rows.map((m) => ({
      id: `mockup-${m.id}`,
      source: 'mockup',
      source_id: m.id,
      name: m.name || 'Mockup graphic',
      product_name: null,
      product_ss_id: null,
      product_image: null,
      color_index: null,
      elements: [],
      mockup_url: null,
      print_url: m.graphic_url,
      thumbnail: m.graphic_url,
      created_at: m.created_at,
      user_name: m.customer_name || null,
      user_email: m.customer_email || null,
      mockup_status: m.status,
    }));

    const merged = [...designRows, ...quoteRows, ...mockupRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    res.json(merged);
  } catch (err) {
    next(err);
  }
});

// PATCH /customer-designs/:id/owner — reassign a saved design to a different
// customer (matched by email). Used when a design saved on a shared account
// or wrong login needs its ownership corrected.
router.patch('/customer-designs/:id/owner', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email required' });
    }
    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) AND role = 'customer'",
      [email.trim()],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No customer with that email' });
    }
    const user = userResult.rows[0];
    const updated = await pool.query(
      'UPDATE saved_designs SET user_id = $1 WHERE id = $2 RETURNING id, user_id',
      [user.id, id],
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Design not found' });
    res.json({ id: updated.rows[0].id, new_owner: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

// GET /studio-mockups — every product+graphic mockup ever generated by a
// customer save in the design studio. Surfaced on the Mockups admin page
// alongside the manual approval-workflow mockups so admins have a single
// place to see "what shirt+graphic combos exist."
router.get('/studio-mockups', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         sd.id, sd.name, sd.product_name, sd.product_ss_id, sd.product_image,
         sd.color_index, sd.elements, sd.mockup_url, sd.thumbnail, sd.created_at,
         u.name AS customer_name, u.email AS customer_email
       FROM saved_designs sd
       JOIN users u ON u.id = sd.user_id
       WHERE sd.mockup_url IS NOT NULL OR sd.thumbnail IS NOT NULL
       ORDER BY sd.created_at DESC
       LIMIT 500`,
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

// ─── Fabric port — admin restore-legacy + audit log ─────────────────────
//
// These endpoints exist because the Fabric (?canvas=fabric) renderer can
// silently overwrite a customer's saved v1 design with a v2 payload, and
// when the soak window catches a hydrator bug we need a way to roll back
// without losing the v2 attempt (it might be partially correct, or there
// might be other admin actions interleaved we'd miss otherwise).
//
//   GET  /admin/designs/:id/legacy-snapshot   — read elements_legacy
//   GET  /admin/designs/:id/audit-log         — read design_audit_log rows
//   POST /admin/designs/:id/restore-legacy    — swap elements ← elements_legacy,
//                                               write before/after to audit log

// GET /designs/:id/legacy-snapshot - Read the archived v1 payload, if any
router.get('/designs/:id/legacy-snapshot', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      `SELECT id, elements_legacy, legacy_archived_at, schema_version
       FROM saved_designs WHERE id = $1`,
      [designId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Design not found' });
    const row = result.rows[0];
    if (!row.elements_legacy) return res.status(404).json({ error: 'No legacy snapshot exists for this design' });
    res.json({
      design_id: row.id,
      legacy_archived_at: row.legacy_archived_at,
      current_schema_version: row.schema_version,
      elements_legacy: row.elements_legacy,
    });
  } catch (err) {
    next(err);
  }
});

// GET /designs/:id/audit-log - Read the audit trail for a design
router.get('/designs/:id/audit-log', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      `SELECT id, design_id, admin_user_id, action, before_payload, after_payload, notes, created_at
       FROM design_audit_log
       WHERE design_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [designId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /designs/:id/restore-legacy - Roll a design back to its archived v1 payload.
// Writes an audit row with before_payload = the v2 we're throwing away,
// after_payload = the v1 we're restoring. The before_payload is the
// critical piece: it's the state we lose visibility into otherwise.
router.post('/designs/:id/restore-legacy', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 1000) : null;

    await client.query('BEGIN');

    const cur = await client.query(
      `SELECT id, elements, elements_legacy, schema_version
       FROM saved_designs WHERE id = $1 FOR UPDATE`,
      [designId]
    );
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Design not found' });
    }
    const row = cur.rows[0];
    if (!row.elements_legacy) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No legacy snapshot exists for this design' });
    }

    // The current `elements` is what we're about to throw away. Capture it
    // in before_payload before the UPDATE so we don't lose it forever.
    await client.query(
      `INSERT INTO design_audit_log
        (design_id, admin_user_id, action, before_payload, after_payload, notes)
       VALUES ($1, $2, 'restore-legacy', $3, $4, $5)`,
      [
        designId,
        req.user?.id ?? null,
        JSON.stringify(row.elements),
        JSON.stringify(row.elements_legacy),
        notes,
      ]
    );

    // Restore. Note: we deliberately leave elements_legacy in place — the
    // 90-day cleanup job is what removes it. A re-restore is therefore
    // idempotent (same legacy payload restored a second time) and audit
    // history accumulates one row per restore call.
    const updated = await client.query(
      `UPDATE saved_designs SET
        elements = $1,
        schema_version = 1,
        updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, schema_version, updated_at`,
      [JSON.stringify(row.elements_legacy), designId]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
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

// ── Customer private asset library ───────────────────────────────────────────
// Admin-managed graphics scoped to a single customer. GET /customers/:id/assets
// and POST/DELETE are admin-only (this router already has that middleware).

function getCustomerAssetS3() {
  return new S3Client({
    endpoint: `https://${process.env.SPACES_REGION || 'atl1'}.digitaloceanspaces.com`,
    region: process.env.SPACES_REGION || 'atl1',
    credentials: {
      accessKeyId: process.env.SPACES_KEY,
      secretAccessKey: process.env.SPACES_SECRET,
    },
  });
}

// GET /customers/:id/assets - list assets for this customer
router.get('/customers/:id/assets', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_assets WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /customers/:id/assets - upload a graphic for this customer
// Body: { name, imageBase64, filename?, file_type?, notes? }
router.post('/customers/:id/assets', express.json({ limit: '25mb' }), async (req, res, next) => {
  try {
    const { name, imageBase64, filename, file_type, notes } = req.body;
    if (!name || !imageBase64) {
      return res.status(400).json({ error: 'name and imageBase64 are required' });
    }

    // Make sure customer exists
    const u = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'customer'", [req.params.id]);
    if (u.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

    // Upload to Spaces under a per-customer prefix
    const base64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const detected = /^data:([^;]+);/.exec(imageBase64);
    const contentType = (detected && detected[1]) || file_type || 'image/png';
    const safeName = (filename || 'asset').replace(/[^a-zA-Z0-9.\-]/g, '-');
    const rand = crypto.randomBytes(4).toString('hex');
    const key = `customer-assets/${req.params.id}/${Date.now()}-${rand}-${safeName}`;

    const s3 = getCustomerAssetS3();
    const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      ACL: 'public-read',
    }));
    const region = process.env.SPACES_REGION || 'atl1';
    const url = `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`;

    const { rows } = await pool.query(
      `INSERT INTO customer_assets (user_id, name, image_url, file_type, size_bytes, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, name, url, contentType, buf.length, notes || null, req.user?.id || null],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /customer-assets/:assetId - delete a single asset
router.delete('/customer-assets/:assetId', async (req, res, next) => {
  try {
    const r = await pool.query(
      'DELETE FROM customer_assets WHERE id = $1 RETURNING id',
      [req.params.assetId],
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /customer-assets/:assetId/move-to-library
//   Promote a customer's private asset into the shared admin library. The
//   row is moved (deleted from customer_assets, inserted into admin_designs).
router.post('/customer-assets/:assetId/move-to-library', async (req, res, next) => {
  try {
    const { category = 'general', tags = [], description = null } = req.body || {};
    const existing = await pool.query('SELECT * FROM customer_assets WHERE id = $1', [req.params.assetId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    const a = existing.rows[0];
    const inserted = await pool.query(
      `INSERT INTO admin_designs (name, description, image_url, thumbnail_url, category, tags, width, height, file_size, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [a.name, description, a.image_url, a.image_url, category, Array.isArray(tags) ? tags : [], a.width, a.height, a.size_bytes, req.user?.id || null],
    );
    await pool.query('DELETE FROM customer_assets WHERE id = $1', [a.id]);
    res.json({ moved: true, design: inserted.rows[0] });
  } catch (err) { next(err); }
});

// POST /designs-library/:id/move-to-customer
//   Move an admin-library design into a specific customer's private library.
//   Body: { customer_id }
router.post('/designs-library/:id/move-to-customer', async (req, res, next) => {
  try {
    const { customer_id } = req.body || {};
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    const u = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'customer'", [customer_id]);
    if (u.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const existing = await pool.query('SELECT * FROM admin_designs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Design not found' });
    const d = existing.rows[0];
    const inserted = await pool.query(
      `INSERT INTO customer_assets (user_id, name, image_url, file_type, width, height, size_bytes, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [customer_id, d.name, d.image_url, null, d.width, d.height, d.file_size, d.description, req.user?.id || null],
    );
    await pool.query('DELETE FROM admin_designs WHERE id = $1', [d.id]);
    res.json({ moved: true, asset: inserted.rows[0] });
  } catch (err) { next(err); }
});

export default router;
