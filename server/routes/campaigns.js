import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { sendCampaignEmail, unsubscribeToken, trackingToken } from '../services/email.js';
import { uploadObject } from '../services/spaces.js';

const router = Router();

// Public tracking + unsubscribe routes — must NOT require auth.
// Mounted at /api/email.
export const publicRouter = Router();

// 1×1 transparent PNG bytes used for the open-tracking pixel.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
  'base64'
);

publicRouter.get('/track/open', async (req, res) => {
  const { c: campaignId, e: email, t: token } = req.query;
  // Always 200 with the pixel — never reveal validation failures, since
  // the email client just needs an image to load.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Content-Type', 'image/png');
  if (campaignId && email && token === trackingToken(String(email), 'open')) {
    pool.query(
      `INSERT INTO email_events (campaign_id, recipient_email, event_type, ip, user_agent)
       VALUES ($1, LOWER($2), 'open', $3, $4)`,
      [Number(campaignId), String(email), req.ip || null, req.get('user-agent') || null]
    ).catch((err) => console.error('[track/open]', err.message));
  }
  res.send(PIXEL);
});

publicRouter.get('/track/click', async (req, res) => {
  const { c: campaignId, e: email, t: token, u: url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  // Verify token before logging — but ALWAYS redirect so the recipient
  // gets to their destination even if the token is wrong (better UX
  // than a hostile-feeling 403).
  if (campaignId && email && token === trackingToken(String(email), 'click')) {
    pool.query(
      `INSERT INTO email_events (campaign_id, recipient_email, event_type, url, ip, user_agent)
       VALUES ($1, LOWER($2), 'click', $3, $4, $5)`,
      [Number(campaignId), String(email), String(url), req.ip || null, req.get('user-agent') || null]
    ).catch((err) => console.error('[track/click]', err.message));
  }
  res.redirect(302, String(url));
});

publicRouter.get('/unsubscribe', async (req, res) => {
  const { e: email, t: token, c: campaignId } = req.query;
  if (!email || !token) return res.status(400).send('Missing parameters');
  const expected = unsubscribeToken(String(email));
  if (expected !== token) return res.status(403).send('Invalid unsubscribe link');
  const sourceCampaignId = campaignId ? Number(campaignId) : null;
  try {
    await pool.query(
      `INSERT INTO email_unsubscribes (email, source_campaign_id) VALUES (LOWER($1), $2)
       ON CONFLICT (email) DO NOTHING`,
      [String(email), sourceCampaignId]
    );
    if (sourceCampaignId) {
      await pool.query(
        `INSERT INTO email_events (campaign_id, recipient_email, event_type, ip, user_agent)
         VALUES ($1, LOWER($2), 'unsubscribe', $3, $4)`,
        [sourceCampaignId, String(email), req.ip || null, req.get('user-agent') || null]
      );
    }
  } catch (err) {
    console.error('[unsubscribe] db error:', err);
  }
  res.send(`<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:48px;">
    <h1 style="color:#111827;">You're unsubscribed</h1>
    <p style="color:#6b7280;">${email} won't receive marketing emails from T-Shirt Brothers anymore. Order confirmations and quote responses will still come through.</p>
    <p><a href="https://tshirtbrothers.com" style="color:#f97316;">Back to tshirtbrothers.com</a></p>
  </body></html>`);
});

// Admin routes from here on.
router.use(authenticate, adminOnly);

// ── Recipient resolution ─────────────────────────────────────────────────────
// Single source of truth for "who matches this filter". Used by both the
// preview endpoint and the send endpoint so the count the admin sees is
// the count we actually send to.
async function resolveRecipients(filter) {
  const params = [];
  let where = `WHERE u.role = 'customer' AND u.email IS NOT NULL AND u.email <> ''`;
  if (filter === 'recent_quoted') {
    where += ` AND EXISTS (SELECT 1 FROM quotes q WHERE (q.user_id = u.id OR LOWER(q.customer_email) = LOWER(u.email)) AND q.created_at > NOW() - INTERVAL '90 days')`;
  } else if (filter === 'past_invoiced') {
    where += ` AND EXISTS (SELECT 1 FROM invoices i WHERE LOWER(i.customer_email) = LOWER(u.email))`;
  } else if (filter === 'new_30') {
    where += ` AND u.created_at > NOW() - INTERVAL '30 days'`;
  } else if (filter !== 'all') {
    throw new Error(`Unknown filter: ${filter}`);
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT LOWER(u.email) AS email, u.name FROM users u
     LEFT JOIN email_unsubscribes us ON us.email = LOWER(u.email)
     ${where} AND us.email IS NULL`,
    params
  );
  return rows;
}

// GET list of campaigns (history) with engagement metrics joined in.
// open_count is distinct recipients who opened (one open per recipient
// regardless of how many times the email client refetches the pixel).
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         c.id, c.subject, c.recipient_filter, c.recipient_count,
         c.sent_count, c.failed_count, c.status, c.created_at, c.sent_at,
         COALESCE(opens.n, 0)::int  AS open_count,
         COALESCE(clicks.n, 0)::int AS click_count,
         COALESCE(unsubs.n, 0)::int AS unsub_count
       FROM email_campaigns c
       LEFT JOIN (
         SELECT campaign_id, COUNT(DISTINCT LOWER(recipient_email)) n
         FROM email_events WHERE event_type='open' GROUP BY campaign_id
       ) opens ON opens.campaign_id = c.id
       LEFT JOIN (
         SELECT campaign_id, COUNT(DISTINCT LOWER(recipient_email)) n
         FROM email_events WHERE event_type='click' GROUP BY campaign_id
       ) clicks ON clicks.campaign_id = c.id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) n
         FROM email_events WHERE event_type='unsubscribe' GROUP BY campaign_id
       ) unsubs ON unsubs.campaign_id = c.id
       ORDER BY c.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET aggregate marketing metrics across every campaign — for the
// dashboard cards. Rates are computed against sent_count, not
// recipient_count, so a campaign that was only half-sent doesn't
// pull the open rate down artificially.
router.get('/overview', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM email_campaigns WHERE status='sent')::int AS campaigns_sent,
         (SELECT COALESCE(SUM(sent_count),0) FROM email_campaigns)::int AS total_sent,
         (SELECT COALESCE(SUM(failed_count),0) FROM email_campaigns)::int AS total_failed,
         (SELECT COUNT(DISTINCT (campaign_id, LOWER(recipient_email))) FROM email_events WHERE event_type='open')::int AS unique_opens,
         (SELECT COUNT(DISTINCT (campaign_id, LOWER(recipient_email))) FROM email_events WHERE event_type='click')::int AS unique_clicks,
         (SELECT COUNT(*) FROM email_unsubscribes)::int AS total_unsubscribed`
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Recent unsubscribes for the dashboard list view.
router.get('/unsubscribes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.email, u.unsubscribed_at, u.source_campaign_id, c.subject AS campaign_subject
       FROM email_unsubscribes u
       LEFT JOIN email_campaigns c ON c.id = u.source_campaign_id
       ORDER BY u.unsubscribed_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST preview — returns recipient count + small sample for the admin to confirm.
router.post('/preview', async (req, res, next) => {
  try {
    const { filter = 'all' } = req.body;
    const recipients = await resolveRecipients(filter);
    res.json({
      count: recipients.length,
      sample: recipients.slice(0, 5).map((r) => r.email),
    });
  } catch (err) { next(err); }
});

// POST upload-image — accept a base64 image from disk, push it to Spaces,
// and hand back a public URL the admin can attach to a campaign without
// having to add it to the Art Library first.
router.post('/upload-image', async (req, res, next) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    const match = String(imageBase64).match(/^data:([^;]+);base64,/);
    const contentType = match ? match[1] : 'image/png';
    const extFromCT = contentType.split('/')[1]?.split('+')[0] || 'png';
    const safeName = String(filename || `upload.${extFromCT}`).replace(/[^a-zA-Z0-9.-]/g, '-');
    const key = `marketing/campaigns/${Date.now()}-${safeName}`;
    const url = await uploadObject({ key, body: imageBase64, contentType });
    res.json({ url, filename: filename || safeName });
  } catch (err) { next(err); }
});

// POST send — fires the campaign. Returns 202 immediately and processes
// in the background so the admin's request doesn't time out on big lists.
// If `test_email` is provided, the filter is ignored and we send to just
// that address — useful for previewing the rendered email and verifying
// open/click tracking before a real blast.
router.post('/send', async (req, res, next) => {
  try {
    const { subject, body_html, example_image_urls = [], filter = 'all', test_email } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: 'subject and body_html required' });

    let recipients;
    let recipientFilterRecord;
    if (test_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(test_email)) {
      recipients = [{ email: String(test_email).toLowerCase(), name: null }];
      recipientFilterRecord = { test_email };
    } else {
      recipients = await resolveRecipients(filter);
      recipientFilterRecord = { filter };
      if (recipients.length === 0) return res.status(400).json({ error: 'No recipients match this filter' });
    }

    const { rows } = await pool.query(
      `INSERT INTO email_campaigns (subject, body_html, example_image_urls, recipient_filter, recipient_count, status, created_by)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'sending', $6) RETURNING id`,
      [subject, body_html, JSON.stringify(example_image_urls), JSON.stringify(recipientFilterRecord), recipients.length, req.user?.id || null]
    );
    const campaignId = rows[0].id;

    // Fire-and-forget worker. Resend's free tier rate limit is 2 req/sec;
    // 600ms between sends keeps us well under that with headroom for retries.
    (async () => {
      let sent = 0;
      let failed = 0;
      for (const r of recipients) {
        try {
          await sendCampaignEmail({
            to: r.email,
            subject,
            bodyHtml: body_html,
            exampleImageUrls: example_image_urls,
            campaignId,
          });
          sent++;
        } catch (err) {
          failed++;
          console.error(`[campaign ${campaignId}] send to ${r.email} failed:`, err.message);
        }
        await new Promise((res2) => setTimeout(res2, 600));
      }
      await pool.query(
        `UPDATE email_campaigns SET sent_count = $1, failed_count = $2, status = $3, sent_at = NOW() WHERE id = $4`,
        [sent, failed, failed === recipients.length ? 'failed' : 'sent', campaignId]
      );
      console.log(`[campaign ${campaignId}] complete: ${sent} sent, ${failed} failed`);
    })();

    res.status(202).json({ campaign_id: campaignId, recipient_count: recipients.length });
  } catch (err) { next(err); }
});

export default router;
