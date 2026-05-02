/**
 * Client error sink. Receives error reports from the new Fabric renderer
 * (POSTed by the client wrapper at client/src/lib/fabric/reportClientError.ts)
 * and persists them to the `fabric_errors` table.
 *
 * Design notes:
 *   - Auth is OPTIONAL. A crash on a public /design page from a guest user
 *     is still worth recording. If a JWT is present and valid, we attribute
 *     to the user; otherwise user_id stays null.
 *   - The route is intentionally permissive on shape — any extra fields the
 *     client sends are ignored, missing fields default to null. We never
 *     500 on bad payloads (a broken error reporter that retries because of
 *     500s is the worst kind of bug).
 *   - Rate limiting is enforced client-side (per-session counter +
 *     per-message dedupe). The server applies a hard length cap on every
 *     field as a defense-in-depth check; if the client wrapper is bypassed
 *     by a malicious client, the worst they can do is fill the table with
 *     short rows.
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = Router();

// Optional-auth middleware. If a Bearer token is present and valid, attach
// req.user. Otherwise continue with req.user = null. Never 401.
function softAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

// Hard caps. The client wrapper truncates to these already; we re-truncate
// here so a bypassed client can't blow the table up.
const CAP = {
  tag: 64,
  message: 500,
  stack: 500,
  objectTypes: 200,
  userAgent: 500,
  url: 500,
};

function trunc(s, n) {
  if (typeof s !== 'string') return null;
  return s.length > n ? s.slice(0, n) : s;
}

router.post('/', softAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const userId = req.user?.id ?? null;
    const tag = trunc(body.tag, CAP.tag);
    if (!tag) return res.status(204).end();
    const message = trunc(body.message, CAP.message) ?? '(no message)';
    const stack = trunc(body.stack, CAP.stack);
    const objectCount = Number.isFinite(body.objectCount) ? body.objectCount : null;
    const objectTypes = trunc(body.objectTypes, CAP.objectTypes);
    const userAgent = trunc(req.headers['user-agent'], CAP.userAgent);
    const url = trunc(body.url, CAP.url);

    await pool.query(
      `INSERT INTO fabric_errors
        (user_id, tag, message, stack, object_count, object_types, user_agent, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, tag, message, stack, objectCount, objectTypes, userAgent, url],
    );
    res.status(204).end();
  } catch (err) {
    // Never bubble — a broken error reporter that 500s causes the client
    // to retry, which spams logs. Eat it and 204.
    console.error('client-errors insert failed:', err.message);
    res.status(204).end();
  }
});

export default router;
