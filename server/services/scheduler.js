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
import { runNewsletterSchedules } from './newsletterBlast.js';
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

// Quotes expire two weeks after the customer goes quiet. Unaccepted quotes
// (pending/quoted) expire 14 days after creation; accepted-but-never-paid
// quotes expire 14 days after acceptance. Expired quotes move to the
// non-responsive archive (archived_at + archive_reason) and the customer is
// recorded in non_buying_customers for marketing / geo analysis — unless
// some OTHER quote of theirs shows buying evidence (a deposit, a paid
// balance, or a completed job).
const QUOTE_EXPIRY_DAYS = 14;

async function archiveNonResponsiveQuotes() {
  try {
    const { rows } = await pool.query(`
      UPDATE quotes SET archived_at = NOW(), archive_reason = 'non-responsive'
       WHERE archived_at IS NULL
         AND (
           (status IN ('pending', 'quoted') AND created_at < NOW() - make_interval(days => $1))
           OR (status = 'accepted' AND COALESCE(deposit_amount, 0) = 0 AND balance_paid_at IS NULL
               AND COALESCE(accepted_at, created_at) < NOW() - make_interval(days => $1))
         )
       RETURNING id, customer_name, customer_email, customer_phone,
                 estimated_price, calculated_price, shipping_address, created_at
    `, [QUOTE_EXPIRY_DAYS]);
    if (rows.length === 0) return;
    console.log(`[scheduler] archived ${rows.length} non-responsive quote(s): ${rows.map((r) => r.id).join(', ')}`);

    for (const q of rows) {
      const email = String(q.customer_email || '').trim().toLowerCase();
      if (!email) continue;
      // Buying evidence anywhere in their history keeps them off the
      // non-buying list — they're a customer, just not on this quote.
      const { rows: bought } = await pool.query(
        `SELECT 1 FROM quotes
          WHERE LOWER(customer_email) = $1
            AND (COALESCE(deposit_amount, 0) > 0 OR balance_paid_at IS NOT NULL OR status = 'completed')
          LIMIT 1`,
        [email],
      );
      if (bought.length > 0) continue;
      const addr = q.shipping_address || {};
      const value = Number(q.calculated_price ?? q.estimated_price ?? 0) || 0;
      await pool.query(`
        INSERT INTO non_buying_customers (email, name, phone, city, state, zip, quote_count, total_quoted_value, first_quote_at, last_quote_at)
        VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $8)
        ON CONFLICT (email) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, non_buying_customers.name),
          phone = COALESCE(EXCLUDED.phone, non_buying_customers.phone),
          city = COALESCE(EXCLUDED.city, non_buying_customers.city),
          state = COALESCE(EXCLUDED.state, non_buying_customers.state),
          zip = COALESCE(EXCLUDED.zip, non_buying_customers.zip),
          quote_count = non_buying_customers.quote_count + 1,
          total_quoted_value = non_buying_customers.total_quoted_value + EXCLUDED.total_quoted_value,
          first_quote_at = LEAST(non_buying_customers.first_quote_at, EXCLUDED.first_quote_at),
          last_quote_at = GREATEST(non_buying_customers.last_quote_at, EXCLUDED.last_quote_at),
          updated_at = NOW()
      `, [email, q.customer_name || null, q.customer_phone || null,
          addr.city || null, addr.state || null, addr.zip || null,
          value, q.created_at]);
    }

    // Someone on the list who later buys stops being a non-buying customer.
    await pool.query(`
      DELETE FROM non_buying_customers nbc
       WHERE EXISTS (
         SELECT 1 FROM quotes q
          WHERE LOWER(q.customer_email) = nbc.email
            AND (COALESCE(q.deposit_amount, 0) > 0 OR q.balance_paid_at IS NOT NULL OR q.status = 'completed')
       )
    `);
  } catch (err) {
    console.error('[scheduler] archiveNonResponsiveQuotes failed:', err.message);
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
  // Newsletter schedules — every 5 minutes, claim-then-send.
  cron.schedule('*/5 * * * *', () => {
    runNewsletterSchedules().catch((err) => console.error('[scheduler] newsletter schedules failed:', err.message));
  });

  cron.schedule('30 6 * * *', () => {
    purgeAbandonedGangSheetCheckouts();
  });
  // Daily at 06:45 UTC, offset from the other daily jobs. Also run once
  // shortly after boot so a redeploy doesn't delay overdue archiving a day.
  cron.schedule('45 6 * * *', () => {
    archiveNonResponsiveQuotes();
  });
  setTimeout(() => { archiveNonResponsiveQuotes(); }, 30_000);
  console.log('[scheduler] started (abandoned-quote follow-up hourly @ :05, franchise payouts daily @ 06:00 UTC, abandoned gang-sheet checkout purge daily @ 06:30 UTC, non-responsive quote archive daily @ 06:45 UTC, newsletter schedules every 5 min)');
}
