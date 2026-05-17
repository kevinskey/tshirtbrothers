import { Router } from 'express';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/favorites — list the current user's saved products with the
// full product row joined in so the favorites page can render cards
// without a second round-trip per item.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, f.created_at AS favorited_at
         FROM user_favorites f
         JOIN products p ON p.id = f.product_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ products: rows });
  } catch (err) { next(err); }
});

// GET /api/favorites/ids — lightweight: just the product_id set. Used by
// the shop page to render filled/unfilled heart icons without pulling
// the full joined rows.
router.get('/ids', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT product_id FROM user_favorites WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ ids: rows.map((r) => r.product_id) });
  } catch (err) { next(err); }
});

// POST /api/favorites/:productId — add. ON CONFLICT DO NOTHING so a
// double-tap is harmless.
router.post('/:productId', async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'productId must be a positive integer' });
    }
    await pool.query(
      'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING',
      [req.user.id, productId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/favorites/:productId — remove.
router.delete('/:productId', async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'productId must be a positive integer' });
    }
    await pool.query(
      'DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2',
      [req.user.id, productId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
