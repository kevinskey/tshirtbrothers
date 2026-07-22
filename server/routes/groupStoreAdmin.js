// Group Store admin API — the "client backend" the organization uses to
// view orders and place bulk orders. Read-only over the storefront's
// catalog: group admins CANNOT edit products or prices. That's TSB's
// job on /api/admin/group-stores.
//
// Auth is magic-link + session token:
//   POST /login/request  { slug, email }        → email a 6-digit code
//   POST /login/verify   { slug, email, code }  → issue session token
//
// Authenticated (Bearer <session_token>):
//   GET  /:slug/me                          — who am I
//   POST /:slug/logout                      — revoke this session
//   GET  /:slug/orders                      — order list, read-only
//   GET  /:slug/orders/:id                  — order detail
//   GET  /:slug/fundraiser/summary          — fundraiser running total
//   POST /:slug/bulk-orders                 — bulk order draft (bulk_buyer+)
//   GET  /:slug/admins                      — list admins (owner only)
//   POST /:slug/admins                      — invite admin (owner only)
//
// TSB internal admin creates group stores + products via /api/admin/group-stores.

import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { storeAdminSession, requireRole, _hashToken } from '../middleware/storeAdminSession.js';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'T-Shirt Brothers <noreply@tshirtbrothers.com>';

const CODE_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 14;

// ── helpers ──────────────────────────────────────────────────────────────
function generateCode() {
  // 6-digit numeric code, zero-padded
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function findGroupStore(slug) {
  const { rows } = await pool.query(
    `SELECT id, slug, name, store_type, status
       FROM stores
      WHERE slug = $1`,
    [slug],
  );
  const s = rows[0];
  if (!s) return null;
  if (s.store_type !== 'group') return null;
  if (s.status !== 'active') return null;
  return s;
}

// ── POST /login/request ──────────────────────────────────────────────────
// Body: { slug, email }
// If email is a registered admin for this store, email them a code.
// Response is identical whether the email is registered or not — avoids
// leaking which emails are admins.
router.post('/login/request', async (req, res, next) => {
  try {
    const { slug, email } = req.body ?? {};
    if (!slug || !email) return res.status(400).json({ error: 'slug + email required' });
    const store = await findGroupStore(slug);
    // Always respond OK to avoid user-enum. Only actually send if valid.
    if (!store) return res.json({ ok: true });

    const admin = await pool.query(
      `SELECT id, email, name FROM store_admins WHERE store_id = $1 AND lower(email) = lower($2)`,
      [store.id, email],
    );
    if (!admin.rows[0]) return res.json({ ok: true });

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

    await pool.query(
      `INSERT INTO store_admin_login_codes (store_id, email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [store.id, admin.rows[0].email, codeHash, expiresAt],
    );

    // Fire-and-forget email
    if (process.env.RESEND_API_KEY) {
      resend.emails.send({
        from: FROM,
        to: admin.rows[0].email,
        subject: `Your ${store.name} store login code: ${code}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
          <h2 style="margin:0 0 12px;">${store.name} store</h2>
          <p style="margin:0 0 16px;color:#4b5563;">Use this code to sign in to your store dashboard. It expires in ${CODE_TTL_MINUTES} minutes.</p>
          <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0;color:#111827;">${code}</p>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">If you didn't request this, you can ignore this email.</p>
        </div>`,
      }).catch((err) => console.error('[groupStoreAdmin] login email failed:', err.message));
    } else {
      // Dev: log the code so we can test without Resend configured
      console.log(`[groupStoreAdmin] login code for ${admin.rows[0].email} @ ${slug}: ${code}`);
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /login/verify ───────────────────────────────────────────────────
// Body: { slug, email, code }
// Consumes the code and issues a session token.
router.post('/login/verify', async (req, res, next) => {
  try {
    const { slug, email, code } = req.body ?? {};
    if (!slug || !email || !code) {
      return res.status(400).json({ error: 'slug + email + code required' });
    }
    const store = await findGroupStore(slug);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const codeHash = hashCode(String(code).trim());
    const { rows } = await pool.query(
      `SELECT id FROM store_admin_login_codes
        WHERE store_id = $1
          AND lower(email) = lower($2)
          AND code_hash = $3
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [store.id, email, codeHash],
    );
    if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired code' });

    // Consume the code
    await pool.query(
      `UPDATE store_admin_login_codes SET consumed_at = NOW() WHERE id = $1`,
      [rows[0].id],
    );

    const admin = await pool.query(
      `SELECT id, email, name, role FROM store_admins
        WHERE store_id = $1 AND lower(email) = lower($2)`,
      [store.id, email],
    );
    if (!admin.rows[0]) return res.status(401).json({ error: 'Admin not found' });

    const token = generateSessionToken();
    const tokenHash = _hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);

    await pool.query(
      `INSERT INTO store_admin_sessions (store_id, admin_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [store.id, admin.rows[0].id, tokenHash, expiresAt],
    );
    await pool.query(
      `UPDATE store_admins SET last_login_at = NOW() WHERE id = $1`,
      [admin.rows[0].id],
    );

    res.json({
      token,
      expires_at: expiresAt.toISOString(),
      admin: {
        email: admin.rows[0].email,
        name: admin.rows[0].name,
        role: admin.rows[0].role,
      },
      store: { slug: store.slug, name: store.name },
    });
  } catch (err) { next(err); }
});

// ── Authenticated routes ─────────────────────────────────────────────────
router.use('/:slug', storeAdminSession);

// GET /:slug/me
router.get('/:slug/me', (req, res) => {
  res.json({ admin: req.store_admin });
});

// POST /:slug/logout
router.post('/:slug/logout', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header.slice('Bearer '.length).trim();
    const tokenHash = _hashToken(token);
    await pool.query(
      `UPDATE store_admin_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /:slug/orders
router.get('/:slug/orders', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10), 1), 500);
    const { rows } = await pool.query(
      `SELECT id, tsb_order_ref, buyer_email, subtotal_cents, shipping_cents,
              tax_cents, gross_total_cents, status, fulfillment_type, is_bulk,
              created_at, updated_at
         FROM store_orders
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.store_admin.store_id, limit],
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// GET /:slug/orders/:id
router.get('/:slug/orders/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query(
      `SELECT id, tsb_order_ref, buyer_email, subtotal_cents, shipping_cents,
              tax_cents, gross_total_cents, split_snapshot_json, status,
              fulfillment_type, is_bulk, created_at, updated_at
         FROM store_orders
        WHERE store_id = $1 AND id = $2`,
      [req.store_admin.store_id, id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /:slug/fundraiser/summary
// Aggregates store_ledger credits so far (this is the running total
// owed to / raised by the organization). Empty for non-fundraiser
// stores — they'll see zeros.
router.get('/:slug/fundraiser/summary', async (req, res, next) => {
  try {
    const store = await pool.query(
      `SELECT is_fundraiser, fundraiser_json FROM stores WHERE id = $1`,
      [req.store_admin.store_id],
    );
    const ledger = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'sale' THEN amount_cents ELSE 0 END), 0)::bigint AS gross_raised_cents,
         COALESCE(SUM(CASE WHEN entry_type IN ('sale','refund','adjustment') THEN amount_cents ELSE 0 END), 0)::bigint AS net_owed_cents,
         COALESCE(SUM(CASE WHEN entry_type = 'payout' THEN -amount_cents ELSE 0 END), 0)::bigint AS paid_out_cents,
         COUNT(*) FILTER (WHERE entry_type = 'sale')::bigint AS sale_count
       FROM store_ledger
      WHERE store_id = $1`,
      [req.store_admin.store_id],
    );
    res.json({
      is_fundraiser: !!store.rows[0]?.is_fundraiser,
      fundraiser: store.rows[0]?.fundraiser_json ?? {},
      gross_raised_cents: Number(ledger.rows[0].gross_raised_cents),
      net_owed_cents: Number(ledger.rows[0].net_owed_cents),
      paid_out_cents: Number(ledger.rows[0].paid_out_cents),
      sale_count: Number(ledger.rows[0].sale_count),
    });
  } catch (err) { next(err); }
});

// POST /:slug/bulk-orders
// Creates a bulk order draft on behalf of the org (e.g., the school
// buying 40 shirts for the choir at wholesale). This does NOT charge —
// it opens a store_order in status='pending' that TSB reviews and
// invoices. Body: { lines: [{ store_product_id, qty, size?, color? }],
// note?, ship_to? }
router.post('/:slug/bulk-orders', requireRole('bulk_buyer', 'owner'), async (req, res, next) => {
  try {
    const { lines, note, ship_to } = req.body ?? {};
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'lines[] required' });
    }
    for (const l of lines) {
      if (!Number.isInteger(l.store_product_id) || !Number.isInteger(l.qty) || l.qty <= 0) {
        return res.status(400).json({ error: 'each line needs store_product_id + qty > 0' });
      }
    }

    // Look up products to compute subtotal + snapshot
    const ids = lines.map((l) => l.store_product_id);
    const { rows: prods } = await pool.query(
      `SELECT id, title, retail_price_cents FROM store_products
        WHERE store_id = $1 AND id = ANY($2::int[])`,
      [req.store_admin.store_id, ids],
    );
    const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
    for (const l of lines) {
      if (!byId[l.store_product_id]) {
        return res.status(400).json({ error: `product ${l.store_product_id} not in this store` });
      }
    }
    const snapshot = { lines: [] };
    let subtotal = 0;
    for (const l of lines) {
      const p = byId[l.store_product_id];
      const line_total = p.retail_price_cents * l.qty;
      subtotal += line_total;
      snapshot.lines.push({
        store_product_id: p.id,
        title: p.title,
        qty: l.qty,
        size: l.size ?? null,
        color: l.color ?? null,
        retail_price_cents: p.retail_price_cents,
        line_total_cents: line_total,
      });
    }
    snapshot.note = note ?? null;
    snapshot.ship_to = ship_to ?? null;
    snapshot.placed_by = { email: req.store_admin.email, name: req.store_admin.name };

    const ref = `BULK-${Date.now()}-${req.store_admin.store_id}`;
    const { rows } = await pool.query(
      `INSERT INTO store_orders
         (store_id, tsb_order_ref, buyer_email, subtotal_cents, shipping_cents,
          tax_cents, gross_total_cents, split_snapshot_json,
          store_earnings_cents, tsb_earnings_cents, status,
          fulfillment_type, is_bulk, placed_by_admin_id)
       VALUES ($1, $2, $3, $4, 0, 0, $4, $5, 0, 0, 'paid', 'pickup', TRUE, $6)
       RETURNING id, tsb_order_ref, subtotal_cents, status, created_at`,
      [
        req.store_admin.store_id,
        ref,
        req.store_admin.email,
        subtotal,
        snapshot,
        req.store_admin.id,
      ],
    );
    // NOTE: status='paid' is a stub for the pilot — the intent record is
    // created but TSB invoices out-of-band. Wire to Stripe invoices in
    // a follow-up.
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /:slug/admins  (owner only)
router.get('/:slug/admins', requireRole('owner'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, invited_by_email, created_at, last_login_at
         FROM store_admins
        WHERE store_id = $1
        ORDER BY created_at ASC`,
      [req.store_admin.store_id],
    );
    res.json({ admins: rows });
  } catch (err) { next(err); }
});

// POST /:slug/admins  (owner only)  Body: { email, name?, role? }
router.post('/:slug/admins', requireRole('owner'), async (req, res, next) => {
  try {
    const { email, name, role } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const roleFinal = ['viewer', 'bulk_buyer', 'owner'].includes(role) ? role : 'viewer';
    try {
      const { rows } = await pool.query(
        `INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, created_at`,
        [req.store_admin.store_id, email, name ?? null, roleFinal, req.store_admin.email],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'That email is already an admin for this store' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

export default router;
