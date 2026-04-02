import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  sendQuoteRequestNotification,
  sendQuotePriceToCustomer,
  sendQuoteAcceptedNotification,
  sendQuoteStatusUpdate,
} from '../services/email.js';
import {
  smsNewQuoteToAdmin,
  smsQuotePriceToCustomer,
  smsQuoteAcceptedToAdmin,
  smsStatusUpdateToCustomer,
} from '../services/sms.js';

const router = Router();

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
      quantity,
      estimated_price,
      notes,
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
        (customer_name, customer_email, customer_phone, product_id, product_name, color, sizes, print_areas, design_type, design_url, quantity, estimated_price, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        quantity,
        estimated_price || null,
        notes || null,
        userId,
      ]
    );

    const quote = result.rows[0];

    // Fire-and-forget: notify admin of new quote
    sendQuoteRequestNotification(quote).catch(() => {});
    smsNewQuoteToAdmin(quote).catch(() => {});

    res.status(201).json(quote);
  } catch (err) {
    next(err);
  }
});

// GET / - List all quotes (admin only)
router.get('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM quotes';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /admin/send-price - Admin sends a price quote to the customer
router.post('/admin/send-price', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { quoteId, priceBreakdown, message } = req.body;

    if (!quoteId || !priceBreakdown || !priceBreakdown.total) {
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

// POST /accept/:id - Customer accepts a quote (public endpoint, validated by token)
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

    // Update status to accepted
    const result = await pool.query(
      `UPDATE quotes
       SET status = 'accepted',
           accepted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const acceptedQuote = result.rows[0];

    // Notify admin
    sendQuoteAcceptedNotification(acceptedQuote).catch(() => {});
    smsQuoteAcceptedToAdmin(acceptedQuote).catch(() => {});

    res.json({
      success: true,
      message: 'Quote accepted successfully',
      redirectUrl: `${process.env.DOMAIN || 'https://tshirtbrothers.com'}/quote/accepted/${id}`,
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

    const validStatuses = ['pending', 'reviewed', 'quoted', 'approved', 'rejected', 'completed'];
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

export default router;
