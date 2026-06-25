import express, { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  sendQuoteRequestNotification,
  sendQuotePriceToCustomer,
  sendQuoteAcceptedNotification,
  sendQuoteStatusUpdate,
  sendBalanceDueToCustomer,
  sendQuoteUpdatedToCustomer,
  sendReviewRequestEmail,
} from '../services/email.js';
import {
  smsNewQuoteToAdmin,
  smsQuotePriceToCustomer,
  smsQuoteAcceptedToAdmin,
  smsStatusUpdateToCustomer,
  smsReviewRequest,
} from '../services/sms.js';

import { uploadObject } from '../services/spaces.js';

const router = Router();

// POST /upload-design - Upload a design file for a quote (no auth required)
router.post('/upload-design', express.json({ limit: '20mb' }), async (req, res, next) => {
  try {
    const { imageBase64, filename, customerEmail } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) {
      return res.status(500).json({ error: 'File storage not configured' });
    }

    const safeName = (filename || 'design').replace(/[^a-zA-Z0-9.-]/g, '-');
    const folder = customerEmail
      ? `quote-designs/${customerEmail.replace(/[^a-zA-Z0-9]/g, '-')}`
      : 'quote-designs/anonymous';
    const key = `${folder}/${safeName}-${Date.now()}.png`;

    const url = await uploadObject({ key, body: imageBase64 });
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// POST / - Create a new quote (no auth required)
router.post('/', async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      product_id,
      product_name,
      color,
      sizes,
      print_areas,
      design_type,
      design_url,
      extra_design_urls,
      mockup_image_url,
      quantity,
      estimated_price,
      notes,
      shipping_address,
      date_needed,
      shipping_method,
    } = req.body;

    if (!customer_name || !customer_email || !quantity) {
      return res.status(400).json({
        error: 'customer_name, customer_email, and quantity are required',
      });
    }

    // Optionally extract user_id from token if customer is logged in
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(
          authHeader.split(' ')[1],
          process.env.JWT_SECRET
        );
        userId = decoded.id || decoded.userId || null;
      } catch {
        // Token invalid or expired — continue without user_id
      }
    }

    const result = await pool.query(
      `INSERT INTO quotes
        (customer_name, customer_email, customer_phone, product_id, product_name, color, sizes, print_areas, design_type, design_url, extra_design_urls, mockup_image_url, quantity, estimated_price, notes, user_id, shipping_address, date_needed, shipping_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        customer_name,
        customer_email,
        customer_phone || null,
        product_id || null,
        product_name || null,
        color || null,
        JSON.stringify(sizes || []),
        JSON.stringify(print_areas || []),
        design_type || null,
        design_url || null,
        JSON.stringify(Array.isArray(extra_design_urls) ? extra_design_urls : []),
        mockup_image_url || null,
        quantity,
        estimated_price || null,
        notes || null,
        userId,
        shipping_address ? JSON.stringify(shipping_address) : null,
        date_needed || null,
        shipping_method || 'pickup',
      ]
    );

    const quote = result.rows[0];

    // Fire-and-forget: notify admin of new quote
    sendQuoteRequestNotification(quote).catch(() => {});
    smsNewQuoteToAdmin(quote).catch(() => {});

    // Fire-and-forget: auto-triage the quote with AI
    (async () => {
      try {
        const quoteText = `Product: ${quote.product_name || 'not specified'}. Quantity: ${quote.quantity}. Customer: ${quote.customer_name}. Notes: ${quote.notes || 'none'}. Date needed: ${quote.date_needed || 'not specified'}. Shipping: ${quote.shipping_method || 'pickup'}.`;
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
        const result = await client.chat.completions.create({
          model: 'deepseek-chat',
          temperature: 0.2,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Classify this quote request. Output JSON: {"urgency":"low"|"medium"|"high"|"rush","complexity":"simple"|"moderate"|"complex","estimated_hours":number,"summary":"one sentence"}. RUSH=under 7 days. HIGH=under 14 days or 100+ qty. COMPLEX=custom design, multi-location, special fabric.' },
            { role: 'user', content: quoteText },
          ],
        });
        const triage = result.choices?.[0]?.message?.content;
        if (triage) {
          await pool.query('UPDATE quotes SET triage = $1 WHERE id = $2', [triage, quote.id]);
          console.log('[Triage] Quote #' + quote.id + ' classified:', triage.slice(0, 80));
        }
      } catch (err) {
        console.error('[Triage] failed for quote #' + quote.id + ':', err.message);
      }
    })();

    res.status(201).json(quote);
  } catch (err) {
    next(err);
  }
});

// GET / - List all quotes (admin only)
// Shared aggregation: attach an ordered `items` array to each quote row by
// pulling rows from quote_items via a lateral subquery. Returned as `[]`
// when a quote has no items (shouldn't happen post-backfill, but defensive).
const QUOTE_ITEMS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object(
      'id',           qi.id,
      'position',     qi.position,
      'product_id',   qi.product_id,
      'product_name', qi.product_name,
      'color',        qi.color,
      'sizes',        qi.sizes,
      'quantity',     qi.quantity,
      'print_areas',  qi.print_areas,
      'design_url',   qi.design_url,
      'unit_price',   qi.unit_price,
      'line_total',   qi.line_total,
      'notes',        qi.notes
    ) ORDER BY qi.position, qi.id)
    FROM quote_items qi
    WHERE qi.quote_id = quotes.id
  ), '[]'::json) AS items
`;

router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, search, sort } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(customer_name ILIKE $${params.length} OR customer_email ILIKE $${params.length} OR product_name ILIKE $${params.length})`);
    }

    let orderClause = 'ORDER BY created_at DESC';
    if (sort === 'date_needed') {
      orderClause = 'ORDER BY date_needed ASC NULLS LAST, created_at DESC';
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT quotes.*, ${QUOTE_ITEMS_SUBQUERY} FROM quotes ${whereClause} ${orderClause}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id — single quote with items. Admin-only.
// Public summary for the customer-facing payment-choice page. Requires
// the accept_token from the original email so we don't leak quote data
// to anyone who guesses the numeric id. Returns ONLY the fields the
// payment screen needs — not the admin payload.
router.get('/:id/public', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'token is required' });
    const result = await pool.query(
      `SELECT id, customer_name, product_name, estimated_price, deposit_amount,
              balance_paid_at, status, accept_token
       FROM quotes WHERE id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    const q = result.rows[0];
    if (!q.accept_token || q.accept_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    // Don't echo the token back.
    const { accept_token: _t, ...safe } = q;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT quotes.*, ${QUOTE_ITEMS_SUBQUERY} FROM quotes WHERE id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Line items CRUD ────────────────────────────────────────────────
// All admin-only. Items are rendered against the quote on every read via
// QUOTE_ITEMS_SUBQUERY above, so these routes only need to mutate.

// Helper: total quantity from a sizes array of {size, quantity}.
function totalQtyFromSizes(sizes) {
  if (!Array.isArray(sizes)) return 0;
  return sizes.reduce((n, s) => n + (Number(s?.quantity) || 0), 0);
}

// Helper: compute line_total when not explicitly given.
function deriveLineTotal({ unit_price, quantity, line_total }) {
  if (line_total != null && line_total !== '') return Number(line_total);
  const u = Number(unit_price);
  const q = Number(quantity);
  if (Number.isFinite(u) && Number.isFinite(q)) return Math.round(u * q * 100) / 100;
  return null;
}

// After any items mutation, mirror the items' aggregates onto the legacy
// quotes columns (estimated_price, quantity, product_id, product_name) so
// every read path that still uses those columns — price email, customer
// accept page, invoice generation, the Send Price modal's header summary —
// reflects whatever the admin shaped the quote into. The "first" item by
// position drives the single-row product fields; SUMs cover the totals.
async function rebuildQuoteTotals(quoteId, client = pool) {
  await client.query(
    `UPDATE quotes q
       SET estimated_price = COALESCE((
             SELECT SUM(line_total) FROM quote_items WHERE quote_id = $1
           ), q.estimated_price),
           quantity = COALESCE((
             SELECT SUM(quantity) FROM quote_items WHERE quote_id = $1
           ), q.quantity),
           product_id = COALESCE((
             SELECT product_id FROM quote_items
               WHERE quote_id = $1
               ORDER BY position, id LIMIT 1
           ), q.product_id),
           product_name = COALESCE((
             SELECT product_name FROM quote_items
               WHERE quote_id = $1
               ORDER BY position, id LIMIT 1
           ), q.product_name)
     WHERE q.id = $1`,
    [quoteId],
  );
}

// POST /:id/items — add a line item.
router.post('/:id/items', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      product_id   = null,
      product_name = null,
      color        = null,
      sizes        = [],
      quantity, // optional — derived from sizes if absent
      print_areas  = [],
      design_url   = null,
      unit_price   = null,
      line_total,
      notes        = null,
      position,
    } = req.body || {};

    const exists = await pool.query('SELECT 1 FROM quotes WHERE id = $1', [id]);
    if (exists.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });

    const qty = Number.isFinite(Number(quantity)) ? Number(quantity) : totalQtyFromSizes(sizes);
    const lt  = deriveLineTotal({ unit_price, quantity: qty, line_total });

    // Default position: append after current last.
    const posRes = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM quote_items WHERE quote_id = $1',
      [id],
    );
    const pos = Number.isFinite(Number(position)) ? Number(position) : posRes.rows[0].next;

    const inserted = await pool.query(
      `INSERT INTO quote_items
         (quote_id, position, product_id, product_name, color, sizes, quantity,
          print_areas, design_url, unit_price, line_total, notes)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12)
       RETURNING *`,
      [id, pos, product_id, product_name, color, JSON.stringify(sizes),
       qty, JSON.stringify(print_areas), design_url, unit_price, lt, notes],
    );

    await rebuildQuoteTotals(id);
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/items/:itemId — update a line item. Whitelisted fields only.
router.patch('/:id/items/:itemId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id, itemId } = req.params;

    const allowed = ['product_id', 'product_name', 'color', 'sizes', 'quantity',
                     'print_areas', 'design_url', 'unit_price', 'line_total',
                     'notes', 'position'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (!(key in (req.body || {}))) continue;
      params.push(['sizes', 'print_areas'].includes(key)
        ? JSON.stringify(req.body[key] ?? [])
        : req.body[key]);
      sets.push(`${key} = $${params.length}${['sizes','print_areas'].includes(key) ? '::jsonb' : ''}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No editable fields supplied' });

    sets.push(`updated_at = NOW()`);
    params.push(itemId, id);

    const result = await pool.query(
      `UPDATE quote_items SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND quote_id = $${params.length}
        RETURNING *`,
      params,
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });

    // If qty or unit_price changed and line_total wasn't explicitly set, recompute it.
    const row = result.rows[0];
    if ('line_total' in (req.body || {}) === false &&
        ('unit_price' in (req.body || {}) || 'quantity' in (req.body || {}) || 'sizes' in (req.body || {}))) {
      const qty = Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0
        ? Number(row.quantity)
        : totalQtyFromSizes(row.sizes);
      const lt = deriveLineTotal({ unit_price: row.unit_price, quantity: qty, line_total: null });
      if (lt != null) {
        await pool.query('UPDATE quote_items SET quantity = $1, line_total = $2 WHERE id = $3',
          [qty, lt, itemId]);
      }
    }

    await rebuildQuoteTotals(id);
    const fresh = await pool.query('SELECT * FROM quote_items WHERE id = $1', [itemId]);
    res.json(fresh.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const result = await pool.query(
      'DELETE FROM quote_items WHERE id = $1 AND quote_id = $2 RETURNING id',
      [itemId, id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    await rebuildQuoteTotals(id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// PUT /:id/items — replace the whole items list in one go. Easier for the
// admin edit modal: the client sends the full desired array and we diff.
router.put('/:id/items', authenticate, adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: 'items array required' });

    const exists = await client.query('SELECT 1 FROM quotes WHERE id = $1', [id]);
    if (exists.rowCount === 0) return res.status(404).json({ error: 'Quote not found' });

    await client.query('BEGIN');
    await client.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const qty = Number.isFinite(Number(it.quantity)) ? Number(it.quantity)
                : totalQtyFromSizes(it.sizes);
      const lt = deriveLineTotal({ unit_price: it.unit_price, quantity: qty, line_total: it.line_total });
      await client.query(
        `INSERT INTO quote_items
           (quote_id, position, product_id, product_name, color, sizes, quantity,
            print_areas, design_url, unit_price, line_total, notes)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12)`,
        [id, i, it.product_id ?? null, it.product_name ?? null, it.color ?? null,
         JSON.stringify(it.sizes ?? []), qty,
         JSON.stringify(it.print_areas ?? []), it.design_url ?? null,
         it.unit_price ?? null, lt, it.notes ?? null],
      );
    }
    await rebuildQuoteTotals(id, client);
    await client.query('COMMIT');

    const fresh = await pool.query(
      `SELECT quotes.*, ${QUOTE_ITEMS_SUBQUERY} FROM quotes WHERE id = $1`,
      [id],
    );
    res.json(fresh.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /:id/admin-notes - Update admin private notes
router.patch('/:id/admin-notes', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const result = await pool.query(
      'UPDATE quotes SET admin_notes = $1 WHERE id = $2 RETURNING id, admin_notes',
      [admin_notes || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /admin/send-price - Admin sends a price quote to the customer
router.post('/admin/send-price', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { quoteId, priceBreakdown, message } = req.body;

    console.log('[send-price] Received:', JSON.stringify({ quoteId, hasBreakdown: !!priceBreakdown, total: priceBreakdown?.total }));
    if (!quoteId || !priceBreakdown || priceBreakdown.total === undefined) {
      return res.status(400).json({
        error: 'quoteId and priceBreakdown (with total) are required',
      });
    }

    const { basePrice, printingCost, designFee, rushFee, shipping, tax, taxExempt, taxRate, total } = priceBreakdown;

    // Generate an accept token
    const acceptToken = crypto.randomBytes(32).toString('hex');
    const depositAmount = (Number(total) * 0.5).toFixed(2);

    // Update the quote. calculated_price is overwritten here too so the
    // admin-set total replaces the original auto-estimate — otherwise
    // reports and downstream readers can show a stale figure.
    const result = await pool.query(
      `UPDATE quotes
       SET estimated_price = $1,
           calculated_price = $1,
           status = 'quoted',
           accept_token = $2,
           price_breakdown = $3,
           admin_message = $4,
           deposit_amount = $5
       WHERE id = $6
       RETURNING *`,
      [
        total,
        acceptToken,
        JSON.stringify({ basePrice, printingCost, designFee, rushFee, shipping, tax, taxExempt, taxRate, total }),
        message || null,
        depositAmount,
        quoteId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = result.rows[0];

    // Send the price quote email to the customer
    await sendQuotePriceToCustomer(quote, {
      basePrice,
      printingCost,
      designFee,
      rushFee,
      shipping,
      tax,
      taxExempt,
      taxRate,
      total,
      message,
    });
    smsQuotePriceToCustomer(quote, total).catch(() => {});

    res.json({ success: true, quote });
  } catch (err) {
    next(err);
  }
});

// POST /accept/:id - Redirect customer to payment checkout (deposit required to accept)
router.post('/accept/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Look up the quote and validate the token
    const lookup = await pool.query(
      'SELECT * FROM quotes WHERE id = $1',
      [id]
    );

    if (lookup.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = lookup.rows[0];

    if (quote.accept_token !== token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (quote.status === 'accepted') {
      return res.json({
        success: true,
        message: 'Quote has already been accepted',
        redirectUrl: `${process.env.DOMAIN || 'https://tshirtbrothers.com'}/quote/accepted/${id}`,
      });
    }

    // Redirect to payment checkout — 50% deposit is required to accept
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    res.json({
      success: true,
      message: 'Please pay the 50% deposit to accept this quote',
      redirectUrl: `${domain}/payment/checkout?quote=${id}&token=${token}`,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /:id - Update quote status (admin only)
router.patch('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'reviewed', 'quoted', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    let query, params;
    if (notes !== undefined) {
      query = 'UPDATE quotes SET status = $1, notes = $2 WHERE id = $3 RETURNING *';
      params = [status, notes, id];
    } else {
      query = 'UPDATE quotes SET status = $1 WHERE id = $2 RETURNING *';
      params = [status, id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = result.rows[0];

    // Fire-and-forget: send status update email to customer
    if (['approved', 'completed', 'rejected'].includes(status)) {
      sendQuoteStatusUpdate(quote, status).catch(() => {});
      smsStatusUpdateToCustomer(quote, status).catch(() => {});
    }

    // Auto review request — fires once per quote when the order is
    // completed. Dedupe via review_request_sent_at: an admin who flips
    // status to completed again (e.g. fixing a typo) won't re-send.
    if (status === 'completed' && !quote.review_request_sent_at) {
      (async () => {
        try {
          await Promise.all([
            sendReviewRequestEmail(quote).catch(() => {}),
            smsReviewRequest(quote).catch(() => {}),
          ]);
          await pool.query(
            'UPDATE quotes SET review_request_sent_at = NOW() WHERE id = $1',
            [quote.id],
          );
        } catch (err) {
          console.error('[review-request] failed:', err.message);
        }
      })();
    }

    res.json(quote);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/:id/design-url — replace the artwork file on a quote.
// Used by the "Fix in Art Library" workflow: admin opens a customer's
// uploaded graphic in DesignWorkspace, vectorizes / removes BG / cleans
// it up, then saves the cleaned version back to the quote.
router.patch('/admin/:id/design-url', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { design_url } = req.body;
    if (!design_url || typeof design_url !== 'string') {
      return res.status(400).json({ error: 'design_url is required' });
    }
    const result = await pool.query(
      'UPDATE quotes SET design_url = $1 WHERE id = $2 RETURNING id, design_url',
      [design_url, id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/:id/mockup — attach a Mockup Studio mockup to a quote so it
// shows up wherever the quote design preview is rendered. Body accepts either
// a raw mockup_image_url or a mockup_id (or both). When mockup_id is given
// we mirror the link onto the mockups row so the relationship is queryable
// from either side.
router.patch('/admin/:id/mockup', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mockup_image_url, mockup_image_url_back, mockup_id } = req.body || {};
    let urlFront = typeof mockup_image_url === 'string' && mockup_image_url ? mockup_image_url : null;
    let urlBack = typeof mockup_image_url_back === 'string' && mockup_image_url_back ? mockup_image_url_back : null;
    if (mockup_id && (urlFront == null || urlBack == null)) {
      const m = await pool.query(
        'SELECT preview_image_url, preview_image_url_back FROM mockups WHERE id = $1',
        [mockup_id],
      );
      if (m.rows.length === 0) return res.status(404).json({ error: 'Mockup not found' });
      if (urlFront == null) urlFront = m.rows[0].preview_image_url;
      if (urlBack == null) urlBack = m.rows[0].preview_image_url_back;
    }
    if (!urlFront) return res.status(400).json({ error: 'mockup_image_url or mockup_id is required' });

    const result = await pool.query(
      'UPDATE quotes SET mockup_image_url = $1, mockup_image_url_back = $2 WHERE id = $3 RETURNING *',
      [urlFront, urlBack, id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    if (mockup_id) {
      await pool.query('UPDATE mockups SET quote_id = $1 WHERE id = $2', [id, mockup_id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/:id/artwork — strip the customer-uploaded artwork from a
// quote without touching anything else (line items, status, payments). Used
// when the admin wants to remove a graphic that came in via a quote — e.g.
// it was uploaded to the wrong account or was test data.
router.delete('/admin/:id/artwork', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE quotes SET design_url = NULL, mockup_image_url = NULL WHERE id = $1 RETURNING id',
      [id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /admin/send-balance - Admin sends balance payment request to customer
router.post('/admin/send-balance', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { quoteId } = req.body;
    if (!quoteId) return res.status(400).json({ error: 'quoteId is required' });

    const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    const quote = result.rows[0];

    if (quote.status !== 'accepted') {
      return res.status(400).json({ error: 'Quote must be accepted first' });
    }

    const total = parseFloat(quote.estimated_price || 0);
    const depositPaid = parseFloat(quote.deposit_amount || 0);
    const balanceDue = total - depositPaid;

    if (balanceDue <= 0) {
      return res.status(400).json({ error: 'No balance due — already paid in full' });
    }

    await sendBalanceDueToCustomer(quote, { total, depositPaid, balanceDue });

    res.json({ success: true, balanceDue });
  } catch (err) {
    next(err);
  }
});

// POST /admin/notify-update — email the customer the new total after the
// admin edited the line items. Informational only — doesn't ask for
// payment now; balance is collected when the order's ready to ship.
router.post('/admin/notify-update', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { quoteId, message } = req.body || {};
    if (!quoteId) return res.status(400).json({ error: 'quoteId is required' });

    const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    const quote = result.rows[0];

    const total = parseFloat(quote.estimated_price || 0);
    const depositPaid = parseFloat(quote.deposit_amount || 0);
    const balanceDue = Math.max(0, total - depositPaid);

    await sendQuoteUpdatedToCustomer(quote, {
      total,
      depositPaid,
      balanceDue,
      adminNote: typeof message === 'string' && message.trim() ? message.trim() : null,
    });

    res.json({ success: true, total, depositPaid, balanceDue });
  } catch (err) {
    next(err);
  }
});

// POST /admin/calculate-price - Tie quote pricing to gang-sheet placement
//
// Body:
//   product_id        number  quote's product id (uses products.base_price)
//   quantity          number  number of shirts / items in quote
//   graphic_width_in  number  width of the graphic in inches
//   graphic_height_in number  height of the graphic in inches
//   pricing_tier      string  'standard' | 'rush' | 'hotRush' (default standard)
//   setup_fee         number  one-time setup charge (default 0)
//   design_fee        number  graphic design / artwork charge (default 0)
//   shipping          number  shipping charge (default 0; NOT taxed)
//   tax_rate          number  percent applied to taxable subtotal (default 0)
//
// Returns: { breakdown: {...}, total }
router.post('/admin/calculate-price', authenticate, adminOnly, async (req, res, next) => {
  try {
    const {
      product_id,
      quantity,
      graphic_width_in,
      graphic_height_in,
      pricing_tier = 'standard',
      setup_fee = 0,
      design_fee = 0,
      shipping = 0,
      tax_rate = 0,
    } = req.body;

    const qty = Math.max(1, parseInt(quantity, 10) || 0);
    const gw = Math.max(0.5, parseFloat(graphic_width_in) || 0);
    const gh = Math.max(0.5, parseFloat(graphic_height_in) || 0);

    if (!product_id) return res.status(400).json({ error: 'product_id is required' });
    if (!qty) return res.status(400).json({ error: 'quantity must be >= 1' });
    if (!gw || !gh) return res.status(400).json({ error: 'graphic_width_in and graphic_height_in are required' });

    // Product base cost
    const productResult = await pool.query('SELECT id, name, base_price, price_breaks FROM products WHERE id = $1', [product_id]);
    if (productResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = productResult.rows[0];

    // Tiered product pricing: price_breaks is an array of { min_qty, price }.
    // Pick the lowest price whose min_qty the order meets; fall back to base_price.
    let unitPrice = parseFloat(product.base_price || 0);
    const breaks = Array.isArray(product.price_breaks) ? product.price_breaks : [];
    for (const b of breaks) {
      const minQty = parseInt(b.min_qty || b.minQty || b.min || 0, 10);
      const price = parseFloat(b.price || b.unit_price || 0);
      if (minQty && price && qty >= minQty && price < unitPrice) {
        unitPrice = price;
      }
    }
    const productSubtotal = +(unitPrice * qty).toFixed(2);

    // Gang-sheet cost: how many copies of the graphic (+ spacing) fit per foot
    // of a 22" sheet, then feet needed = ceil(qty / perFoot).
    // Mirrors logic in client/src/lib/gangsheet/binPacking.ts.
    const SHEET_WIDTH_IN = 22;
    const SPACING_IN = 0.1;
    const EDGE_PADDING_IN = 0.25;
    const INCHES_PER_FOOT = 12;

    const usableWidthIn = SHEET_WIDTH_IN - 2 * EDGE_PADDING_IN;
    const across = Math.max(1, Math.floor((usableWidthIn + SPACING_IN) / (gw + SPACING_IN)));
    const rowsPerFoot = Math.max(1, Math.floor((INCHES_PER_FOOT + SPACING_IN) / (gh + SPACING_IN)));
    const perFoot = across * rowsPerFoot;
    const feetNeeded = Math.max(1, Math.ceil(qty / perFoot));

    const PRICING = {
      standard: 6.0,
      rush: 8.0,
      hotRush: 12.0,
    };
    const rate = PRICING[pricing_tier] ?? PRICING.standard;
    const gangSheetCost = +(feetNeeded * rate).toFixed(2);
    const isRush = pricing_tier !== 'standard';

    const setupFee = +(Math.max(0, parseFloat(setup_fee) || 0)).toFixed(2);
    const designFee = +(Math.max(0, parseFloat(design_fee) || 0)).toFixed(2);
    const shippingCost = +(Math.max(0, parseFloat(shipping) || 0)).toFixed(2);
    const taxRate = Math.max(0, parseFloat(tax_rate) || 0);

    // Taxable = product + gang-sheet + setup + design.
    // Shipping is NOT taxed (standard practice in most states).
    const taxable = +(productSubtotal + gangSheetCost + setupFee + designFee).toFixed(2);
    const tax = +(taxable * (taxRate / 100)).toFixed(2);

    const total = +(taxable + shippingCost + tax).toFixed(2);

    res.json({
      breakdown: {
        product: {
          name: product.name,
          unit_price: unitPrice,
          quantity: qty,
          subtotal: productSubtotal,
        },
        gang_sheet: {
          graphic_width_in: gw,
          graphic_height_in: gh,
          copies_across: across,
          rows_per_foot: rowsPerFoot,
          copies_per_foot: perFoot,
          feet_needed: feetNeeded,
          pricing_tier,
          is_rush: isRush,
          rate_per_foot: rate,
          subtotal: gangSheetCost,
        },
        setup_fee: setupFee,
        design_fee: designFee,
        shipping: shippingCost,
        taxable_subtotal: taxable,
        tax_rate: taxRate,
        tax,
      },
      total,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - Delete a quote (admin only)
router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM quotes WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
