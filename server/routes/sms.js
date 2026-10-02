// Two-way SMS with customers.
//
// Outbound: the admin hits "Text Customer" on a quote and we send through
// Twilio, logging the message against the quote.
// Inbound: Twilio POSTs the customer's reply to /api/sms/inbound (set this
// URL as the "A MESSAGE COMES IN" webhook on the TSB number). Replies land
// in sms_messages and show up in the same thread, so a conversation reads
// end to end inside the job it belongs to.
import { Router } from 'express';
import twilio from 'twilio';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { sendSMSOrThrow, sendSMS } from '../services/sms.js';

// Loose US numbers get +1; anything already in E.164 is left alone. Same
// rule the sender uses, so a thread keyed by phone matches both directions.
function toE164(value) {
  const t = String(value || '').trim();
  if (!t) return '';
  return t.startsWith('+') ? t : '+1' + t.replace(/\D/g, '');
}

// ── Public: Twilio inbound webhook ───────────────────────────────────
// The shop's Twilio number is shared with GleeWorld, whose
// receive-sms-notifications edge function turns a text from an authorized
// choir admin into member notifications ("@exec: ...", "@s1: ..."). Twilio
// only allows ONE inbound webhook per number, so this endpoint owns it and
// forwards a verbatim copy there — both systems keep working.
//
// Two rules fall out of that:
//   - A GleeWorld broadcast ("@exec: ...") is not a TSB customer message,
//     so it is forwarded but never logged into the Texts inbox.
//   - GleeWorld answers unauthorized senders with "❌ Unauthorized: your
//     number is not registered" — which is what every TSB customer is. We
//     swallow that reply and pass back only its real broadcast receipts.
const GLEEWORLD_SMS_URL = process.env.GLEEWORLD_SMS_FORWARD_URL
  || 'https://oopmlreysjzuxzylyheb.supabase.co/functions/v1/receive-sms-notifications';
const GLEEWORLD_BROADCAST_RE = /^@(exec|admin|s1|s2|a1|a2|pr):/i;

/** Forward the raw Twilio payload to GleeWorld. Returns its TwiML when that
 *  reply should reach the sender, else null. Never throws. */
async function forwardToGleeWorld(body) {
  if (!GLEEWORLD_SMS_URL) return null;
  try {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body || {})) form.append(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(GLEEWORLD_SMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    // Only a real broadcast receipt goes back to the sender. The
    // unauthorized bounce is GleeWorld telling a TSB customer they are not
    // a choir member — never send that to someone asking about shirts.
    if (res.ok && text.includes('<Message>') && !/Unauthorized/i.test(text)) return text;
    return null;
  } catch (err) {
    console.error('[sms] forward to GleeWorld failed:', err.message);
    return null;
  }
}

export const publicRouter = Router();

publicRouter.post('/inbound', async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Twilio signs every webhook. Refusing unsigned posts keeps anyone who
  // guesses the URL from injecting fake customer replies.
  if (authToken && process.env.TWILIO_SKIP_SIGNATURE !== '1') {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const signature = req.get('X-Twilio-Signature') || '';
    const valid = twilio.validateRequest(authToken, signature, url, req.body || {});
    if (!valid) {
      console.warn('[sms] rejected inbound with bad signature from', req.ip, 'url:', url);
      return res.status(403).type('text/xml').send('<Response/>');
    }
  }

  // Hand GleeWorld its copy first so a slow TSB query can't cost it the
  // message; the await is bounded at 8s, well inside Twilio's timeout.
  const gleeworldReply = await forwardToGleeWorld(req.body);

  try {
    const from = toE164(req.body?.From);
    const body = String(req.body?.Body ?? '');
    // A choir broadcast command is not a customer conversation.
    if (GLEEWORLD_BROADCAST_RE.test(body.trim())) {
      return res.type('text/xml').send(gleeworldReply || '<Response/>');
    }
    const sid = req.body?.MessageSid || null;
    const numMedia = Number(req.body?.NumMedia || 0) || 0;
    const media = [];
    for (let i = 0; i < numMedia; i += 1) {
      const url = req.body?.[`MediaUrl${i}`];
      if (url) media.push({ url, content_type: req.body?.[`MediaContentType${i}`] || null });
    }

    // Best-effort attribution: the newest quote whose phone digits match.
    // No match is fine — the thread still exists under the number.
    const digits = from.replace(/\D/g, '').slice(-10);
    let quoteId = null;
    let customerName = null;
    if (digits.length === 10) {
      const { rows } = await pool.query(
        `SELECT id, customer_name FROM quotes
          WHERE RIGHT(regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g'), 10) = $1
          ORDER BY created_at DESC LIMIT 1`,
        [digits],
      );
      if (rows[0]) { quoteId = rows[0].id; customerName = rows[0].customer_name; }
    }

    await pool.query(
      `INSERT INTO sms_messages (direction, phone, body, quote_id, customer_name, twilio_sid, num_media, media)
       VALUES ('in', $1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [from, body, quoteId, customerName, sid, numMedia, JSON.stringify(media)],
    );

    // Nudge the shop — nobody watches an admin screen all day.
    if (process.env.ADMIN_PHONE) {
      const who = customerName || from;
      sendSMS(process.env.ADMIN_PHONE, `TSB reply from ${who}: ${body.slice(0, 120)}`).catch(() => {});
    }
  } catch (err) {
    console.error('[sms] inbound failed:', err.message);
  }

  // Always 200: a retry storm helps nobody. Empty TwiML unless GleeWorld
  // produced a broadcast receipt worth passing back — a TSB customer never
  // gets an auto-reply.
  res.type('text/xml').send(gleeworldReply || '<Response/>');
});

// ── Admin ────────────────────────────────────────────────────────────
const router = Router();
router.use(authenticate, adminOnly);

// GET /thread?phone=+14045551234 — the whole conversation with one number,
// oldest first. Opening a thread marks its inbound messages read.
router.get('/thread', async (req, res, next) => {
  try {
    const phone = toE164(req.query.phone);
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    const digits = phone.replace(/\D/g, '').slice(-10);
    const { rows } = await pool.query(
      `SELECT id, direction, phone, body, quote_id, customer_name, num_media, media, read_at, created_at
         FROM sms_messages
        WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
        ORDER BY created_at ASC`,
      [digits],
    );
    await pool.query(
      `UPDATE sms_messages SET read_at = NOW()
        WHERE direction = 'in' AND read_at IS NULL
          AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1`,
      [digits],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /inbox — one row per phone number: the latest message and how many
// of their replies nobody has read yet.
router.get('/inbox', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (thread_key)
              thread_key, phone, body, direction, customer_name, quote_id, created_at,
              (SELECT COUNT(*)::int FROM sms_messages u
                WHERE u.direction = 'in' AND u.read_at IS NULL
                  AND RIGHT(regexp_replace(u.phone, '\\D', '', 'g'), 10) = m.thread_key) AS unread
         FROM (
           SELECT *, RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) AS thread_key
             FROM sms_messages
         ) m
        ORDER BY thread_key, created_at DESC
        LIMIT 200`,
    );
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /unread-count — badge for the admin nav.
router.get('/unread-count', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM sms_messages WHERE direction = 'in' AND read_at IS NULL`,
    );
    res.json({ unread: rows[0]?.n || 0 });
  } catch (err) {
    next(err);
  }
});

// POST /send — { phone, body, quote_id? }. Throws (rather than quietly
// no-opping) when Twilio is unconfigured: an admin who hit Send needs to
// know whether the customer actually got it.
router.post('/send', async (req, res, next) => {
  try {
    const phone = toE164(req.body?.phone);
    const body = String(req.body?.body ?? '').trim();
    const quoteId = req.body?.quote_id ? Number(req.body.quote_id) : null;
    if (!phone || phone.replace(/\D/g, '').length < 11) {
      return res.status(400).json({ error: 'A valid phone number is required' });
    }
    if (!body) return res.status(400).json({ error: 'Message body is required' });
    if (body.length > 1200) return res.status(400).json({ error: 'Message is too long (1200 characters max)' });

    let customerName = null;
    if (quoteId) {
      const { rows } = await pool.query('SELECT customer_name FROM quotes WHERE id = $1', [quoteId]);
      customerName = rows[0]?.customer_name || null;
    }

    let sid;
    try {
      sid = await sendSMSOrThrow(phone, body);
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Twilio refused the message' });
    }

    const { rows } = await pool.query(
      `INSERT INTO sms_messages (direction, phone, body, quote_id, customer_name, twilio_sid, sent_by)
       VALUES ('out', $1, $2, $3, $4, $5, $6)
       RETURNING id, direction, phone, body, quote_id, customer_name, num_media, media, read_at, created_at`,
      [phone, body, quoteId, customerName, sid, req.user?.id ?? null],
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
