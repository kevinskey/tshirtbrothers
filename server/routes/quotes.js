import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// POST / - Create a new quote (no auth required)
router.post('/', async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      product_id,
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

    const result = await pool.query(
      `INSERT INTO quotes
        (customer_name, customer_email, customer_phone, product_id, color, sizes, print_areas, design_type, design_url, quantity, estimated_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        customer_name,
        customer_email,
        customer_phone || null,
        product_id || null,
        color || null,
        JSON.stringify(sizes || []),
        JSON.stringify(print_areas || []),
        design_type || null,
        design_url || null,
        quantity,
        estimated_price || null,
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
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

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
