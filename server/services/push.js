// APNs push notifications for the iOS app, over raw HTTP/2 — no SDK dep.
//
// Configured by env (all required to send; everything no-ops loudly-but-
// harmlessly without them, same contract as the mailbox service):
//   APNS_KEY_PATH   path to the .p8 auth key from developer.apple.com → Keys
//   APNS_KEY_ID     the key's 10-char id
//   APNS_TEAM_ID    Apple team (AUJY92SA4D)
//   APNS_TOPIC      bundle id, default com.tshirtbrothers.app
//   APNS_PRODUCTION 'true' for App Store / TestFlight builds; unset = sandbox
//
// Tokens live in push_tokens (migrations/push_tokens.sql), registered by the
// app via POST /api/push/register. Tokens APNs reports as gone (410 /
// BadDeviceToken) are deleted so the table self-cleans.

import fs from 'fs';
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const TOPIC = process.env.APNS_TOPIC || 'com.tshirtbrothers.app';

export function pushConfigured() {
  return !!(process.env.APNS_KEY_PATH && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

function apnsHost() {
  return process.env.APNS_PRODUCTION === 'true'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

// APNs provider JWTs are valid 20–60 minutes; mint one and reuse for 45.
let cachedJwt = null;
let cachedJwtAt = 0;
function providerToken() {
  if (cachedJwt && Date.now() - cachedJwtAt < 45 * 60 * 1000) return cachedJwt;
  const key = fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8');
  cachedJwt = jwt.sign({}, key, {
    algorithm: 'ES256',
    issuer: process.env.APNS_TEAM_ID,
    keyid: process.env.APNS_KEY_ID,
  });
  cachedJwtAt = Date.now();
  return cachedJwt;
}

function sendToDevice(session, deviceToken, payload) {
  return new Promise((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });
    let body = '';
    let status = 0;
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve({ status, body }));
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.end(JSON.stringify(payload));
  });
}

// Core sender: push {title, body, data} to every device of the given users.
// Fire-and-forget safe — never throws, logs failures, prunes dead tokens.
export async function sendPush(userIds, { title, body, data }) {
  if (!pushConfigured() || !Array.isArray(userIds) || userIds.length === 0) return { sent: 0 };
  let rows;
  try {
    ({ rows } = await pool.query(
      'SELECT token FROM push_tokens WHERE user_id = ANY($1)',
      [userIds],
    ));
  } catch (e) {
    console.error('[push] token lookup failed:', e.message);
    return { sent: 0 };
  }
  if (rows.length === 0) return { sent: 0 };

  const payload = {
    aps: { alert: { title, body }, sound: 'default' },
    ...(data ? { data } : {}),
  };

  const session = http2.connect(apnsHost());
  session.on('error', (e) => console.error('[push] session error:', e.message));
  let sent = 0;
  try {
    for (const { token } of rows) {
      const res = await sendToDevice(session, token, payload);
      if (res.status === 200) { sent++; continue; }
      const reason = (() => { try { return JSON.parse(res.body).reason; } catch { return res.body; } })();
      if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
        await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]).catch(() => {});
      } else {
        console.error(`[push] APNs ${res.status} ${reason} for "${title}"`);
      }
    }
  } finally {
    session.close();
  }
  return { sent };
}

export async function sendPushToUser(userId, msg) {
  if (!userId) return { sent: 0 };
  return sendPush([Number(userId)], msg);
}

export async function sendPushToAdmins(msg) {
  try {
    const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
    return sendPush(rows.map((r) => r.id), msg);
  } catch (e) {
    console.error('[push] admin lookup failed:', e.message);
    return { sent: 0 };
  }
}
