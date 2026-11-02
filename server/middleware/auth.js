import jwt from 'jsonwebtoken';
import pool from '../db.js';

// Login tokens live for 90 days and carry no server-side session, so closing
// an account (DELETE /api/auth/me) would otherwise leave the customer's last
// token working until it expired. Check the row — but only once a minute per
// user, so the common case stays a pure JWT verify.
const CLOSED_CHECK_TTL_MS = 60_000;
const recentlyChecked = new Map(); // user id -> timestamp of last clean check

async function accountIsClosed(userId) {
  const last = recentlyChecked.get(userId);
  if (last && Date.now() - last < CLOSED_CHECK_TTL_MS) return false;
  try {
    const { rows } = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [userId]);
    if (rows.length > 0 && rows[0].deleted_at) return true;
    recentlyChecked.set(userId, Date.now());
    // Bound the map; these are cheap to rebuild.
    if (recentlyChecked.size > 5000) recentlyChecked.clear();
    return false;
  } catch (err) {
    // Fail open: a DB hiccup — or this running before
    // migrations/account_deletion_v1.sql adds the column — must not log the
    // whole storefront out.
    console.warn(`[auth] closed-account check skipped: ${err.message}`);
    return false;
  }
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (await accountIsClosed(decoded.id)) {
    return res.status(401).json({ error: 'This account has been closed' });
  }

  req.user = decoded;
  next();
}

export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
