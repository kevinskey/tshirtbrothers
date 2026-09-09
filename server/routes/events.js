// First-party activity events — see migrations/activity_events.sql.
//
// POST /api/events is public (visitors aren't logged in) and fire-and-
// forget: it never returns an error body worth probing, validates the
// event name against a strict shape, and is rate-limited hard enough that
// it's useless for abuse but generous enough for real browsing.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';

const router = Router();

const EVENT_RE = /^[a-z0-9_]{2,40}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{2,24}$/;

const eventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: false,
  legacyHeaders: false,
  message: { ok: true }, // even the limiter answers ok — nothing to probe
});

router.post('/', eventsLimiter, async (req, res) => {
  // Always answer ok immediately; the insert is best-effort.
  res.json({ ok: true });
  try {
    const { event, email, anon_id, path, data } = req.body || {};
    if (typeof event !== 'string' || !EVENT_RE.test(event)) return;

    // Attach the account if a valid JWT came along (optional).
    let userId = null;
    let jwtEmail = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        userId = payload.id ?? null;
        jwtEmail = payload.email ?? null;
      } catch { /* anonymous is fine */ }
    }

    const cleanEmail = jwtEmail
      || (typeof email === 'string' && EMAIL_RE.test(email.trim()) ? email.trim() : null);
    const cleanAnon = typeof anon_id === 'string' ? anon_id.slice(0, 64) : null;
    const cleanPath = typeof path === 'string' ? path.slice(0, 200) : null;
    let cleanData = null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const s = JSON.stringify(data);
      if (s.length <= 2000) cleanData = s;
    }

    await pool.query(
      `INSERT INTO activity_events (event, email, user_id, anon_id, path, data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [event, cleanEmail, userId, cleanAnon, cleanPath, cleanData],
    );
  } catch (err) {
    console.error('[events] insert failed:', err.message);
  }
});

// Server-side helper for routes that KNOW an important thing happened
// (order paid, quote submitted) regardless of whether the client tracker
// ran. Best-effort by design.
export async function recordActivity({ event, email = null, userId = null, data = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_events (event, email, user_id, data)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [event, email, userId, data ? JSON.stringify(data) : null],
    );
  } catch (err) {
    console.error('[events] recordActivity failed:', err.message);
  }
}

export default router;
