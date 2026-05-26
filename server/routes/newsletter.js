// Newsletter subscription endpoint. Captures emails from the footer
// signup so we can build a marketing list in Resend later. No double
// opt-in yet — keeping the bar low while the list bootstraps.

import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.post('/subscribe', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }
    // Lowercase the email so casing collisions don't create duplicates.
    const cleanEmail = email.trim().toLowerCase();
    const cleanSource = (typeof source === 'string' ? source : '').slice(0, 100) || 'footer';
    // Upsert: bringing the row back if it was previously unsubscribed.
    await pool.query(
      `INSERT INTO newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE
         SET source = COALESCE(newsletter_subscribers.source, EXCLUDED.source),
             unsubscribed_at = NULL`,
      [cleanEmail, cleanSource],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[newsletter] subscribe failed:', err.message);
    res.status(500).json({ error: 'Could not subscribe right now.' });
  }
});

export default router;
