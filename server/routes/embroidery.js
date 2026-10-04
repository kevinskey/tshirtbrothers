import express, { Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { priceEmbroidery, DIGITIZATION_FEE_CENTS, RUSH_LEVELS } from '../lib/embroideryPricing.js';

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


// ── Customer-facing quote requests ──────────────────────────────────────────
//
// The public path (Kevin, 2026-10-03): upload artwork, say the size and
// placement, pick a garment from us or bring your own — and then the gate:
// we cannot quote embroidery until the art is digitized, and digitization is
// a $25 fee. After payment the shop digitizes, learns the stitch count, and
// replies with the quote: stitches x rate + the garment.

const PLACEMENTS = new Set(['left_chest', 'right_chest', 'full_back', 'hat_front', 'sleeve', 'other']);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

// POST /embroidery/requests — public. Creates the request and returns a
// Stripe Checkout URL for the $25 digitization fee. Nothing is quoted and
// nobody is emailed until that payment lands (webhook in routes/payments.js).
router.post('/embroidery/requests', express.json({ limit: '25mb' }), async (req, res, next) => {
  try {
    const {
      name, email, phone,
      imageBase64, filename,
      desiredSize, placement, placementNote,
      garmentMode, garmentChoice, notes, quantity,
      items: rawItems,
    } = req.body;

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) return res.status(400).json({ error: 'a valid email is required' });
    if (!imageBase64) return res.status(400).json({ error: 'artwork is required' });
    // Same guard as /quotes/upload-design: a URL here decodes to a garbage
    // blob stored as a broken "image".
    if (/^https?:\/\//i.test(String(imageBase64).trim())) {
      return res.status(400).json({ error: 'send the file contents, not a URL' });
    }
    if (garmentMode !== 'tsb' && garmentMode !== 'own') return res.status(400).json({ error: 'garmentMode must be tsb or own' });
    const hasItems = Array.isArray(rawItems) && rawItems.length > 0;
    if (!hasItems) {
      if (!desiredSize || !String(desiredSize).trim()) return res.status(400).json({ error: 'desiredSize is required' });
      if (!PLACEMENTS.has(placement)) return res.status(400).json({ error: 'placement is invalid' });
      if (placement === 'other' && !String(placementNote || '').trim()) {
        return res.status(400).json({ error: 'describe the placement' });
      }
      if (garmentMode === 'tsb' && !String(garmentChoice || '').trim()) {
        return res.status(400).json({ error: 'tell us which garment you want' });
      }
    }
    // Multi-garment: items[] is authoritative when present (one design,
    // several products, each with its own placement/size/qty). The legacy
    // single-value fields are mirrored from the first item so older
    // readers (emails, admin list) keep working.
    let items = null;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      if (rawItems.length > 10) return res.status(400).json({ error: 'ten different products max per request — call us for more' });
      items = [];
      for (const it of rawItems) {
        const iq = parseInt(it.quantity, 10);
        if (!Number.isInteger(iq) || iq < 1 || iq > 999) {
          return res.status(400).json({ error: 'each item quantity must be between 1 and 999' });
        }
        if (!PLACEMENTS.has(it.placement)) return res.status(400).json({ error: 'item placement is invalid' });
        if (it.placement === 'other' && !String(it.placementNote || '').trim()) {
          return res.status(400).json({ error: 'describe the placement for each "somewhere else" item' });
        }
        if (!String(it.desiredSize || '').trim()) return res.status(400).json({ error: 'each item needs a stitch size' });
        if (garmentMode === 'tsb' && !String(it.productName || '').trim()) {
          return res.status(400).json({ error: 'each item needs a product' });
        }
        items.push({
          product_id: it.productId ?? null,
          product_name: String(it.productName || '').trim() || null,
          style_number: String(it.styleNumber || '').trim() || null,
          image_url: String(it.imageUrl || '').trim() || null,
          placement: it.placement,
          placement_note: String(it.placementNote || '').trim() || null,
          desired_size: String(it.desiredSize).trim(),
          quantity: iq,
        });
      }
    }

    const qty = items
      ? items.reduce((s2, it) => s2 + it.quantity, 0)
      : parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      return res.status(400).json({ error: 'total quantity must be between 1 and 999 (call us for more)' });
    }

    const first = items ? items[0] : null;
    const effSize = first ? first.desired_size : String(desiredSize || '').trim();
    const effPlacement = first ? first.placement : placement;
    const effPlacementNote = first ? first.placement_note : (placementNote || null);
    const effGarmentChoice = items && garmentMode === 'tsb'
      ? items.map((it) => `${it.product_name}${it.style_number ? ' (' + it.style_number + ')' : ''} × ${it.quantity}`).join('; ')
      : (garmentChoice || null);

    const base64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (buf.length < 100) return res.status(400).json({ error: 'artwork file looks empty' });
    const safeName = (filename || 'artwork.png').replace(/[^a-zA-Z0-9.\-]/g, '-');
    const rand = crypto.randomBytes(4).toString('hex');
    const key = `embroidery/requests/${Date.now()}-${rand}-${safeName}`;
    const artworkUrl = await uploadToSpaces(buf, key, 'image/png');

    const accessToken = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO embroidery_requests
         (customer_name, customer_email, customer_phone, artwork_url,
          desired_size, placement, placement_note,
          garment_mode, garment_choice, notes, quantity, items, access_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [String(name).trim(), emailNorm, phone || null, artworkUrl,
       effSize, effPlacement, effPlacementNote,
       garmentMode, effGarmentChoice, notes || null, qty,
       items ? JSON.stringify(items) : null, accessToken]
    );
    const request = rows[0];

    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: emailNorm,
      submit_type: 'pay',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: DIGITIZATION_FEE_CENTS,
          product_data: {
            name: 'Embroidery Digitization — $25',
            description: `Request #${request.id} · One-time setup: we convert your artwork into a stitch file. Your quote follows once it's done.`,
            images: [artworkUrl],
          },
        },
        quantity: 1,
      }],
      custom_text: {
        submit: {
          message: 'Digitization is how embroidery gets priced — once your art is converted to stitches we know the stitch count, and your quote lands in your inbox. — TShirt Brothers',
        },
      },
      payment_intent_data: {
        description: `TShirt Brothers — embroidery digitization, Request #${request.id}`,
      },
      // metadata.embroideryRequestId is what the webhook in routes/payments.js
      // dispatches on — same pattern as quoteId / gang_sheet_order_id.
      metadata: { embroideryRequestId: String(request.id) },
      success_url: `${domain}/embroidery/thanks/${request.id}?t=${accessToken}`,
      cancel_url: `${domain}/embroidery`,
    });

    await pool.query(
      'UPDATE embroidery_requests SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2',
      [session.id, request.id]
    );

    res.json({ id: request.id, token: accessToken, checkoutUrl: session.url });
  } catch (err) { next(err); }
});

// GET /embroidery/requests/:id/status — public, token-gated. Powers the
// thanks/status page; exposes only what the customer already knows plus
// where their request stands.
router.get('/embroidery/requests/:id/status', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM embroidery_requests WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    // timingSafeEqual needs equal lengths; length mismatch is just a miss.
    const supplied = String(req.query.t || '');
    const ok = supplied.length === r.access_token.length
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(r.access_token));
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: r.id,
      status: r.status,
      placement: r.placement,
      desired_size: r.desired_size,
      garment_mode: r.garment_mode,
      garment_choice: r.garment_choice,
      digitization_paid_at: r.digitization_paid_at,
      stitch_count: r.stitch_count,
      quote_cents: r.quote_cents,
      quoted_at: r.quoted_at,
    });
  } catch (err) { next(err); }
});

// GET /embroidery/requests — admin list.
router.get('/embroidery/requests', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status && status !== 'all') { params.push(status); where = 'WHERE status = $1'; }
    const { rows } = await pool.query(
      `SELECT * FROM embroidery_requests ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /embroidery/requests/:id/quote — admin. Prices via the Lighthouse
// engine (lib/embroideryPricing.js): vendor cost x house markup, every
// surcharge from the sheet, rush multipliers, and the $25 digitization
// deposit settled against the formula. { dryRun: true } returns the
// breakdown without saving or emailing — the admin panel previews with it.
router.post('/embroidery/requests/:id/quote', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM embroidery_requests WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    // The whole point of the flow: no quote before the $25 clears.
    if (!r.digitization_paid_at) {
      return res.status(409).json({ error: 'Digitization fee has not been paid — cannot quote yet' });
    }

    const garmentPerPiece = Number(req.body.garmentCentsPerPiece ?? 0);
    if (!Number.isInteger(garmentPerPiece) || garmentPerPiece < 0) {
      return res.status(400).json({ error: 'garmentCentsPerPiece must be a non-negative integer' });
    }
    if (r.garment_mode === 'own' && garmentPerPiece !== 0) {
      return res.status(400).json({ error: 'customer is supplying their own garment; garment price must be 0' });
    }

    const garments = Array.isArray(req.body.garments) ? req.body.garments : undefined;
    if (r.garment_mode === 'own' && garments?.some((g) => Number(g.centsPerPiece) > 0)) {
      return res.status(400).json({ error: 'customer is supplying their own garments; garment prices must be 0' });
    }
    const priced = priceEmbroidery({
      stitchCount: Number(req.body.stitchCount),
      quantity: Number(req.body.quantity ?? r.quantity ?? 1),
      garments,
      garmentCentsPerPiece: garmentPerPiece,
      isCap: !!req.body.isCap,
      capBack: !!req.body.capBack,
      letteringLines: Number(req.body.letteringLines) || 0,
      personalizations: Array.isArray(req.body.personalizations) ? req.body.personalizations : [],
      rush: req.body.rush || 'standard',
    });
    if (priced.error) return res.status(400).json({ error: priced.error });

    if (req.body.dryRun) return res.json({ dryRun: true, ...priced });

    // Multiple products = multiple garment lines; sum them all.
    const garmentTotal = priced.lines.filter((l) => l.key === 'garment').reduce((t, l) => t + l.retailCents, 0);
    const updated = await pool.query(
      `UPDATE embroidery_requests SET
         stitch_count = $1, quantity = $2, garment_cents = $3, rush = $4,
         cost_cents = $5, price_breakdown = $6, quote_cents = $7,
         status = 'quoted', quoted_at = NOW(), updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [Number(req.body.stitchCount), Number(req.body.quantity ?? r.quantity ?? 1),
       garmentTotal, req.body.rush || 'standard',
       priced.costCents, JSON.stringify(priced.lines), priced.totalCents, req.params.id]
    );

    // Email is the reply channel; a failed send should not lose the saved
    // quote, so it is fire-and-logged rather than awaited into the response.
    import('../services/email.js')
      .then(({ sendEmbroideryQuoteToCustomer }) => sendEmbroideryQuoteToCustomer({ request: updated.rows[0] }))
      .catch((e) => console.error('[embroidery] quote email failed:', e.message));

    res.json(updated.rows[0]);
  } catch (err) { next(err); }
});

// GET /embroidery/rush-levels — admin helper so the panel's dropdown and the
// server agree on exactly one list.
router.get('/embroidery/rush-levels', authenticate, adminOnly, (_req, res) => {
  res.json(Object.entries(RUSH_LEVELS).map(([key, v]) => ({ key, ...v })));
});

export default router;
