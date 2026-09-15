import { Router } from 'express';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';
import { sendGangSheetLinkEmail } from '../services/email.js';
import { sendSMSOrThrow } from '../services/sms.js';

const router = Router();
router.use(authenticate, adminOnly);

// GET / - List all gang sheets
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sheet_length_ft, pricing_tier, total_cost, status,
              jsonb_array_length(COALESCE(designs, '[]'::jsonb)) as design_count,
              exported_url, preview_url, created_at, updated_at
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
    const { name, sheet_length_ft, pricing_tier, total_cost, layout_json, designs, status, preview_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE gang_sheets SET
        name = COALESCE($1, name),
        sheet_length_ft = COALESCE($2, sheet_length_ft),
        pricing_tier = COALESCE($3, pricing_tier),
        total_cost = COALESCE($4, total_cost),
        layout_json = COALESCE($5, layout_json),
        designs = COALESCE($6, designs),
        status = COALESCE($7, status),
        preview_url = COALESCE($8, preview_url),
        updated_at = NOW()
      WHERE id = $9 RETURNING *`,
      [name, sheet_length_ft, pricing_tier, total_cost,
       layout_json ? JSON.stringify(layout_json) : null,
       designs ? JSON.stringify(designs) : null,
       status, preview_url || null, req.params.id]
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

// POST /:id/duplicate - Copy a sheet (designs + layout) as a new draft
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO gang_sheets (name, sheet_length_ft, pricing_tier, total_cost, layout_json, designs, preview_url, status, created_by)
       SELECT 'Copy of ' || name, sheet_length_ft, pricing_tier, total_cost, layout_json, designs, preview_url, 'draft', $2
       FROM gang_sheets WHERE id = $1 RETURNING *`,
      [req.params.id, req.user?.id || null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Accept either a bare Spaces key or a full URL into our bucket, and reject
// anything that couldn't be a key (presigning is done with our credentials,
// so this must never take an arbitrary string).
function toSpacesKey(value) {
  if (!value) return null;
  let s = String(value);
  if (/^https?:\/\//i.test(s)) {
    try { s = decodeURIComponent(new URL(s).pathname.replace(/^\//, '')); } catch { return null; }
  }
  return /^[A-Za-z0-9_\-./ ]{3,512}$/.test(s) && !s.includes('..') ? s : null;
}

// POST /:id/send - Presign the sheet's 300 DPI print file and email/text the
// link. Body: { file_key?, email?, phone? }. file_key comes from a fresh
// /api/gangsheet-store/compose in the builder; when absent, the sheet's
// stored exported_url from a previous send is reused (that's what makes the
// Email/Text buttons on the sheets folder work without opening the builder).
const SHARE_LINK_DAYS = 7;
router.post('/:id/send', async (req, res, next) => {
  try {
    const { file_key, email, phone } = req.body || {};
    const { rows } = await pool.query('SELECT id, name, exported_url FROM gang_sheets WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    const sheet = rows[0];

    const key = toSpacesKey(file_key) || toSpacesKey(sheet.exported_url);
    if (!key) return res.status(400).json({ error: 'No print file for this sheet yet — open it in the builder and send from there once.' });

    const spaces = getSpacesClient();
    try {
      await spaces.send(new HeadObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
    } catch {
      return res.status(400).json({ error: 'Print file not found — open the sheet in the builder and send again to regenerate it.' });
    }
    const url = await getSignedUrl(
      spaces,
      new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }),
      { expiresIn: SHARE_LINK_DAYS * 24 * 3600 },
    );

    // A freshly composed file becomes the sheet's file of record so future
    // folder-level sends can reuse it.
    if (toSpacesKey(file_key)) {
      await pool.query(
        `UPDATE gang_sheets SET exported_url = $1, status = 'exported', updated_at = NOW() WHERE id = $2`,
        [key, req.params.id]
      );
    }

    const name = sheet.name || 'Untitled Sheet';
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Invalid email address' });
      await sendGangSheetLinkEmail({ to: String(email), sheetName: name, url, linkExpiresDays: SHARE_LINK_DAYS });
    }
    if (phone) {
      await sendSMSOrThrow(
        String(phone),
        `T-Shirt Brothers — gang sheet "${name}" print file (300 DPI PNG): ${url} — link expires in ${SHARE_LINK_DAYS} days.`
      );
    }
    res.json({ ok: true, url });
  } catch (err) { next(err); }
});

export default router;
