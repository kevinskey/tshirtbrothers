/**
 * Custom font management for the design studio.
 *
 * Admin uploads / lists / deletes via /api/admin/custom-fonts. The picker
 * fetches /api/custom-fonts (no auth) so customers see the same fonts the
 * admin made available — same justification as Google Fonts being
 * publicly fetchable.
 *
 * Upload shape: base64 in JSON body, matching the existing thumbnail /
 * design-element pattern in routes/designs.js. Avoids a multer dependency
 * the rest of the codebase doesn't have.
 *
 * Validation:
 *   - Magic bytes (TrueType: 00 01 00 00; OpenType: 'OTTO'; legacy 'true').
 *   - Size cap: 5 MB. Enough for any reasonable display font; rejects
 *     accidental icon-font dumps with thousands of glyphs.
 *   - family_name uniqueness: enforced at DB level; we surface a friendly
 *     409 if the unique violation hits.
 */

import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';

const adminRouter = Router();
const publicRouter = Router();

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const VALID_CATEGORIES = new Set([
  'custom', 'sans', 'display', 'serif', 'decorative', 'distressed',
  'script', 'gothic', 'mono', 'system',
]);

// Magic-byte check. .ttf and .otf both start with one of three signatures.
function looksLikeFontBinary(buf) {
  if (buf.length < 4) return false;
  // TrueType: 00 01 00 00
  if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return true;
  // OpenType: 'OTTO'
  if (buf[0] === 0x4f && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4f) return true;
  // Legacy TrueType: 'true'
  if (buf[0] === 0x74 && buf[1] === 0x72 && buf[2] === 0x75 && buf[3] === 0x65) return true;
  // WOFF (just in case): 'wOFF' or 'wOF2'
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x46) return true;
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x32) return true;
  return false;
}

function sanitizeFamilyName(s) {
  // CSS-safe: strip quotes, commas, semicolons. Trim, keep letters / digits /
  // spaces / hyphens. We display names exactly as stored, so don't
  // overstrip — just neutralize the chars that break @font-face rules.
  return String(s ?? '').trim().replace(/["',;]/g, '').slice(0, 120);
}

// ─── Admin (mutating) ────────────────────────────────────────────────────
adminRouter.use(authenticate, adminOnly);

adminRouter.post('/', async (req, res, next) => {
  try {
    const { family_name, display_name, category, file_base64 } = req.body || {};
    const familyName = sanitizeFamilyName(family_name);
    if (!familyName) return res.status(400).json({ error: 'family_name required' });
    if (!file_base64 || typeof file_base64 !== 'string') {
      return res.status(400).json({ error: 'file_base64 required' });
    }
    const cat = VALID_CATEGORIES.has(category) ? category : 'custom';

    // Strip any data: URL prefix and decode.
    const base64 = file_base64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (buf.length === 0) return res.status(400).json({ error: 'empty file' });
    if (buf.length > MAX_SIZE_BYTES) {
      return res.status(413).json({ error: `file too large (max ${MAX_SIZE_BYTES} bytes)` });
    }
    if (!looksLikeFontBinary(buf)) {
      return res.status(400).json({ error: 'file does not look like a TTF / OTF / WOFF font' });
    }

    // Pick an extension based on the magic bytes — Spaces uses Content-Type
    // and the URL extension to set CDN headers correctly.
    const ext = buf[0] === 0x77 ? (buf[3] === 0x32 ? 'woff2' : 'woff') : 'ttf';
    const safeFile = familyName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const key = `custom-fonts/${safeFile}-${Date.now()}.${ext}`;
    const contentType = ext === 'ttf' ? 'font/ttf'
      : ext === 'woff2' ? 'font/woff2'
      : 'font/woff';
    const url = await uploadObject({ key, body: buf, contentType, cacheControl: 'public, max-age=31536000, immutable' });

    try {
      const result = await pool.query(
        `INSERT INTO custom_fonts (family_name, display_name, file_url, file_size, category, uploader_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, family_name, display_name, file_url, file_size, category, created_at`,
        [familyName, display_name || null, url, buf.length, cat, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: `A font with family_name "${familyName}" already exists` });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, family_name, display_name, file_url, file_size, category, uploader_user_id, created_at
       FROM custom_fonts ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    const result = await pool.query(
      `DELETE FROM custom_fonts WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'font not found' });
    // Note: we don't delete the Spaces object. If a saved design references
    // the font by URL, removing the binary would break the design.
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ─── Public (read-only) ──────────────────────────────────────────────────
// No auth — same trust model as Google Fonts. The picker calls this on
// page load so customers see the fonts admins have made available.
publicRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT family_name, display_name, file_url, category
       FROM custom_fonts ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export { adminRouter, publicRouter };
