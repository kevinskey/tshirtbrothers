import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, adminOnly);

// GET / - List all gang sheets
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sheet_length_ft, pricing_tier, total_cost, status,
              jsonb_array_length(COALESCE(designs, '[]'::jsonb)) as design_count,
              exported_url, created_at, updated_at
       FROM gang_sheets ORDER BY updated_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / - Create new gang sheet
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO gang_sheets (name, created_by) VALUES ($1, $2) RETURNING *`,
      [name || 'Untitled Sheet', req.user?.id || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /:id - Get full sheet with layout
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM gang_sheets WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /:id - Save sheet state
router.put('/:id', async (req, res, next) => {
  try {
    const { name, sheet_length_ft, pricing_tier, total_cost, layout_json, designs, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE gang_sheets SET
        name = COALESCE($1, name),
        sheet_length_ft = COALESCE($2, sheet_length_ft),
        pricing_tier = COALESCE($3, pricing_tier),
        total_cost = COALESCE($4, total_cost),
        layout_json = COALESCE($5, layout_json),
        designs = COALESCE($6, designs),
        status = COALESCE($7, status),
        updated_at = NOW()
      WHERE id = $8 RETURNING *`,
      [name, sheet_length_ft, pricing_tier, total_cost,
       layout_json ? JSON.stringify(layout_json) : null,
       designs ? JSON.stringify(designs) : null,
       status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id - Delete sheet
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM gang_sheets WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /:id/export - Save exported URL
router.post('/:id/export', async (req, res, next) => {
  try {
    const { exported_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE gang_sheets SET exported_url = $1, status = 'exported', updated_at = NOW() WHERE id = $2 RETURNING *`,
      [exported_url, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
