import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  dateOnly, isValidYmd, getShopClosure, forgetShopStatus, loadShopStatus,
} from '../lib/shopStatus.js';

const router = Router();

// GET /api/shop-status — public. The site banner reads this.
router.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getShopClosure());
  } catch (err) { next(err); }
});

function adminOut(row) {
  return {
    closed: !!row.closed,
    reopens_on: dateOnly(row.reopens_on),
    note: row.note ?? null,
    updated_at: row.updated_at ?? null,
  };
}

// GET /api/shop-status/admin — the switch as stored, for the dashboard card.
router.get('/admin', authenticate, adminOnly, async (req, res, next) => {
  try {
    forgetShopStatus();
    const row = await loadShopStatus();
    res.json({ ...adminOut(row), closure: await getShopClosure() });
  } catch (err) { next(err); }
});

// PATCH /api/shop-status/admin — { closed, reopens_on?, note? }
router.patch('/admin', authenticate, adminOnly, async (req, res, next) => {
  try {
    const body = req.body || {};
    if (typeof body.closed !== 'boolean') {
      return res.status(400).json({ error: 'closed must be true or false' });
    }
    const reopensOn = body.reopens_on ?? null;
    if (reopensOn !== null && !isValidYmd(reopensOn)) {
      return res.status(400).json({ error: 'Pick a real reopen date' });
    }
    const note = body.note ?? null;
    if (note !== null && (typeof note !== 'string' || note.length > 280)) {
      return res.status(400).json({ error: 'Keep the note under 280 characters' });
    }
    // Opening the shop clears the date and note so the next closure starts
    // fresh.
    const values = body.closed
      ? [true, reopensOn, note && note.trim() ? note.trim() : null]
      : [false, null, null];
    const { rows } = await pool.query(
      `INSERT INTO shop_status (id, closed, reopens_on, note, updated_at)
       VALUES (1, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE
         SET closed = EXCLUDED.closed, reopens_on = EXCLUDED.reopens_on,
             note = EXCLUDED.note, updated_at = now()
       RETURNING *`,
      values,
    );
    forgetShopStatus();
    res.json({ ...adminOut(rows[0]), closure: await getShopClosure() });
  } catch (err) { next(err); }
});

export default router;
