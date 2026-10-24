// Rhinestone / bling: the StoneCut hand-off, the public gallery, and the
// instant price behind /bling.
//
// StoneCut (rhinestones.tshirtbrothers.com) is a separate static SPA with no
// backend and no TSB session. It publishes a finished design here with a
// shared key in `x-stonecut-key`; an ordinary admin JWT works too, so Doc can
// drive the same endpoint from the TSB admin while logged in.

import express, { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  computeRhinestoneQuote,
  DEFAULT_RHINESTONE_SETTINGS,
} from '../services/rhinestonePricing.js';

const router = Router();

// The app-wide body limit is 10mb. A publish carries a base64 preview PNG
// plus an SVG with one <circle> per stone, and a dense 14x14in SS6 design
// runs to tens of thousands of stones — so this one route gets its own,
// larger parser (same trick design.js uses for /remove-color).
const publishBody = express.json({ limit: '30mb' });

// ── Settings ──────────────────────────────────────────────────────────────

// Reads the single tunable row. Falls back to the module defaults when the
// migration hasn't run yet, so /bling prices instead of 500ing on a fresh DB.
async function loadSettings() {
  try {
    const { rows } = await pool.query('SELECT * FROM rhinestone_pricing_settings WHERE id = 1');
    if (rows[0]) return rows[0];
  } catch {
    // Table missing — fall through to defaults.
  }
  return DEFAULT_RHINESTONE_SETTINGS;
}

// ── Publish from StoneCut ─────────────────────────────────────────────────

// Constant-time compare so the key can't be probed a byte at a time.
function keyMatches(provided) {
  const expected = process.env.STONECUT_PUBLISH_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Accepts either the shared StoneCut key or a normal admin JWT. Written as a
// single middleware rather than two routes so the publish path has exactly
// one implementation.
function stonecutOrAdmin(req, res, next) {
  if (keyMatches(req.get('x-stonecut-key'))) return next();
  // authenticate/adminOnly answer the request themselves on failure, so
  // reaching the inner callback already means a valid token.
  authenticate(req, res, () => adminOnly(req, res, next));
}

const slugify = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'design';

/* POST /api/rhinestone/designs
 *
 * Body: {
 *   name, previewBase64 (data URL PNG), svg (string),
 *   widthMm, heightMm, coverage,
 *   stoneBom: [{ size, color, n, stoneMm }],
 *   tags: string[], featured: boolean
 * }
 *
 * Lands the preview in admin_designs under the 'rhinestone' category — which
 * is what puts it in the Design Studio's Add Art panel, the gang-sheet
 * builder, and (through the studio) Mockups with no changes to any of them —
 * and the production metadata in rhinestone_designs.
 */
router.post('/designs', publishBody, stonecutOrAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      name,
      previewBase64,
      svg,
      widthMm,
      heightMm,
      coverage,
      stoneBom,
      tags,
      featured,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!previewBase64) {
      return res.status(400).json({ error: 'previewBase64 is required' });
    }

    const bom = Array.isArray(stoneBom)
      ? stoneBom
          .map((r) => ({
            size: String(r?.size || 'SS10').toUpperCase(),
            color: r?.color ? String(r.color) : null,
            n: Number(r?.n) || 0,
            stone_mm: Number(r?.stoneMm ?? r?.stone_mm) || null,
          }))
          .filter((r) => r.n > 0)
      : [];
    const stoneCount = bom.reduce((t, r) => t + r.n, 0);

    const slugBase = slugify(name);
    const stamp = Date.now().toString(36);
    const slug = `${slugBase}-${stamp}`;

    const previewUrl = await uploadObject({
      key: `rhinestone/${slug}.png`,
      body: previewBase64,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    let svgUrl = null;
    if (svg && String(svg).trim()) {
      svgUrl = await uploadObject({
        key: `rhinestone/${slug}.svg`,
        body: Buffer.from(String(svg), 'utf8'),
        contentType: 'image/svg+xml',
        cacheControl: 'public, max-age=31536000, immutable',
      });
    }

    await client.query('BEGIN');

    const tagList = Array.isArray(tags) ? tags.map(String) : [];
    const designRes = await client.query(
      `INSERT INTO admin_designs (name, description, image_url, thumbnail_url, category, tags)
       VALUES ($1, $2, $3, $3, 'rhinestone', $4)
       RETURNING id`,
      [
        String(name).trim(),
        `Rhinestone design — ${stoneCount} stones${
          widthMm && heightMm
            ? `, ${(Number(widthMm) / 25.4).toFixed(1)}in x ${(Number(heightMm) / 25.4).toFixed(1)}in`
            : ''
        }`,
        previewUrl,
        ['rhinestone', 'stonecut', ...tagList],
      ],
    );

    const rhRes = await client.query(
      `INSERT INTO rhinestone_designs
         (design_id, name, slug, preview_url, svg_url, width_mm, height_mm,
          stone_count, stone_bom, coverage, featured, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
       RETURNING *`,
      [
        designRes.rows[0].id,
        String(name).trim(),
        slug,
        previewUrl,
        svgUrl,
        Number(widthMm) || null,
        Number(heightMm) || null,
        stoneCount,
        JSON.stringify(bom),
        Number.isFinite(Number(coverage)) ? Number(coverage) : null,
        featured === true,
        tagList,
      ],
    );

    await client.query('COMMIT');
    res.status(201).json({ design: rhRes.rows[0], artLibraryId: designRes.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── Public gallery ────────────────────────────────────────────────────────

// The gallery is decorative: an unmigrated table (42P01) or an unreachable
// database should render /bling without a gallery, not a 500 on a marketing
// page. Anything else still propagates to the error handler.
const GALLERY_SOFT_FAIL = new Set(['42P01', 'ECONNREFUSED', 'ENOTFOUND']);

// GET /api/rhinestone/designs — the /bling gallery. Only featured designs are
// public; everything StoneCut publishes starts hidden so the gallery is
// curated rather than a dump of every test job.
router.get('/designs', async (req, res, next) => {
  try {
    const limit = Math.min(120, Math.max(1, parseInt(String(req.query.limit ?? '48'), 10) || 48));
    const { rows } = await pool.query(
      `SELECT id, name, slug, preview_url, width_mm, height_mm, stone_count, coverage, tags
         FROM rhinestone_designs
        WHERE featured = TRUE AND preview_url IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    // A missing table pre-migration should render an empty gallery, not a
    // broken page.
    if (GALLERY_SOFT_FAIL.has(err?.code)) return res.json([]);
    next(err);
  }
});

// GET /api/rhinestone/admin/designs — every published design, featured or not.
router.get('/admin/designs', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rhinestone_designs ORDER BY created_at DESC LIMIT 500`,
    );
    res.json(rows);
  } catch (err) {
    if (GALLERY_SOFT_FAIL.has(err?.code)) return res.json([]);
    next(err);
  }
});

// PATCH /api/rhinestone/admin/designs/:id — curate the gallery.
router.patch('/admin/designs/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { featured, name } = req.body || {};
    const sets = [];
    const params = [];
    if (featured !== undefined) {
      params.push(featured === true);
      sets.push(`featured = $${params.length}`);
    }
    if (name !== undefined) {
      params.push(String(name));
      sets.push(`name = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
    params.push(req.params.id);
    const { rows, rowCount } = await pool.query(
      `UPDATE rhinestone_designs SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rowCount === 0) return res.status(404).json({ error: 'design not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Instant price ─────────────────────────────────────────────────────────

/* POST /api/rhinestone/quote — public. Body is the computeRhinestoneQuote
 * input, plus an optional `designId` which pulls the real stone BOM from a
 * published StoneCut design instead of trusting a client-supplied count.
 */
router.post('/quote', async (req, res, next) => {
  try {
    const body = req.body || {};
    const inputs = { ...body };

    if (body.designId) {
      const { rows } = await pool.query(
        'SELECT stone_bom, coverage, name FROM rhinestone_designs WHERE id = $1',
        [body.designId],
      );
      if (!rows[0]) return res.status(404).json({ error: 'design not found' });
      inputs.stoneBom = rows[0].stone_bom;
      if (inputs.coverage == null && rows[0].coverage != null) {
        inputs.coverage = Number(rows[0].coverage);
      }
      inputs.designName = rows[0].name;
    }

    const settings = await loadSettings();
    const quote = computeRhinestoneQuote(inputs, settings);
    res.json({ ...quote, designName: inputs.designName ?? null });
  } catch (err) {
    // Input validation errors from the pure function are the caller's fault.
    if (/^(quantity|numLocations|stoneBom)/.test(err?.message || '')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/rhinestone/pricing — the rate card, so the /bling page can render
// the volume breaks without round-tripping a quote per tier.
router.get('/pricing', async (_req, res, next) => {
  try {
    const s = await loadSettings();
    res.json({
      stone_rate_breaks: s.stone_rate_breaks,
      size_multipliers: s.size_multipliers,
      press_labor_per_piece: Number(s.press_labor_per_piece),
      digitizing_fee: Number(s.digitizing_fee),
      digitizing_waived_at_qty: Number(s.digitizing_waived_at_qty),
      min_decoration_per_piece: Number(s.min_decoration_per_piece),
      rush_surcharge_pct: Number(s.rush_surcharge_pct),
    });
  } catch (err) { next(err); }
});

// ── Admin: tune the rate card ─────────────────────────────────────────────

router.get('/admin/pricing', authenticate, adminOnly, async (_req, res, next) => {
  try {
    res.json(await loadSettings());
  } catch (err) { next(err); }
});

const TUNABLE = [
  'press_labor_per_piece',
  'digitizing_fee',
  'digitizing_waived_at_qty',
  'min_decoration_per_piece',
  'coverage_threshold',
  'coverage_upcharge_pct',
  'garment_markup',
  'rush_surcharge_pct',
  'proof_fee',
];

router.put('/admin/pricing', authenticate, adminOnly, async (req, res, next) => {
  try {
    const body = req.body || {};
    const sets = [];
    const params = [];

    for (const col of TUNABLE) {
      if (body[col] === undefined) continue;
      const n = Number(body[col]);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: `${col} must be a non-negative number` });
      }
      params.push(n);
      sets.push(`${col} = $${params.length}`);
    }
    if (Array.isArray(body.stone_rate_breaks)) {
      const clean = body.stone_rate_breaks
        .map((b) => ({ min_qty: Number(b?.min_qty), rate: Number(b?.rate) }))
        .filter((b) => Number.isInteger(b.min_qty) && b.min_qty >= 1 && Number.isFinite(b.rate) && b.rate >= 0)
        .sort((a, b) => a.min_qty - b.min_qty);
      if (clean.length === 0) {
        return res.status(400).json({ error: 'stone_rate_breaks must have at least one valid { min_qty, rate }' });
      }
      params.push(JSON.stringify(clean));
      sets.push(`stone_rate_breaks = $${params.length}::jsonb`);
    }
    if (body.size_multipliers && typeof body.size_multipliers === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(body.size_multipliers)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) clean[String(k).toUpperCase()] = n;
      }
      if (Object.keys(clean).length === 0) {
        return res.status(400).json({ error: 'size_multipliers must have at least one positive entry' });
      }
      params.push(JSON.stringify(clean));
      sets.push(`size_multipliers = $${params.length}::jsonb`);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });

    const { rows } = await pool.query(
      `UPDATE rhinestone_pricing_settings SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = 1 RETURNING *`,
      params,
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
