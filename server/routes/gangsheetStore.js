import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
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
// /compose does real server-side work per request (fetch up to 40 images,
// run them through sharp, write a file to Spaces) — same abuse-surface
// shape as /upload, so it gets the same 10/15min-per-IP budget.
const composeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

// ── Customer: gang sheet builder (own sheets only) ─────────────────────────
// Requires login (any role) but NOT adminOnly — every query below is scoped
// created_by = req.user.id server-side, same idiom the admin routes below
// use for the columns/COALESCE shape but with an added ownership predicate.

const SHEET_CAP = 20;

router.get('/sheets', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sheet_length_ft, status, updated_at
       FROM gang_sheets WHERE created_by = $1
       ORDER BY updated_at DESC LIMIT 20`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/sheets', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM gang_sheets WHERE created_by = $1',
      [req.user.id],
    );
    if (countRows[0].n >= SHEET_CAP) {
      return res.status(400).json({ error: 'Sheet limit reached — delete an old sheet first' });
    }
    const { rows } = await pool.query(
      `INSERT INTO gang_sheets (name, created_by) VALUES ($1, $2) RETURNING *`,
      [name || 'Untitled Sheet', req.user.id],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/sheets/:id', authenticate, async (req, res, next) => {
  try {
    // M4: a non-integer id can never match a row — reject before it reaches
    // the query instead of letting Postgres throw on the int cast.
    if (!Number.isInteger(Number(req.params.id))) return res.status(404).json({ error: 'Sheet not found' });
    // Same 404 whether the row doesn't exist or belongs to someone else —
    // no existence leak across accounts.
    const { rows } = await pool.query(
      'SELECT * FROM gang_sheets WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/sheets/:id', authenticate, async (req, res, next) => {
  try {
    // M4: a non-integer id can never match a row — reject before it reaches
    // the query instead of letting Postgres throw on the int cast.
    if (!Number.isInteger(Number(req.params.id))) return res.status(404).json({ error: 'Sheet not found' });
    const { name, sheet_length_ft, pricing_tier, total_cost, layout_json, designs, status } = req.body || {};
    if (sheet_length_ft !== undefined && sheet_length_ft !== null) {
      const n = Number(sheet_length_ft);
      if (!Number.isFinite(n) || n < 1 || n > 20) {
        return res.status(400).json({ error: 'Sheet length must be a number between 1 and 20 ft' });
      }
    }
    // M5: allowlist status/pricing_tier and cap name length before they hit
    // the UPDATE — these all come straight from client-side builder state.
    if (status !== undefined && status !== null && !['draft', 'exported'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (
      pricing_tier !== undefined && pricing_tier !== null
      && !['standard', 'rush', 'hotRush', 'hot_rush'].includes(pricing_tier)
    ) {
      return res.status(400).json({ error: 'Invalid pricing tier' });
    }
    if (typeof name === 'string' && name.length > 120) {
      return res.status(400).json({ error: 'Name is too long (max 120 characters)' });
    }
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
      WHERE id = $8 AND created_by = $9 RETURNING *`,
      [name, sheet_length_ft, pricing_tier, total_cost,
       layout_json ? JSON.stringify(layout_json) : null,
       designs ? JSON.stringify(designs) : null,
       status, req.params.id, req.user.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/sheets/:id', authenticate, async (req, res, next) => {
  try {
    // M4: a non-integer id can never match a row — reject before it reaches
    // the query instead of letting Postgres throw on the int cast.
    if (!Number.isInteger(Number(req.params.id))) return res.status(404).json({ error: 'Sheet not found' });
    const { rows } = await pool.query(
      'DELETE FROM gang_sheets WHERE id = $1 AND created_by = $2 RETURNING id',
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sheet not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Server-side sheet composition (POST /compose) ──────────────────────────
// iPhone checkouts were failing 100% of the time: the customer builder used
// to export the full sheet client-side via canvas.toDataURL() at 6,600px ×
// (up to) 39,600px — 261M+ px². iOS Safari's canvas backing-store limit sits
// well below that (it silently produces a blank/truncated image, which the
// TOO_LARGE heuristic in generateFullResExport() then caught as an error on
// every iPhone, always). This route moves the pixel work server-side: the
// phone sends placement JSON (where each design goes), not pixels.
//
// PLACEMENT CONTRACT — must match GangSheetBuilder.tsx's handleCheckoutSheet
// placement-builder exactly (documented there too):
//   Each placement's left/top/width/height is the design's FINAL on-sheet
//   bounding box — i.e. the box it visually occupies on the sheet, AFTER
//   any rotation. `rotation` (0/90/180/270, default 0) describes how the
//   SOURCE image at image_url must be turned to land in that box.
//   In this app rotation is never a live fabric.js transform — rotateImage90
//   bakes the turn into the image bitmap itself (rotates the canvas, then
//   re-uploads) before the object ever goes on the sheet — so every
//   placement the current client sends has rotation: 0. The field is kept
//   in the contract only for forward-compatibility (e.g. a future on-canvas
//   rotate handle). For rotation 90/270 we resize the source into the
//   PRE-rotation box (height×width, swapped) and then rotate it — sharp's
//   rotate() on an exact multiple of 90° swaps width/height with no
//   resampling, so the output lands as exactly width×height, matching the
//   requested final box precisely.
//
// SSRF guard: this route fetches attacker-influenced URLs (image_url comes
// straight from the request body), so it will ONLY ever fetch https URLs
// whose host is one of our own Spaces hosts — see isAllowedDesignImageUrl.
// Anything else (localhost, internal IPs, other domains) is rejected before
// any network call is made.
const SPACES_CDN_HOST = 'tshirtbrothers.atl1.cdn.digitaloceanspaces.com';
const SPACES_ORIGIN_HOST = 'atl1.digitaloceanspaces.com';
function isAllowedDesignImageUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.hostname === SPACES_CDN_HOST) return true;
  if (u.hostname === SPACES_ORIGIN_HOST && u.pathname.startsWith('/tshirtbrothers/')) return true;
  return false;
}

const COMPOSE_MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// Streams the response body so we can abort the moment a design image
// exceeds the per-image size cap, instead of buffering an arbitrarily large
// body into memory first and checking after the fact.
async function fetchDesignImageBuffer(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`design image fetch failed (${resp.status})`);
  const declaredLen = Number(resp.headers.get('content-length'));
  if (Number.isFinite(declaredLen) && declaredLen > COMPOSE_MAX_IMAGE_BYTES) {
    throw new Error('design image too large');
  }
  if (!resp.body) throw new Error('design image fetch returned no body');
  const reader = resp.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > COMPOSE_MAX_IMAGE_BYTES) {
      reader.cancel().catch(() => {});
      throw new Error('design image too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

router.post('/compose', authenticate, composeLimiter, async (req, res, next) => {
  try {
    const { placements } = req.body || {};
    if (!Array.isArray(placements) || placements.length < 1 || placements.length > 400) {
      return res.status(400).json({ error: 'Send between 1 and 400 placements' });
    }

    const cleaned = [];
    const uniqueUrls = new Set();
    for (const raw of placements) {
      if (!raw || typeof raw !== 'object') {
        return res.status(400).json({ error: 'Invalid placement' });
      }
      const { image_url: imageUrl, left, top, width, height } = raw;
      const rotation = raw.rotation === undefined || raw.rotation === null ? 0 : raw.rotation;
      if (typeof imageUrl !== 'string' || !isAllowedDesignImageUrl(imageUrl)) {
        return res.status(400).json({ error: 'Invalid design image URL' });
      }
      if (![0, 90, 180, 270].includes(rotation)) {
        return res.status(400).json({ error: 'Invalid rotation' });
      }
      if (typeof left !== 'number' || !Number.isFinite(left) || left < 0) {
        return res.status(400).json({ error: 'Invalid placement position' });
      }
      if (typeof top !== 'number' || !Number.isFinite(top) || top < 0) {
        return res.status(400).json({ error: 'Invalid placement position' });
      }
      if (typeof width !== 'number' || !Number.isFinite(width) || width < 30 || width > 6600) {
        return res.status(400).json({ error: 'Invalid placement size' });
      }
      if (typeof height !== 'number' || !Number.isFinite(height) || height < 30 || height > 6600) {
        return res.status(400).json({ error: 'Invalid placement size' });
      }
      const l = Math.round(left);
      const t = Math.round(top);
      const w = Math.round(width);
      const h = Math.round(height);
      if (l + w > 6600) {
        return res.status(400).json({ error: 'A design extends past the sheet width' });
      }
      uniqueUrls.add(imageUrl);
      cleaned.push({ imageUrl, left: l, top: t, width: w, height: h, rotation });
    }
    if (uniqueUrls.size > 40) {
      return res.status(400).json({ error: 'Too many different design images (max 40)' });
    }

    const settings = await loadSettings();
    const maxHeightPx = settings.max_ft * 3600;
    const maxBottom = cleaned.reduce((m, p) => Math.max(m, p.top + p.height), 0);
    const neededHeight = maxBottom + 30;
    if (neededHeight > maxHeightPx) {
      return res.status(400).json({
        error: `Your sheet is ${Math.ceil(neededHeight / 3600)} ft long — our max sheet is ${settings.max_ft} ft. Split it into two sheets.`,
      });
    }
    const sheetHeightPx = Math.max(neededHeight, 3600);

    // Fetch each unique source image exactly once, even if it's placed
    // multiple times (quantity > 1 on the same design).
    const bufferByUrl = new Map();
    try {
      for (const url of uniqueUrls) {
        bufferByUrl.set(url, await fetchDesignImageBuffer(url));
      }
    } catch (err) {
      console.error('[dtf-store] compose: design image fetch failed:', err.message);
      return res.status(400).json({ error: 'Could not fetch one of your design images — try re-adding it' });
    }

    let composeInputs;
    try {
      composeInputs = await Promise.all(cleaned.map(async (p) => {
        const srcBuf = bufferByUrl.get(p.imageUrl);
        // Contract: width/height is the box AFTER rotation. For 90/270 we
        // resize into the swapped (pre-rotation) box, then rotate — see the
        // PLACEMENT CONTRACT comment above.
        const swapped = p.rotation === 90 || p.rotation === 270;
        const resizeWidth = swapped ? p.height : p.width;
        const resizeHeight = swapped ? p.width : p.height;
        let img = sharp(srcBuf).resize(resizeWidth, resizeHeight, { fit: 'fill' });
        if (p.rotation) img = img.rotate(p.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        const buf = await img.png().toBuffer();
        return { input: buf, left: p.left, top: p.top };
      }));
    } catch (err) {
      console.error('[dtf-store] compose: input processing failed:', err.message);
      return res.status(500).json({ error: 'Could not compose your sheet — try again' });
    }

    let composedBuf;
    try {
      composedBuf = await sharp({
        create: {
          width: 6600,
          height: sheetHeightPx,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
        // Sheets can run up to max_ft (admin-configurable, up to 40 ft =
        // 144,000px tall = 950M+ px²) — well past sharp's default
        // limitInputPixels (~268M), which would otherwise reject the
        // create() canvas itself before compositing ever runs.
        limitInputPixels: 7000 * 80000,
      }).composite(composeInputs).png().toBuffer();
    } catch (err) {
      console.error('[dtf-store] compose: composite failed:', err.message);
      return res.status(500).json({ error: 'Could not compose your sheet — try again' });
    }

    // From here down: EXACTLY the /upload pipeline (dims-from-PNG-header,
    // key shape, private upload, response shape) so /checkout's FILE_KEY_RE
    // and file_height_px trust boundary work identically regardless of
    // which route produced the file.
    const dims = pngDimensions(composedBuf.subarray(0, 24));
    if (!dims) return res.status(500).json({ error: 'Could not compose your sheet — try again' });
    const key = `gangsheet-orders/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${dims.width}x${dims.height}.png`;
    await uploadObject({ key, body: composedBuf, contentType: 'image/png', acl: 'private' });
    res.json({ file_key: key, width_px: dims.width, height_px: dims.height, bytes: composedBuf.length });
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
