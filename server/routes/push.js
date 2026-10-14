// Push-notification device registration for the iOS app.
import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import { pushConfigured, sendPushToUser } from '../services/push.js';

const router = Router();

// POST /register — the app calls this on every launch with a signed-in
// user. Upsert keyed on token: a device changing hands re-points user_id.
router.post('/register', authenticate, async (req, res, next) => {
  try {
    const { token, platform } = req.body || {};
    if (!token || typeof token !== 'string' || token.length > 512) {
      return res.status(400).json({ error: 'token required' });
    }
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen = NOW()`,
      [req.user.id, token, platform === 'android' ? 'android' : 'ios'],
    );
    res.json({ success: true, pushConfigured: pushConfigured() });
  } catch (err) {
    next(err);
  }
});

// DELETE /register — sign-out: stop notifying this device.
router.delete('/register', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (token) await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /admin/test — send yourself a test push to verify the APNs pipeline.
router.post('/admin/test', authenticate, adminOnly, async (req, res, next) => {
  try {
    if (!pushConfigured()) {
      return res.status(503).json({ error: 'APNs not configured (APNS_KEY_PATH / APNS_KEY_ID / APNS_TEAM_ID)' });
    }
    const result = await sendPushToUser(req.user.id, {
      title: 'T-Shirt Brothers',
      body: 'Push notifications are working 🎉',
      data: { type: 'test' },
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
