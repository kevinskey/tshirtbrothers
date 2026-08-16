import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadObject, getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';
import { sendGangSheetReadyToCustomer } from '../services/email.js';

const router = Router();

// Mirrors routes/payments.js's getStripe(): lazy per-request instantiation
// so a missing key surfaces as a clean 500 on first use rather than a
// silent, half-configured client sitting at module scope.
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

// Tier promises are copy, centralised so client + emails agree.
export const TIER_PROMISES = {
  standard: 'Ready in 2 business days',
  rush: 'Ready next business day — order by 11:00 AM',
  hot_rush: 'Ready same day — order by 1:30 PM',
};

export async function loadSettings() {
  const { rows } = await pool.query('SELECT * FROM gang_sheet_store_settings WHERE id = 1');
  if (!rows[0]) throw new Error('gang_sheet_store_settings row missing — run gang_sheet_store_v1.sql');
  return rows[0];
}

// 'HH:MM:SS' (or 'HH:MM') -> '11:00 AM' / '1:30 PM'. Postgres TIME columns
// come back from pg as 'HH:MM:SS' strings, never a Date, so this is pure
// string math — no timezone involved.
function fmt(t) {
  const [hStr, mStr] = String(t).split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Live version of TIER_PROMISES, built from the settings row so admin edits
// to the cutoffs are reflected immediately in /config and outbound emails.
// TIER_PROMISES below stays as the static fallback for callers that can't
// await a settings load (or whose load failed).
export function tierPromises(settings) {
  return {
    standard: 'Ready in 2 business days',
    rush: `Ready next business day — order by ${fmt(settings.cutoff_rush)}`,
    hot_rush: `Ready same day — order by ${fmt(settings.cutoff_hot_rush)}`,
  };
}

// Current shop-local wall clock. The droplet runs UTC; the shop is Atlanta.
function atlantaNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    weekday: get('weekday'),                       // 'Mon'..'Sun'
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function beforeCutoff(nowMinutes, cutoff /* 'HH:MM:SS' or 'HH:MM' */) {
  const [h, m] = String(cutoff).split(':').map(Number);
  return nowMinutes < h * 60 + m;
}

export function tierAvailability(settings, now = new Date()) {
  const { weekday, minutes } = atlantaNow(now);
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const out = {};
  out.standard = settings.standard_active
    ? { available: true }
    : { available: false, reason: 'Temporarily unavailable' };
  for (const [tier, activeCol, cutoffCol] of [
    ['rush', 'rush_active', 'cutoff_rush'],
    ['hot_rush', 'hot_rush_active', 'cutoff_hot_rush'],
  ]) {
    if (!settings[activeCol]) out[tier] = { available: false, reason: 'Temporarily unavailable' };
    else if (weekend) out[tier] = { available: false, reason: 'Mon–Fri only' };
    else if (!beforeCutoff(minutes, settings[cutoffCol])) {
      out[tier] = { available: false, reason: 'Past today\'s cutoff — available again tomorrow' };
    } else out[tier] = { available: true };
  }
  return out;
}

export function priceCents(settings, lengthFt, tier) {
  const ft = Math.ceil(Number(lengthFt));
  if (!Number.isFinite(ft) || ft < settings.min_ft || ft > settings.max_ft) {
    throw new Error('invalid length');
  }
  const rate = {
    standard: settings.rate_standard_cents,
    rush: settings.rate_rush_cents,
    hot_rush: settings.rate_hot_rush_cents,
  }[tier];
  // == null (not falsy) so a legitimately-configured 0 rate still prices —
  // only an unrecognized tier key should throw.
  if (rate == null) throw new Error('invalid tier');
  return ft * rate;
}

router.get('/config', async (req, res, next) => {
  try {
    const s = await loadSettings();
    res.json({
      rates: { standard: s.rate_standard_cents, rush: s.rate_rush_cents, hot_rush: s.rate_hot_rush_cents },
      tiers: tierAvailability(s),
      min_ft: s.min_ft,
      max_ft: s.max_ft,
      shipping_flat_cents: s.shipping_flat_cents,
      promises: tierPromises(s),
    });
  } catch (err) { next(err); }
});

const upload = multer({
  dest: '/tmp/gangsheet-uploads',
  limits: { fileSize: 100 * 1024 * 1024 },
  // Reject non-PNG uploads before they ever hit disk. cb(null, false) skips
  // the file silently (no error thrown) — the !req.file check below turns
  // that into a clear 400.
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'image/png'),
});

// Abuse-surface rate limits — this route accepts anonymous multipart
// uploads and creates real Stripe Checkout sessions, so it's a target for
// both storage-filling and checkout-spam abuse. Pattern copied from
// server/routes/deepseek.js's publicLimiter/adminLimiter.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please try again in a few minutes.' },
});
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

// PNG dimensions live in the IHDR chunk: bytes 16-19 width, 20-23 height
// (big-endian), after the 8-byte signature + 4-byte length + 'IHDR'.
// Parsing the header directly avoids an image-processing dependency.
function pngDimensions(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

router.post('/upload', uploadLimiter, upload.single('file'), async (req, res, next) => {
  const tmpPath = req.file?.path;
  try {
    // fileFilter above silently drops non-PNG mimetypes (cb(null, false)),
    // so this also covers "wrong file type" not just "nothing sent".
    if (!req.file) return res.status(400).json({ error: 'File must be a PNG (or nothing was uploaded)' });
    // uploadObject() (server/services/spaces.js:51) only accepts a Buffer or
    // base64 data URL for `body` — no stream support. 100 MB max upload fits
    // comfortably in droplet RAM, so we read the whole tmp file into a
    // Buffer here rather than streaming it.
    const fileBuf = fs.readFileSync(tmpPath);
    const dims = pngDimensions(fileBuf.subarray(0, 24));
    if (!dims) return res.status(400).json({ error: 'File must be a PNG' });
    // 22" x 300 DPI = 6,600 px, ±2% tolerance per spec.
    if (Math.abs(dims.width - 6600) > 132) {
      return res.status(400).json({ error: `Sheet must be 6,600 px wide (22" at 300 DPI); got ${dims.width} px` });
    }
    // Reject up front if the file is taller than the shop's max sheet length
    // even with the checkout bump-to-max-length suggestion applied — letting
    // it upload just to dead-end the customer at checkout isn't actionable.
    const settings = await loadSettings();
    if (dims.height > settings.max_ft * 3600 * 1.02) {
      return res.status(400).json({
        error: `Your file is ${Math.ceil(dims.height / 3600)} ft long — our max sheet is ${settings.max_ft} ft. Split it into two sheets.`,
      });
    }
    // Embed the server-parsed dims directly in the key so /checkout can
    // derive width/height from the key itself instead of trusting whatever
    // the client claims in the checkout request body (C1 fix).
    const key = `gangsheet-orders/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${dims.width}x${dims.height}.png`;
    // Customer production files must stay private — override uploadObject's
    // public-read default via its `acl` param.
    await uploadObject({ key, body: fileBuf, contentType: 'image/png', acl: 'private' });
    res.json({ file_key: key, width_px: dims.width, height_px: dims.height, bytes: req.file.size });
  } catch (err) { next(err); }
  finally { if (tmpPath) fs.unlink(tmpPath, () => {}); }
});

// Server-generated /upload keys embed the server-parsed PNG dims as
// <uuid>-<width>x<height>.png (see /upload above). Requiring that exact
// shape here — and reading width/height back out of it — means /checkout
// can never be handed a client-supplied height that doesn't match the
// actual uploaded file (C1).
const FILE_KEY_RE = /^gangsheet-orders\/[\w-]+\/[0-9a-f-]+-(\d{1,5})x(\d{1,6})\.png$/;
// Same loose shape the client checks before enabling the Checkout button —
// kept intentionally permissive (this is a "did you fat-finger it" check,
// not full RFC 5322 validation).
const EMAIL_RE = /.+@.+\..+/;

router.post('/checkout', checkoutLimiter, async (req, res, next) => {
  try {
    const { length_ft, tier, delivery = 'pickup', file_key,
            name, email, note, ship_address, attested } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    // Generous length caps — this route is anonymous and rate-limited but
    // still accepts free-text fields that end up in emails and the admin
    // queue, so cap them well short of anything that could bloat storage
    // or a Stripe product_data field.
    if (typeof name === 'string' && name.length > 120) {
      return res.status(400).json({ error: 'That field is too long' });
    }
    if (email.length > 254) return res.status(400).json({ error: 'That field is too long' });
    if (typeof note === 'string' && note.length > 2000) {
      return res.status(400).json({ error: 'That field is too long' });
    }
    if (ship_address && typeof ship_address === 'object') {
      for (const v of Object.values(ship_address)) {
        if (typeof v === 'string' && v.length > 120) {
          return res.status(400).json({ error: 'That field is too long' });
        }
      }
    }
    const s = await loadSettings();
    if (!['standard', 'rush', 'hot_rush'].includes(tier)) {
      return res.status(400).json({ error: 'Pick a turnaround option' });
    }
    const avail = tierAvailability(s)[tier];
    if (!avail.available) {
      return res.status(400).json({ error: `That turnaround isn't available right now (${avail.reason}).` });
    }
    if (!['pickup', 'ship'].includes(delivery)) return res.status(400).json({ error: 'Invalid delivery option' });
    const keyMatch = typeof file_key === 'string' ? file_key.match(FILE_KEY_RE) : null;
    if (!keyMatch) {
      return res.status(400).json({ error: 'Upload your sheet first' });
    }
    // Regex capture groups are string|undefined in general, but both groups
    // here are non-optional (\d{1,5} / \d{1,6}, no `?`), so a successful
    // match guarantees both are present — Number() is safe without a
    // fallback branch.
    const fileWidthPx = Number(keyMatch[1]);
    const fileHeightPx = Number(keyMatch[2]);
    let cents;
    try { cents = priceCents(s, length_ft, tier); }
    catch { return res.status(400).json({ error: `Length must be ${s.min_ft}–${s.max_ft} ft` }); }
    // Height must fit the purchased length (1 ft = 3,600 px, +2% tolerance).
    // Uses the server-parsed height from the file key, never a client-sent
    // value — this is the price-integrity fix from the final review (C1).
    if (fileHeightPx > Math.ceil(length_ft) * 3600 * 1.02) {
      return res.status(400).json({ error: 'Your file is taller than the sheet length you picked — bump the length up' });
    }
    // Confirm the uploaded object actually exists in Spaces before creating
    // an order + Stripe session against it — otherwise a customer could
    // check out on a file_key from a prior session that was never uploaded
    // (or was cleaned up), and the admin queue would 404 on download.
    try {
      await getSpacesClient().send(new HeadObjectCommand({ Bucket: SPACES_BUCKET, Key: file_key }));
    } catch (headErr) {
      if (headErr.name === 'NotFound' || headErr.$metadata?.httpStatusCode === 404) {
        return res.status(400).json({ error: 'Upload your sheet first' });
      }
      throw headErr;
    }
    const shippingCents = delivery === 'ship' ? s.shipping_flat_cents : 0;

    const ins = await pool.query(
      `INSERT INTO gang_sheet_orders
        (customer_name, customer_email, length_ft, tier, price_cents, shipping_cents,
         delivery, ship_address, file_key, file_width_px, file_height_px, note, attested)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [name || null, email || null, Math.ceil(Number(length_ft)), tier, cents, shippingCents,
       delivery, ship_address ? JSON.stringify(ship_address) : null,
       file_key, fileWidthPx, fileHeightPx, note || null, attested === true],
    );
    const orderId = ins.rows[0].id;

    // Same DOMAIN env var + fallback that payments.js uses for its own
    // success_url/cancel_url construction — kept consistent so every
    // checkout flow in this app resolves against the same base URL.
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const tierLabel = { standard: 'Standard', rush: 'Rush', hot_rush: 'Hot Rush' }[tier];
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `DTF Gang Sheet 22in × ${Math.ceil(Number(length_ft))} ft — ${tierLabel}`,
          // Live copy — `s` (settings) is already loaded above for pricing,
          // so this reflects the same cutoffs /config and the emails show.
          description: tierPromises(s)[tier],
        },
        unit_amount: cents,
      },
      quantity: 1,
    }];
    if (shippingCents > 0) {
      lineItems.push({
        price_data: { currency: 'usd', product_data: { name: 'Shipping (flat)' }, unit_amount: shippingCents },
        quantity: 1,
      });
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: email || undefined,
      success_url: `${domain}/dtf/success?order=${orderId}`,
      cancel_url: `${domain}/dtf`,
      metadata: { gang_sheet_order_id: String(orderId) },
    }, { idempotencyKey: `gso-${orderId}` });
    await pool.query('UPDATE gang_sheet_orders SET stripe_session_id = $1 WHERE id = $2', [session.id, orderId]);
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// ── Admin: order queue, status transitions, private file download ─────────

const adminGuard = [authenticate, adminOnly];

router.get('/admin/settings', ...adminGuard, async (req, res, next) => {
  try {
    res.json(await loadSettings());
  } catch (err) { next(err); }
});

// Whitelist of [column, validator] pairs. The UPDATE is built by iterating
// this fixed array — column names never come from request input, so there's
// no string-interpolation-of-a-column-name injection surface, only
// parameterized values.
const SETTINGS_FIELDS = [
  ['rate_standard_cents', (v) => Number.isInteger(v) && v >= 0],
  ['rate_rush_cents', (v) => Number.isInteger(v) && v >= 0],
  ['rate_hot_rush_cents', (v) => Number.isInteger(v) && v >= 0],
  ['cutoff_rush', (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)],
  ['cutoff_hot_rush', (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)],
  ['min_ft', (v) => Number.isInteger(v) && v >= 1 && v <= 40],
  ['max_ft', (v) => Number.isInteger(v) && v >= 1 && v <= 40],
  ['shipping_flat_cents', (v) => Number.isInteger(v) && v >= 0],
  ['standard_active', (v) => typeof v === 'boolean'],
  ['rush_active', (v) => typeof v === 'boolean'],
  ['hot_rush_active', (v) => typeof v === 'boolean'],
];

router.patch('/admin/settings', ...adminGuard, async (req, res, next) => {
  try {
    const body = req.body || {};
    const setClauses = [];
    const values = [];
    for (const [field, isValid] of SETTINGS_FIELDS) {
      if (!(field in body)) continue;
      const value = body[field];
      if (!isValid(value)) {
        return res.status(400).json({ error: `Invalid value for ${field}` });
      }
      values.push(value);
      setClauses.push(`${field} = $${values.length}`);
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    // min_ft/max_ft are cross-validated against whichever of the two isn't
    // part of this PATCH (e.g. raising max_ft alone still has to clear the
    // existing min_ft).
    if ('min_ft' in body || 'max_ft' in body) {
      const current = await loadSettings();
      const nextMin = 'min_ft' in body ? body.min_ft : current.min_ft;
      const nextMax = 'max_ft' in body ? body.max_ft : current.max_ft;
      if (nextMin > nextMax) {
        return res.status(400).json({ error: 'min_ft must be ≤ max_ft' });
      }
    }
    setClauses.push('updated_at = now()');
    const { rows } = await pool.query(
      `UPDATE gang_sheet_store_settings SET ${setClauses.join(', ')} WHERE id = 1 RETURNING *`,
      values,
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/admin/orders', ...adminGuard, async (req, res, next) => {
  try {
    const openOnly = (req.query.status || 'open') !== 'all';
    const { rows } = await pool.query(
      `SELECT * FROM gang_sheet_orders
        ${openOnly ? `WHERE status IN ('paid','in_production','ready')` : ''}
        ORDER BY (tier = 'hot_rush') DESC, (tier = 'rush') DESC, paid_at ASC NULLS LAST, created_at DESC
        LIMIT 200`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Allowed-from lists, keyed by the *target* status — i.e. ALLOWED_FROM.ready
// is every status you're allowed to mark 'ready' starting from. There is no
// entry for 'paid': that transition only ever happens from the Stripe
// webhook (server/routes/payments.js), never through this admin endpoint.
const ALLOWED_FROM = {
  canceled: ['pending_payment', 'paid', 'in_production', 'ready'],
  in_production: ['paid'],
  ready: ['paid', 'in_production'],
  completed: ['ready'],
};
router.patch('/admin/orders/:id', ...adminGuard, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const allowedFrom = ALLOWED_FROM[status];
    if (!allowedFrom) return res.status(400).json({ error: 'Invalid status' });
    // Single UPDATE...WHERE status = ANY(allowed) so the check-and-set is
    // atomic — no TOCTOU window between reading the current status and
    // writing the new one under concurrent admin clicks.
    const { rows } = await pool.query(
      `UPDATE gang_sheet_orders SET status = $1,
         ready_at = CASE WHEN $1 = 'ready' THEN now() ELSE ready_at END,
         completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $2 AND status = ANY($3) RETURNING *`,
      [status, req.params.id, allowedFrom],
    );
    if (!rows[0]) {
      // The UPDATE matched nothing — either the order doesn't exist, or it
      // exists but isn't in an allowed source status. Look it up once more
      // to tell those two cases apart and give a specific error either way.
      const { rows: existing } = await pool.query('SELECT status FROM gang_sheet_orders WHERE id = $1', [req.params.id]);
      if (!existing[0]) return res.status(404).json({ error: 'Order not found' });
      return res.status(400).json({ error: `Can't go from ${existing[0].status} to ${status}` });
    }
    if (status === 'ready' && rows[0].customer_email) {
      sendGangSheetReadyToCustomer({ order: rows[0] })
        .catch((e) => console.error('[dtf-store] ready email failed:', e.message));
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/admin/orders/:id/file', ...adminGuard, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT file_key FROM gang_sheet_orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    const obj = await getSpacesClient().send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: rows[0].file_key }));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="order-${req.params.id}.png"`);
    // A mid-stream error from the Spaces read (network blip, connection
    // reset) must not crash the process — destroy the response instead of
    // letting the unhandled stream error propagate. Also stop reading from
    // Spaces if the client disconnects early (closed tab, aborted download).
    obj.Body.on('error', (e) => {
      console.error('[dtf-store] download stream error:', e.message);
      res.destroy(e);
    });
    res.on('close', () => {
      if (typeof obj.Body.destroy === 'function') obj.Body.destroy();
    });
    obj.Body.pipe(res);
  } catch (err) { next(err); }
});

// Router-level error handler — catches Multer errors thrown by the
// upload.single('file') middleware (oversized file, etc.) and turns them
// into a friendly 400 instead of falling through to the app's generic
// error handler. Must be registered after all routes.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is over the 100 MB limit — flatten layers or split the sheet in two.'
        : 'Upload failed — try again.',
    });
  }
  next(err);
});

export default router;
