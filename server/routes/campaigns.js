import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { sendCampaignEmail, unsubscribeToken } from '../services/email.js';

const router = Router();

// Public unsubscribe — must NOT require auth. Mounted at /api/email.
export const publicRouter = Router();
publicRouter.get('/unsubscribe', async (req, res) => {
  const { e: email, t: token } = req.query;
  if (!email || !token) return res.status(400).send('Missing parameters');
  const expected = unsubscribeToken(String(email));
  if (expected !== token) return res.status(403).send('Invalid unsubscribe link');
  try {
    await pool.query(
      `INSERT INTO email_unsubscribes (email) VALUES (LOWER($1))
       ON CONFLICT (email) DO NOTHING`,
      [String(email)]
    );
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

// GET list of campaigns (history).
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, subject, recipient_filter, recipient_count, sent_count, failed_count, status, created_at, sent_at
       FROM email_campaigns ORDER BY created_at DESC LIMIT 50`
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

// POST send — fires the campaign. Returns 202 immediately and processes
// in the background so the admin's request doesn't time out on big lists.
router.post('/send', async (req, res, next) => {
  try {
    const { subject, body_html, example_image_urls = [], filter = 'all' } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: 'subject and body_html required' });

    const recipients = await resolveRecipients(filter);
    if (recipients.length === 0) return res.status(400).json({ error: 'No recipients match this filter' });

    const { rows } = await pool.query(
      `INSERT INTO email_campaigns (subject, body_html, example_image_urls, recipient_filter, recipient_count, status, created_by)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'sending', $6) RETURNING id`,
      [subject, body_html, JSON.stringify(example_image_urls), JSON.stringify({ filter }), recipients.length, req.user?.id || null]
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
