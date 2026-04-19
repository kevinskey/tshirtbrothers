import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import { refreshLocalBusinesses, getSouthAtlantaZips } from '../services/localBusinesses.js';

const router = Router();

// GET / - public list, with optional filters
//   ?zip=30315
//   ?since=2026-01-01   (opened_at >= since)
//   ?q=coffee           (name ILIKE %q%)
//   ?limit=100&offset=0
router.get('/', async (req, res, next) => {
  try {
    const { zip, since, q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const params = [];

    if (zip) {
      params.push(String(zip));
      where.push(`zip = $${params.length}`);
    } else {
      // Default: only show businesses in our South Atlanta ZIP set.
      params.push(getSouthAtlantaZips());
      where.push(`zip = ANY($${params.length})`);
    }

    if (since) {
      params.push(String(since));
      where.push(`opened_at >= $${params.length}`);
    }

    if (q) {
      params.push(`%${String(q)}%`);
      where.push(`name ILIKE $${params.length}`);
    }

    const sql = `
      SELECT id, name, business_type, address, city, state, zip,
             latitude, longitude, opened_at, first_seen_at
      FROM local_businesses
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(opened_at, first_seen_at::date) DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const { rows } = await pool.query(sql, params);
    res.json({ businesses: rows, limit, offset });
  } catch (err) {
    next(err);
  }
});

// GET /zips - the configured South Atlanta ZIP set (public, useful for UI)
router.get('/zips', (_req, res) => {
  res.json({ zips: getSouthAtlantaZips() });
});

// POST /refresh - admin only, pulls latest from the open-data source
router.post('/refresh', authenticate, adminOnly, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.body?.limit) || 1000, 10000);
    const result = await refreshLocalBusinesses({ limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
