// Group Stores — session middleware for group-admin dashboards.
//
// Group admins (school reps, choir officers, alumni chairs) log in via
// magic-link code emailed to their address, then get a bearer session
// token stored (hashed) in store_admin_sessions.
//
// This middleware validates the token and attaches:
//   req.store_admin  = { id, store_id, role, email, name }
//
// It also enforces the URL's :slug matches the session's store — a token
// scoped to one store can't be replayed against another.

import crypto from 'crypto';
import pool from '../db.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeAdminSession(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) return res.status(401).json({ error: 'Empty bearer token' });

    const tokenHash = hashToken(token);
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.store_id, s.admin_id, s.expires_at, s.revoked_at,
              a.email, a.name, a.role,
              st.slug AS store_slug, st.status AS store_status
         FROM store_admin_sessions s
         JOIN store_admins a       ON a.id  = s.admin_id
         JOIN stores       st      ON st.id = s.store_id
        WHERE s.token_hash = $1
        LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Invalid session' });
    if (row.revoked_at) return res.status(401).json({ error: 'Session revoked' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }
    if (row.store_status !== 'active') {
      return res.status(403).json({ error: 'Store is not active' });
    }

    const requestedSlug = req.params.slug;
    if (requestedSlug && requestedSlug !== row.store_slug) {
      return res.status(403).json({ error: 'Session does not authorize this store' });
    }

    req.store_admin = {
      id: row.admin_id,
      store_id: row.store_id,
      store_slug: row.store_slug,
      email: row.email,
      name: row.name,
      role: row.role,
    };
    next();
  } catch (err) { next(err); }
}

export function requireRole(...allowed) {
  return function (req, res, next) {
    if (!req.store_admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowed.includes(req.store_admin.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}

export function _hashToken(token) { return hashToken(token); }
