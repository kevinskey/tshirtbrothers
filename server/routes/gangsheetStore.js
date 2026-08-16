import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import Stripe from 'stripe';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';

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

// Current shop-local wall clock. The droplet runs UTC; the shop is Atlanta.
function atlantaNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
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
  if (!rate) throw new Error('invalid tier');
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
      promises: TIER_PROMISES,
    });
  } catch (err) { next(err); }
});

const upload = multer({
  dest: '/tmp/gangsheet-uploads',
  limits: { fileSize: 100 * 1024 * 1024 },
});

// PNG dimensions live in the IHDR chunk: bytes 16-19 width, 20-23 height
// (big-endian), after the 8-byte signature + 4-byte length + 'IHDR'.
// Parsing the header directly avoids an image-processing dependency.
function pngDimensions(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

router.post('/upload', upload.single('file'), async (req, res, next) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
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
    const key = `gangsheet-orders/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
    // Customer production files must stay private — override uploadObject's
    // public-read default via its `acl` param.
    await uploadObject({ key, body: fileBuf, contentType: 'image/png', acl: 'private' });
    res.json({ file_key: key, width_px: dims.width, height_px: dims.height, bytes: req.file.size });
  } catch (err) { next(err); }
  finally { if (tmpPath) fs.unlink(tmpPath, () => {}); }
});

router.post('/checkout', async (req, res, next) => {
  try {
    const { length_ft, tier, delivery = 'pickup', file_key, width_px, height_px,
            name, email, note, ship_address } = req.body || {};
    const s = await loadSettings();
    if (!['standard', 'rush', 'hot_rush'].includes(tier)) {
      return res.status(400).json({ error: 'Pick a turnaround option' });
    }
    const avail = tierAvailability(s)[tier];
    if (!avail.available) {
      return res.status(400).json({ error: `That turnaround isn't available right now (${avail.reason}).` });
    }
    if (!['pickup', 'ship'].includes(delivery)) return res.status(400).json({ error: 'Invalid delivery option' });
    if (!file_key || !/^gangsheet-orders\/[\w-]+\/[\w-]+\.png$/.test(String(file_key))) {
      return res.status(400).json({ error: 'Upload your sheet first' });
    }
    let cents;
    try { cents = priceCents(s, length_ft, tier); }
    catch { return res.status(400).json({ error: `Length must be ${s.min_ft}–${s.max_ft} ft` }); }
    // Height must fit the purchased length (1 ft = 3,600 px, +2% tolerance).
    if (height_px && height_px > Math.ceil(length_ft) * 3600 * 1.02) {
      return res.status(400).json({ error: 'Your file is taller than the sheet length you picked — bump the length up' });
    }
    const shippingCents = delivery === 'ship' ? s.shipping_flat_cents : 0;

    const ins = await pool.query(
      `INSERT INTO gang_sheet_orders
        (customer_name, customer_email, length_ft, tier, price_cents, shipping_cents,
         delivery, ship_address, file_key, file_width_px, file_height_px, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [name || null, email || null, Math.ceil(Number(length_ft)), tier, cents, shippingCents,
       delivery, ship_address ? JSON.stringify(ship_address) : null,
       file_key, width_px || null, height_px || null, note || null],
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
          description: TIER_PROMISES[tier],
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
      line_items: lineItems,
      customer_email: email || undefined,
      success_url: `${domain}/dtf/success?order=${orderId}`,
      cancel_url: `${domain}/dtf`,
      metadata: { gang_sheet_order_id: String(orderId) },
    });
    await pool.query('UPDATE gang_sheet_orders SET stripe_session_id = $1 WHERE id = $2', [session.id, orderId]);
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

export default router;
