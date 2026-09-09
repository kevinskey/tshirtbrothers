// Shared newsletter blast engine — used by the admin send route (fire and
// forget) and the schedule runner in scheduler.js (awaits completion).
import pool from '../db.js';
import { sendNewsletterEmail } from './email.js';
import { resolveRecipients } from '../routes/campaigns.js';
import { renderNewsletterHtml, validateNewsletter } from './newsletterRender.js';

/**
 * Start a newsletter blast. Resolves the audience, creates the
 * email_campaigns row, and kicks off the throttled worker.
 * Returns { campaignId, recipientCount, done } where `done` resolves when
 * every email has been attempted. Throws on validation/audience errors.
 */
export async function blastNewsletter({ newsletterId, filter = 'all', testEmail = null, userId = null }) {
  const nlRes = await pool.query('SELECT * FROM newsletters WHERE id = $1', [newsletterId]);
  if (nlRes.rows.length === 0) throw Object.assign(new Error('Newsletter not found'), { status: 404 });
  const nl = nlRes.rows[0];

  const errors = validateNewsletter({ subject: nl.subject, blocks: nl.blocks });
  if (errors.length) throw Object.assign(new Error('Newsletter is not ready to send.'), { status: 400, details: errors });

  let recipients;
  let recipientFilterRecord;
  if (testEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
    recipients = [{ email: String(testEmail).toLowerCase(), name: null }];
    recipientFilterRecord = { test_email: testEmail, newsletter_id: nl.id };
  } else {
    recipients = await resolveRecipients(filter);
    recipientFilterRecord = { filter, newsletter_id: nl.id };
    if (recipients.length === 0) throw Object.assign(new Error('No recipients match this filter'), { status: 400 });
  }

  const previewHtml = renderNewsletterHtml(nl.blocks, { preheader: nl.preheader, theme: nl.theme || {} });
  const { rows } = await pool.query(
    `INSERT INTO email_campaigns (subject, body_html, example_image_urls, recipient_filter, recipient_count, status, created_by)
     VALUES ($1, $2, '[]'::jsonb, $3::jsonb, $4, 'sending', $5) RETURNING id`,
    [nl.subject, previewHtml, JSON.stringify(recipientFilterRecord), recipients.length, userId],
  );
  const campaignId = rows[0].id;
  const isTest = Boolean(testEmail);

  if (!isTest) {
    await pool.query(`UPDATE newsletters SET status = 'sending', updated_at = NOW() WHERE id = $1`, [nl.id]);
  }

  const done = (async () => {
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      try {
        await sendNewsletterEmail({
          to: r.email,
          subject: nl.subject,
          campaignId,
          renderHtml: ({ unsubHtml, openPixelHtml }) =>
            renderNewsletterHtml(nl.blocks, { preheader: nl.preheader, theme: nl.theme || {}, unsubHtml, openPixelHtml }),
        });
        sent++;
      } catch (err) {
        failed++;
        console.error(`[newsletter ${nl.id} → campaign ${campaignId}] send to ${r.email} failed:`, err.message);
      }
      await new Promise((r2) => setTimeout(r2, 600));
    }
    await pool.query(
      `UPDATE email_campaigns SET sent_count = $1, failed_count = $2, status = $3, sent_at = NOW() WHERE id = $4`,
      [sent, failed, failed === recipients.length ? 'failed' : 'sent', campaignId],
    );
    if (!isTest) {
      await pool.query(
        `UPDATE newsletters SET status = $1, sent_campaign_id = $2, updated_at = NOW() WHERE id = $3`,
        [sent > 0 ? 'sent' : 'draft', campaignId, nl.id],
      );
    }
    console.log(`[newsletter ${nl.id}] campaign ${campaignId} complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  })();

  return { campaignId, recipientCount: recipients.length, isTest, done };
}

/**
 * Run all due newsletter schedules. Claims each row FIRST (advances
 * next_run_at / deactivates one-shots) so a slow blast can't double-fire
 * on the next tick, then blasts and records the outcome.
 */
export async function runNewsletterSchedules() {
  const { rows } = await pool.query(
    `SELECT s.*, n.name FROM newsletter_schedules s
     JOIN newsletters n ON n.id = s.newsletter_id
     WHERE s.active AND s.next_run_at <= NOW()
     ORDER BY s.next_run_at LIMIT 10`,
  );
  for (const s of rows) {
    // Claim: one-shots deactivate; recurring advance past NOW so a long
    // outage doesn't fire a backlog of missed sends.
    if (s.recurrence === 'once') {
      await pool.query('UPDATE newsletter_schedules SET active = false WHERE id = $1', [s.id]);
    } else {
      const step = s.recurrence === 'weekly' ? `interval '7 days'` : `interval '1 month'`;
      await pool.query(
        `UPDATE newsletter_schedules SET next_run_at = (
           SELECT next_run_at + (n * ${step}) FROM generate_series(1, 64) n
           WHERE next_run_at + (n * ${step}) > NOW() ORDER BY n LIMIT 1
         ) WHERE id = $1`,
        [s.id],
      );
    }
    try {
      console.log(`[scheduler] newsletter schedule ${s.id}: sending "${s.name}" to '${s.filter}'`);
      const blast = await blastNewsletter({ newsletterId: s.newsletter_id, filter: s.filter, userId: s.created_by });
      await pool.query(
        'UPDATE newsletter_schedules SET last_run_at = NOW(), last_campaign_id = $1 WHERE id = $2',
        [blast.campaignId, s.id],
      );
      await blast.done;
    } catch (err) {
      console.error(`[scheduler] newsletter schedule ${s.id} failed:`, err.message, err.details || '');
    }
  }
}
