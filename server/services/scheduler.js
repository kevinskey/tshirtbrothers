// Background jobs that fire on a cron schedule. Node-cron runs inside
// the same Express process — that's fine for a single-droplet deployment
// because pm2 keeps it alive. If we ever scale to multiple instances
// we'll need to extract this to a separate worker so the job doesn't
// fire once per replica.

import cron from 'node-cron';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import pool from '../db.js';
import { sendAbandonedQuoteFollowUp } from './email.js';
import { runPayoutJob } from './storePayoutJob.js';
import { getSpacesClient, SPACES_BUCKET } from './spaces.js';

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

// A gang-sheet checkout that never completes payment leaves behind a
// pending_payment order row AND a private 100 MB-capable upload sitting in
// Spaces. After 24h the Stripe Checkout Session has long expired (Stripe
// sessions default-expire at 24h), so there's no path back to paying for
// that specific order — clear both the row and the file so abandoned carts
// don't grow storage forever.
async function purgeAbandonedGangSheetCheckouts() {
  try {
    const { rows } = await pool.query(`
      SELECT id, file_key FROM gang_sheet_orders
       WHERE status = 'pending_payment'
         AND created_at < NOW() - INTERVAL '24 hours'
    `);
    if (rows.length === 0) return;
    for (const row of rows) {
      try {
        await getSpacesClient().send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: row.file_key }));
      } catch (err) {
        // A missing/already-deleted object shouldn't block cleaning up the
        // row — log and move on.
        console.error(`[scheduler] failed to delete gang sheet file ${row.file_key} (order ${row.id}):`, err.message);
      }
    }
    await pool.query('DELETE FROM gang_sheet_orders WHERE id = ANY($1)', [rows.map((r) => r.id)]);
    console.log(`[scheduler] purged ${rows.length} abandoned gang-sheet checkout(s)`);
  } catch (err) {
    console.error('[scheduler] purgeAbandonedGangSheetCheckouts failed:', err.message);
  }
}

export function startScheduler() {
  // Every hour at :05. Hourly is plenty for a 24-72h window.
  cron.schedule('5 * * * *', () => {
    runAbandonedQuoteFollowUps();
  });
  // Daily at 06:00 UTC. Each franchise store's payout cadence is checked
  // inside runPayoutJob; nothing fires unless today matches (1st of month
  // for monthly, Fridays for weekly).
  cron.schedule('0 6 * * *', () => {
    runPayoutJob();
  });
  // Daily at 06:30 UTC — offset 30m after the payout job so the two don't
  // contend for the pool at the same instant.
  cron.schedule('30 6 * * *', () => {
    purgeAbandonedGangSheetCheckouts();
  });
  console.log('[scheduler] started (abandoned-quote follow-up hourly @ :05, franchise payouts daily @ 06:00 UTC, abandoned gang-sheet checkout purge daily @ 06:30 UTC)');
}
