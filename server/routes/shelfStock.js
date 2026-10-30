// Shelf stock — what's physically in Fairburn right now.
//
// Deliberately small. Every adjustment is a hand edit: with TSB's volume an
// auto-deduct would be wrong more often than Doc correcting a number, and a
// count nobody trusts is worse than no count at all. See the migration
// (shelf_stock_v1.sql) for why this isn't a column on products.

import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, adminOnly);

const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);

function parseQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

// GET / — the whole shelf, newest edits first. Small enough to send whole;
// if it ever isn't, that's a good problem and this gets a search param.
router.get('/', async (req, res, next) => {
  try {
    const { product_id } = req.query;
    const { rows } = await pool.query(
      product_id
        ? `SELECT * FROM shelf_stock WHERE product_id = $1 ORDER BY style_name, color, size`
        : `SELECT * FROM shelf_stock ORDER BY updated_at DESC, style_name, color, size`,
      product_id ? [product_id] : [],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /summary — on-hand totals per catalogue product, for the "On hand"
// figure in the catalogue list. One query instead of one per row.
router.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT product_id, SUM(qty)::int AS qty
         FROM shelf_stock
        WHERE product_id IS NOT NULL AND qty > 0
        GROUP BY product_id`,
    );
    res.json(Object.fromEntries(rows.map((r) => [r.product_id, r.qty])));
  } catch (err) { next(err); }
});

// GET /match?style=&size= — "can I pull this off the shelf?", asked from a
// quote. Style matches loosely because a quote's garment name and the
// catalogue's style name are rarely spelled the same.
router.get('/match', async (req, res, next) => {
  try {
    const style = str(req.query.style);
    if (!style) return res.json([]);
    const size = str(req.query.size, 20);
    const params = [`%${style}%`];
    let sql = `SELECT * FROM shelf_stock WHERE qty > 0 AND style_name ILIKE $1`;
    if (size) {
      params.push(size);
      sql += ` AND LOWER(size) = LOWER($${params.length})`;
    }
    sql += ' ORDER BY style_name, color, size LIMIT 50';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — count a pile. Counting the same style/color/size twice corrects
// the existing row rather than creating a duplicate the list would show
// twice, which is what the unique index is for.
router.post('/', async (req, res, next) => {
  try {
    const style_name = str(req.body?.style_name);
    if (!style_name) return res.status(400).json({ error: 'style_name is required' });
    const qty = parseQty(req.body?.qty);
    if (qty === null) return res.status(400).json({ error: 'qty must be a whole number, 0 or more' });
    const productId = Number(req.body?.product_id);
    const { rows } = await pool.query(
      `INSERT INTO shelf_stock (product_id, style_name, color, size, qty, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (LOWER(style_name), LOWER(color), LOWER(size))
       DO UPDATE SET qty = EXCLUDED.qty,
                     note = COALESCE(EXCLUDED.note, shelf_stock.note),
                     product_id = COALESCE(EXCLUDED.product_id, shelf_stock.product_id),
                     updated_at = NOW()
       RETURNING *`,
      [
        Number.isFinite(productId) && productId > 0 ? productId : null,
        style_name,
        str(req.body?.color, 60),
        str(req.body?.size, 20),
        qty,
        str(req.body?.note, 300) || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id — adjust a count after pulling stock. qty 0 is kept, not
// deleted: "we had these and they're gone" is worth seeing on the shelf
// until Doc clears the row himself.
router.patch('/:id', async (req, res, next) => {
  try {
    const patches = [];
    const params = [];
    const push = (col, val) => { params.push(val); patches.push(`${col} = $${params.length}`); };

    if (req.body?.qty !== undefined) {
      const qty = parseQty(req.body.qty);
      if (qty === null) return res.status(400).json({ error: 'qty must be a whole number, 0 or more' });
      push('qty', qty);
    }
    if (req.body?.note !== undefined) push('note', str(req.body.note, 300) || null);
    if (req.body?.color !== undefined) push('color', str(req.body.color, 60));
    if (req.body?.size !== undefined) push('size', str(req.body.size, 20));
    if (req.body?.style_name !== undefined) {
      const name = str(req.body.style_name);
      if (!name) return res.status(400).json({ error: 'style_name cannot be empty' });
      push('style_name', name);
    }
    if (patches.length === 0) return res.status(400).json({ error: 'nothing to update' });
    patches.push('updated_at = NOW()');

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE shelf_stock SET ${patches.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Shelf row not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id — the pile is gone and Doc doesn't want to see it any more.
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM shelf_stock WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Shelf row not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
