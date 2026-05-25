// Background jobs that fire on a cron schedule. Node-cron runs inside
// the same Express process — that's fine for a single-droplet deployment
// because pm2 keeps it alive. If we ever scale to multiple instances
// we'll need to extract this to a separate worker so the job doesn't
// fire once per replica.

import cron from 'node-cron';
import pool from '../db.js';
import { sendAbandonedQuoteFollowUp } from './email.js';

// Find quotes that were saved 24-72h ago but never moved past 'pending'
// AND haven't already been followed up. The 24h floor lets the customer
// breathe — if they save and lock in the same day, we never bother them.
// The 72h ceiling avoids chasing genuinely cold quotes that would feel
// stalker-ish.
async function runAbandonedQuoteFollowUps() {
  try {
    const { rows } = await pool.query(`
      SELECT id, customer_name, customer_email, product_name, quantity,
             estimated_price, accept_token, created_at
        FROM quotes
       WHERE status = 'pending'
         AND follow_up_sent_at IS NULL
         AND customer_email IS NOT NULL
         AND created_at < NOW() - INTERVAL '24 hours'
         AND created_at > NOW() - INTERVAL '72 hours'
       LIMIT 50
    `);
    if (rows.length === 0) return;
    console.log(`[scheduler] abandoned-quote follow-up: ${rows.length} candidates`);
    for (const quote of rows) {
      try {
        await sendAbandonedQuoteFollowUp(quote);
        await pool.query(
          'UPDATE quotes SET follow_up_sent_at = NOW() WHERE id = $1',
          [quote.id],
        );
      } catch (err) {
        console.error(`[scheduler] follow-up failed for quote ${quote.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[scheduler] runAbandonedQuoteFollowUps failed:', err.message);
  }
}

export function startScheduler() {
  // Every hour at :05. Hourly is plenty for a 24-72h window.
  cron.schedule('5 * * * *', () => {
    runAbandonedQuoteFollowUps();
  });
  console.log('[scheduler] started (abandoned-quote follow-up hourly @ :05)');
}
