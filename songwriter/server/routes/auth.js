import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../db.js';
import { signUserToken, authenticate } from '../middleware/auth.js';

const router = Router();

// Register Google strategy lazily — env vars aren't available at import time
// because ES module imports hoist above dotenv.config().
let strategyRegistered = false;
function ensureStrategy() {
  if (strategyRegistered) return;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.CLIENT_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;
          const avatar = profile.photos?.[0]?.value;

          if (!email) return done(new Error('Google account has no email'));

          const { rows } = await pool.query(
            `INSERT INTO users (google_id, email, name, avatar_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (google_id) DO UPDATE
               SET email = EXCLUDED.email,
                   name = EXCLUDED.name,
                   avatar_url = EXCLUDED.avatar_url,
                   last_login_at = NOW()
             RETURNING *`,
            [googleId, email, name, avatar]
          );
          done(null, rows[0]);
        } catch (err) {
          done(err);
        }
      }
    )
  );
  strategyRegistered = true;
}

// Start OAuth flow
router.get('/google', (req, res, next) => {
  ensureStrategy();
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// OAuth callback — issue JWT cookie, redirect to client
router.get('/google/callback', (req, res, next) => {
  ensureStrategy();
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/?auth=failed`,
  })(req, res, (err) => {
    if (err) return next(err);
    const token = signUserToken(req.user);
    res.cookie('sw_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${process.env.CLIENT_URL}/app`);
  });
});

// Who am I?
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, avatar_url FROM users WHERE id = $1',
    [req.user.id]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.post('/logout', (_req, res) => {
  res.clearCookie('sw_token');
  res.json({ ok: true });
});

export default router;
