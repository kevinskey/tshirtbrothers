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
} from '../services/email.js';
import {
  smsNewQuoteToAdmin,
  smsQuotePriceToCustomer,
  smsQuoteAcceptedToAdmin,
  smsStatusUpdateToCustomer,
} from '../services/sms.js';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

// POST /upload-design - Upload a design file for a quote (no auth required)
router.post('/upload-design', express.json({ limit: '20mb' }), async (req, res, next) => {
  try {
    const { imageBase64, filename, customerEmail } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const spacesKey = process.env.SPACES_KEY;
    const spacesSecret = process.env.SPACES_SECRET;
    if (!spacesKey || !spacesSecret) {
      return res.status(500).json({ error: 'File storage not configured' });
    }

    const s3 = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT?.replace('nyc3', process.env.SPACES_REGION || 'atl1') || 'https://atl1.digitaloceanspaces.com',
      region: process.env.SPACES_REGION || 'atl1',
      credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
    });

    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const safeName = (filename || 'design').replace(/[^a-zA-Z0-9.-]/g, '-');
    const timestamp = Date.now();
    const folder = customerEmail ? `quote-designs/${customerEmail.replace(/[^a-zA-Z0-9]/g, '-')}` : 'quote-designs/anonymous';
    const key = `${folder}/${safeName}-${timestamp}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET || 'tshirtbrothers',
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    }));

    const region = process.env.SPACES_REGION || 'atl1';
    const bucket = process.env.SPACES_BUCKET || 'tshirtbrothers';
    const fileUrl = `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`;

    res.json({ url: fileUrl });
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
        (customer_name, customer_email, customer_phone, product_id, product_name, color, sizes, print_areas, design_type, design_url, mockup_image_url, quantity, estimated_price, notes, user_id, shipping_address, date_needed, shipping_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
    const query = `SELECT * FROM quotes ${whereClause} ${orderClause}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
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

    const { basePrice, printingCost, designFee, rushFee, total } = priceBreakdown;

    // Generate an accept token
    const acceptToken = crypto.randomBytes(32).toString('hex');
    const depositAmount = (Number(total) * 0.5).toFixed(2);

    // Update the quote
    const result = await pool.query(
      `UPDATE quotes
       SET estimated_price = $1,
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
        JSON.stringify({ basePrice, printingCost, designFee, rushFee, total }),
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

    res.json(quote);
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
