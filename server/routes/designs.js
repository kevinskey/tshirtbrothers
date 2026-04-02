import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

// All design routes require authentication
router.use(authenticate);

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
    const { name, product_ss_id, product_name, product_image, color_index, elements, thumbnail } = req.body;
    const result = await pool.query(
      `INSERT INTO saved_designs (user_id, name, product_ss_id, product_name, product_image, color_index, elements, thumbnail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, updated_at`,
      [req.user.id, name || 'Untitled design', product_ss_id, product_name, product_image, color_index || 0, JSON.stringify(elements || []), thumbnail]
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
