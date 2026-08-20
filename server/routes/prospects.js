import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

// Admin-only sales prospect list — mounted at /api/admin/prospects.
// There is no public router here on purpose: this is the shop's outreach
// list, not customer-facing content.
export const adminRouter = Router();
adminRouter.use(authenticate, adminOnly);

const TIERS = ['A', 'B', 'C'];
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

const COLUMNS = `id, tier, name, category, address, city, phone, phone_confidence,
                 google_rating, product_angle, notes, status, contact_name,
                 contact_email, outreach_notes, last_contacted_at, created_at, updated_at`;

// GET / — the whole board, with optional filters.
//   ?tier=A  ?status=new  ?q=roofing  ?hasPhone=yes|no
// Returns counts alongside rows so the UI stat tiles don't need a second call.
adminRouter.get('/', async (req, res, next) => {
  try {
    const { tier, status, q, hasPhone } = req.query;
    const where = [];
    const params = [];

    if (tier && TIERS.includes(String(tier))) {
      params.push(String(tier));
      where.push(`tier = $${params.length}`);
    }
    if (status && STATUSES.includes(String(status))) {
      params.push(String(status));
      where.push(`status = $${params.length}`);
    }
    if (hasPhone === 'yes') where.push(`phone IS NOT NULL`);
    if (hasPhone === 'no') where.push(`phone IS NULL`);
    if (q) {
      params.push(`%${String(q)}%`);
      const i = params.length;
      where.push(`(name ILIKE $${i} OR category ILIKE $${i} OR address ILIKE $${i}
                   OR product_angle ILIKE $${i} OR notes ILIKE $${i}
                   OR outreach_notes ILIKE $${i} OR contact_name ILIKE $${i})`);
    }

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [list, totals] = await Promise.all([
      pool.query(
        `SELECT ${COLUMNS} FROM prospects ${clause}
          ORDER BY tier ASC,
                   CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1
                               WHEN 'quoted' THEN 2 WHEN 'won' THEN 3 ELSE 4 END,
                   name ASC`,
        params
      ),
      // Unfiltered so the tiles always describe the whole list.
      pool.query(
        `SELECT tier, status, COUNT(*)::int AS n,
                COUNT(phone)::int AS with_phone
           FROM prospects GROUP BY tier, status`
      ),
    ]);

    res.json({ prospects: list.rows, totals: totals.rows });
  } catch (err) { next(err); }
});

// POST / — add a prospect the team found themselves.
adminRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) {
      return res.status(400).json({ error: 'Business name is required' });
    }
    const tier = TIERS.includes(b.tier) ? b.tier : 'B';
    const { rows } = await pool.query(
      `INSERT INTO prospects
         (tier, name, category, address, city, phone, phone_confidence, product_angle, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (name) DO NOTHING
       RETURNING ${COLUMNS}`,
      [tier, String(b.name).trim(), b.category || null, b.address || null,
       b.city || 'Fairburn', b.phone || null, b.phone ? 'added by hand' : null,
       b.product_angle || null, b.notes || null]
    );
    if (!rows.length) {
      return res.status(409).json({ error: 'A prospect with that name already exists' });
    }
    res.status(201).json({ prospect: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /:id — update outreach state or fill in a detail (phone, contact name).
// Only these fields are writable; the researched columns stay put unless
// explicitly included.
const WRITABLE = ['tier', 'status', 'phone', 'contact_name', 'contact_email',
                  'outreach_notes', 'product_angle', 'notes', 'category',
                  'address', 'city'];

adminRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });

    const b = req.body || {};
    if (b.tier !== undefined && !TIERS.includes(b.tier)) {
      return res.status(400).json({ error: 'tier must be A, B, or C' });
    }
    if (b.status !== undefined && !STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    }

    const sets = [];
    const params = [];
    for (const key of WRITABLE) {
      if (b[key] === undefined) continue;
      params.push(b[key] === '' ? null : b[key]);
      sets.push(`${key} = $${params.length}`);
    }
    // A hand-entered phone is no longer a directory match — relabel it so the
    // confidence column never claims a verification that didn't happen.
    if (b.phone !== undefined) {
      params.push(b.phone ? 'added by hand' : null);
      sets.push(`phone_confidence = $${params.length}`);
    }
    // Moving off 'new' stamps the contact date unless one was passed in.
    if (b.status !== undefined && b.status !== 'new') {
      sets.push(`last_contacted_at = COALESCE(last_contacted_at, NOW())`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    sets.push('updated_at = NOW()');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE prospects SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING ${COLUMNS}`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Prospect not found' });
    res.json({ prospect: rows[0] });
  } catch (err) { next(err); }
});

adminRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' });
    const { rowCount } = await pool.query('DELETE FROM prospects WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Prospect not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default adminRouter;
