import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /admin/mockups - list all
router.get('/admin/mockups', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const clauses = [];
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(name ILIKE $${params.length} OR customer_email ILIKE $${params.length} OR customer_name ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM mockups ${where} ORDER BY created_at DESC LIMIT 500`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /admin/mockups/:id - single
router.get('/admin/mockups/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mockups WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /admin/mockups - create
router.post('/admin/mockups', authenticate, adminOnly, async (req, res, next) => {
  try {
    const {
      name,
      customer_id,
      customer_email,
      customer_name,
      quote_id,
      product_id,
      product_name,
      product_image_url,
      graphic_url,
      placement,
      preview_image_url,
      notes,
    } = req.body;

    // If customer_id was given but no email/name, hydrate from users
    let cEmail = customer_email || null;
    let cName = customer_name || null;
    if (customer_id && (!cEmail || !cName)) {
      const u = await pool.query('SELECT email, name FROM users WHERE id = $1', [customer_id]);
      if (u.rows.length) {
        cEmail = cEmail || u.rows[0].email;
        cName = cName || u.rows[0].name;
      }
    }
    // If product_id was given but no name/image, hydrate from products
    let pName = product_name || null;
    let pImg = product_image_url || null;
    if (product_id && (!pName || !pImg)) {
      const p = await pool.query('SELECT name, image_url FROM products WHERE id = $1', [product_id]);
      if (p.rows.length) {
        pName = pName || p.rows[0].name;
        pImg = pImg || p.rows[0].image_url;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO mockups
         (name, customer_id, customer_email, customer_name, quote_id,
          product_id, product_name, product_image_url, graphic_url,
          placement, preview_image_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        name || 'Untitled Mockup',
        customer_id || null,
        cEmail,
        cName,
        quote_id || null,
        product_id || null,
        pName,
        pImg,
        graphic_url || null,
        placement ? JSON.stringify(placement) : null,
        preview_image_url || null,
        notes || null,
      ],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /admin/mockups/:id
router.patch('/admin/mockups/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const fields = req.body || {};
    const set = [];
    const params = [];
    const allow = ['name', 'status', 'graphic_url', 'product_id', 'product_name', 'product_image_url', 'placement', 'preview_image_url', 'notes', 'customer_id', 'customer_email', 'customer_name', 'quote_id'];
    for (const k of allow) {
      if (k in fields) {
        params.push(k === 'placement' && fields[k] && typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k]);
        set.push(`${k} = $${params.length}`);
      }
    }
    if (set.length === 0) return res.status(400).json({ error: 'no fields to update' });
    set.push('updated_at = NOW()');
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE mockups SET ${set.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /admin/mockups/:id/send - email the customer an approval link
router.post('/admin/mockups/:id/send', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mockups WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const m = rows[0];
    if (!m.customer_email) return res.status(400).json({ error: 'Mockup has no customer_email' });

    const token = m.approve_token || crypto.randomBytes(16).toString('hex');
    const updated = await pool.query(
      `UPDATE mockups SET approve_token = $1, status = 'sent', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [token, req.params.id],
    );

    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const approveUrl = `${domain}/mockup/${token}`;

    // Fire-and-forget email. Uses the Resend client already configured in services/email.js.
    try {
      const { sendMockupForApproval } = await import('../services/email.js');
      if (typeof sendMockupForApproval === 'function') {
        await sendMockupForApproval(updated.rows[0], approveUrl);
      }
    } catch (err) {
      console.error('[mockup send] email failed:', err.message);
      // Non-fatal: the admin can copy the link manually.
    }

    res.json({ ...updated.rows[0], approve_url: approveUrl });
  } catch (err) { next(err); }
});

// POST /admin/mockups/:id/convert-to-quote
router.post('/admin/mockups/:id/convert-to-quote', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { quantity = 1, print_areas = [], color = null, sizes = {} } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM mockups WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const m = rows[0];

    const { rows: qRows } = await pool.query(
      `INSERT INTO quotes (
         customer_name, customer_email, customer_phone, product_id, product_name,
         color, sizes, print_areas, design_type, design_url, quantity, status, user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12)
       RETURNING *`,
      [
        m.customer_name || 'Unknown',
        m.customer_email || '',
        null,
        m.product_id,
        m.product_name,
        color,
        JSON.stringify(sizes),
        JSON.stringify(print_areas),
        'upload',
        m.graphic_url,
        Math.max(1, parseInt(quantity, 10) || 1),
        m.customer_id,
      ],
    );

    await pool.query(
      `UPDATE mockups SET quote_id = $1, status = 'converted_to_quote', updated_at = NOW() WHERE id = $2`,
      [qRows[0].id, m.id],
    );

    res.json({ mockup_id: m.id, quote: qRows[0] });
  } catch (err) { next(err); }
});

// DELETE /admin/mockups/:id
router.delete('/admin/mockups/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const r = await pool.query('DELETE FROM mockups WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Customer-facing approval (no auth) ───────────────────────────────────────

// GET /mockup/:token - public; used by the email link + approval page
router.get('/mockup/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mockups WHERE approve_token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ error: 'Mockup not found' });
    // Don't leak internal fields
    const m = rows[0];
    res.json({
      id: m.id,
      name: m.name,
      status: m.status,
      customer_name: m.customer_name,
      product_name: m.product_name,
      product_image_url: m.product_image_url,
      graphic_url: m.graphic_url,
      placement: m.placement,
      preview_image_url: m.preview_image_url,
      notes: m.notes,
      created_at: m.created_at,
    });
  } catch (err) { next(err); }
});

// POST /mockup/:token/respond - customer clicks approve / reject
router.post('/mockup/:token/respond', async (req, res, next) => {
  try {
    const { action, note } = req.body || {};
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approved" or "rejected"' });
    }
    const { rows } = await pool.query(
      `UPDATE mockups
         SET status = $1,
             notes = COALESCE($2, notes),
             updated_at = NOW()
       WHERE approve_token = $3
       RETURNING *`,
      [action, note || null, req.params.token],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Mockup not found' });
    res.json({ status: rows[0].status });
  } catch (err) { next(err); }
});

export default router;
