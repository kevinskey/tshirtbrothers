import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── Bot defenses (2026-09-09 signup-spam incident) ────────────────────────
// A drip bot was creating an account every 20-45 min with gibberish names
// and harvested real emails. Three layers:
//   1. per-IP rate limit on /register
//   2. a signup token the auth PAGE fetches via JS — bots POSTing straight
//      to the API without loading the page don't have one
//   3. /register answers identically whether the email is new or already
//      registered, so the endpoint can't be used to validate email lists
//      (the client signs in right after, which works only for real owners)

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signups from this network — try again later.' },
});

// HMAC over a timestamp; no server-side state. Valid from 3s (a human takes
// longer than that between page load and submit; a naive bot doesn't) to 2h.
const signupTokenSecret = () =>
  crypto.createHash('sha256').update(`signup:${process.env.JWT_SECRET}`).digest();
const signSignupTs = (ts) =>
  crypto.createHmac('sha256', signupTokenSecret()).update(String(ts)).digest('hex');

router.get('/signup-token', (req, res) => {
  const ts = Date.now();
  res.json({ token: `${ts}.${signSignupTs(ts)}` });
});

function signupTokenValid(token) {
  if (typeof token !== 'string') return false;
  const [tsRaw, mac] = token.split('.');
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || !mac) return false;
  const expected = signSignupTs(ts);
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  const age = Date.now() - ts;
  return age >= 3_000 && age <= 2 * 60 * 60 * 1000;
}

// Gmail ignores dots and everything after '+' in the local part, so
// k.lucy+x@gmail.com and klucy@gmail.com are the same inbox. The 2026-09
// bots lean on this to mint "unique" emails. Returns the canonical form
// for gmail addresses, lowercased passthrough for everything else.
function normalizeEmail(email) {
  const lower = String(email).toLowerCase().trim();
  const at = lower.lastIndexOf('@');
  if (at === -1) return lower;
  let local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return lower;
}

function countDots(email) {
  const local = String(email).split('@')[0] ?? '';
  return (local.match(/\./g) || []).length;
}

// The register page computes sha256(`${signup_token}:${email.toLowerCase()}`)
// in browser JS (WebCrypto) and sends it as signup_proof. A script that only
// replays raw HTTP requests has to re-implement this to get a row inserted —
// and because failures are swallowed (see below), it gets no signal that
// anything is wrong.
function signupProofValid(token, email, proof) {
  if (typeof proof !== 'string' || !/^[0-9a-f]{64}$/.test(proof)) return false;
  const expected = crypto.createHash('sha256')
    .update(`${token}:${String(email).toLowerCase()}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(expected));
}

// POST /register — always responds { ok: true } on a well-formed request,
// whether or not the email already existed. The client immediately calls
// /login with the same credentials, which succeeds only for a genuinely new
// account (or the real owner typing their real password).
//
// Bot-signal failures below are swallowed: respond { ok: true } and insert
// nothing. The 2026-09 bot wave adapted to every defense that returned an
// error (400 "token too fresh" → they added a 5s sleep), so the one thing
// we don't give them anymore is feedback.
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { email, password, name, phone, signup_token, signup_proof, company_website } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!signupTokenValid(signup_token)) {
      return res.status(400).json({ error: 'Could not verify your signup — refresh the page and try again.' });
    }

    // ── Silent bot filters — { ok: true }, no insert, no feedback ──────
    // company_website is a honeypot: hidden field the real form never fills.
    const swallow = (reason) => {
      console.warn(`[auth] register swallowed (${reason}): ${email} from ${req.ip}`);
      return res.status(200).json({ ok: true });
    };
    if (typeof company_website === 'string' && company_website.trim() !== '') {
      return swallow('honeypot');
    }
    if (!signupProofValid(signup_token, email, signup_proof)) {
      return swallow('bad proof');
    }
    // Gmail dot-alias abuse: 3+ dots in the local part is a bot tell
    // (c.o.s.tar.i.s.67@…), and a normalized-form collision means this
    // inbox already has an account under another spelling.
    const isGmail = /@(gmail|googlemail)\.com$/i.test(String(email).trim());
    if (isGmail && countDots(email) >= 3) {
      return swallow('gmail dot alias');
    }
    if (isGmail) {
      const normalizedLocal = normalizeEmail(email).split('@')[0];
      const collision = await pool.query(
        `SELECT 1 FROM users
          WHERE lower(email) ~ '@(gmail|googlemail)\\.com$'
            AND regexp_replace(split_part(split_part(lower(email), '@', 1), '+', 1), '\\.', '', 'g') = $1
          LIMIT 1`,
        [normalizedLocal],
      );
      if (collision.rows.length > 0) return swallow('gmail alias collision');
    }

    // Hash BEFORE the existence check so response timing is identical for
    // new and already-registered emails.
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (email, password_hash, name, phone) VALUES ($1, $2, $3, $4)',
        [email, password_hash, name || null, phone || null]
      );
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    });
  } catch (err) {
    next(err);
  }
});

// GET /me - Get current user profile
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, phone, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /me - Update profile
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const { rows } = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3 RETURNING id, email, name, phone',
      [name, phone, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /me/password - Change password
router.put('/me/password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /me/quotes - Customer's own quotes
router.get('/me/quotes', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, product_name, quantity, status, estimated_price, deposit_amount, created_at, date_needed, accepted_at, accept_token
       FROM quotes WHERE customer_email = (SELECT email FROM users WHERE id = $1)
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /me/designs - Customer's saved designs
router.get('/me/designs', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, product_name, thumbnail, mockup_url, created_at
       FROM saved_designs WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
