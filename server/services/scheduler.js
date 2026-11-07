// Background jobs that fire on a cron schedule. Node-cron runs inside
// the same Express process — that's fine for a single-droplet deployment
// because pm2 keeps it alive. If we ever scale to multiple instances
// we'll need to extract this to a separate worker so the job doesn't
// fire once per replica.

import cron from 'node-cron';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import pool from '../db.js';
import {
  sendAbandonedQuoteFollowUp,
  sendQuoteLastCall,
  sendQuoteClosingNote,
} from './email.js';
import { smsQuoteFollowUpToCustomer } from './sms.js';
import { runPayoutJob } from './storePayoutJob.js';
import { runNewsletterSchedules } from './newsletterBlast.js';
import { refreshTracking } from './trackingRefresh.js';
import { runJdsCatalogSync } from './jdsSync.js';
import { fetchAllStylePrices } from './ssActivewear.js';
import { getSpacesClient, SPACES_BUCKET } from './spaces.js';

// Three touches on a quote that has gone quiet, inside the 7-day window
// before archiveNonResponsiveQuotes sweeps it up.
//
// THE LEAK THIS CLOSES: this job chased only `status = 'pending'`, while the
// archive cron below sweeps `status IN ('pending','quoted')`. So a quote that
// was priced and SENT -- someone who asked for a number, got one, and went
// quiet, i.e. the highest-intent lead in the pipeline -- was never nudged
// once, then disappeared into non_buying_customers on day 7 in silence.
//
// The 24h floor still lets a same-day buyer alone. The ladder fits inside
// QUOTE_EXPIRY_DAYS rather than extending it: 7 days was a deliberate change
// down from 14 (Doc, 2026-10-30).
//
//   touch 1  24-72h   email   "Still thinking it over?"   (as before)
//   touch 2  day 3    SMS     Kevin, by name, offers to change something
//   touch 3  day 5    email   "One question before we close out your quote"
//
// One stamp per touch, so a partial failure can't silently re-fire, and each
// query excludes quotes the later touches have already handled.
const FOLLOW_UPS = [
  {
    label: 'touch 1 (email)',
    column: 'follow_up_sent_at',
    // Unchanged from the original job, except that 'quoted' is now included.
    where: `follow_up_sent_at IS NULL
            AND created_at < NOW() - INTERVAL '24 hours'
            AND created_at > NOW() - INTERVAL '72 hours'`,
    send: (quote) => sendAbandonedQuoteFollowUp(quote),
  },
  {
    label: 'touch 2 (sms)',
    column: 'follow_up_2_sent_at',
    // Texted, not emailed: the emailed quote is the thing they already
    // didn't answer. Skipped silently when we have no phone number.
    where: `follow_up_sent_at IS NOT NULL
            AND follow_up_2_sent_at IS NULL
            AND customer_phone IS NOT NULL
            AND created_at < NOW() - INTERVAL '3 days'`,
    send: (quote) => smsQuoteFollowUpToCustomer(quote, {
      lockInUrl: `${process.env.DOMAIN || 'https://tshirtbrothers.com'}/quote?id=${quote.id}&token=${quote.accept_token || ''}`,
    }),
  },
  {
    label: 'touch 3 (email)',
    column: 'follow_up_3_sent_at',
    where: `follow_up_sent_at IS NOT NULL
            AND follow_up_3_sent_at IS NULL
            AND created_at < NOW() - INTERVAL '5 days'`,
    send: (quote) => sendQuoteLastCall(quote),
  },
];

async function runAbandonedQuoteFollowUps() {
  for (const step of FOLLOW_UPS) {
    try {
      const { rows } = await pool.query(`
        SELECT id, customer_name, customer_email, customer_phone, product_name,
               quantity, estimated_price, accept_token, created_at,
               -- quoteLang() reads inputs_json, NOT a quote_lang column;
               -- omitting it silently sends English to Spanish customers.
               inputs_json
          FROM quotes
         WHERE status IN ('pending', 'quoted')
           AND archived_at IS NULL
           AND accepted_at IS NULL
           AND customer_email IS NOT NULL
           AND ${step.where}
         LIMIT 50
      `);
      if (rows.length === 0) continue;
      console.log(`[scheduler] quote follow-up ${step.label}: ${rows.length} candidate(s)`);
      for (const quote of rows) {
        try {
          await step.send(quote);
          // Stamped even when the send was a no-op (no phone on an SMS
          // touch), so the ladder always advances instead of re-querying the
          // same rows every hour forever.
          await pool.query(
            `UPDATE quotes SET ${step.column} = NOW() WHERE id = $1`,
            [quote.id],
          );
        } catch (err) {
          console.error(`[scheduler] ${step.label} failed for quote ${quote.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[scheduler] runAbandonedQuoteFollowUps ${step.label} failed:`, err.message);
    }
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

// Quotes expire a week after the customer goes quiet (Doc, 2026-10-30 —
// was 14 days). The follow-up nudge goes out at 24-72h, so they still get
// roughly five days after hearing from us before the quote drops off the
// board. Expired quotes move to the non-responsive archive (archived_at +
// archive_reason) and the customer is recorded in non_buying_customers for
// marketing / geo analysis — unless some OTHER quote of theirs shows buying
// evidence (a deposit, a paid balance, or a completed job).
const QUOTE_EXPIRY_DAYS = 7;

async function archiveNonResponsiveQuotes() {
  try {
    const { rows } = await pool.query(`
      UPDATE quotes SET archived_at = NOW(), archive_reason = 'non-responsive'
       WHERE archived_at IS NULL
         -- Actual payment evidence keeps a quote out of the archive. NOTE:
         -- deposit_amount is NOT evidence — send-price stamps every quoted
         -- quote with the 50% ask; real payment sets accepted_at / moves
         -- the status past 'quoted'.
         AND accepted_at IS NULL AND balance_paid_at IS NULL
         AND status IN ('pending', 'quoted')
         AND created_at < NOW() - make_interval(days => $1)
       RETURNING id, customer_name, customer_email, customer_phone,
                 estimated_price, calculated_price, shipping_address, created_at,
                 -- quoteLang() reads inputs_json, so the closing note needs it
                 -- to go out in the language the quote was taken in.
                 inputs_json
    `, [QUOTE_EXPIRY_DAYS]);
    if (rows.length === 0) return;
    console.log(`[scheduler] archived ${rows.length} non-responsive quote(s): ${rows.map((r) => r.id).join(', ')}`);

    // Tell them before they hear nothing again. Archiving used to move the
    // quote to the non-responsive list and record the customer in
    // non_buying_customers without a word -- "we still have your art" is
    // both true and the cheapest reason for them to come back.
    for (const q of rows) {
      if (!q.customer_email) continue;
      try {
        await sendQuoteClosingNote(q);
        await pool.query('UPDATE quotes SET closing_note_sent_at = NOW() WHERE id = $1', [q.id]);
      } catch (err) {
        console.error(`[scheduler] closing note failed for quote ${q.id}:`, err.message);
      }
    }

    for (const q of rows) {
      const email = String(q.customer_email || '').trim().toLowerCase();
      if (!email) continue;
      // Buying evidence anywhere in their history keeps them off the
      // non-buying list — they're a customer, just not on this quote.
      const { rows: bought } = await pool.query(
        `SELECT 1 FROM quotes
          WHERE LOWER(customer_email) = $1
            AND (accepted_at IS NOT NULL OR balance_paid_at IS NOT NULL OR status IN ('accepted', 'completed'))
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
            AND (q.accepted_at IS NOT NULL OR q.balance_paid_at IS NOT NULL OR q.status IN ('accepted', 'completed'))
       )
    `);
  } catch (err) {
    console.error('[scheduler] archiveNonResponsiveQuotes failed:', err.message);
  }
}

// Fill S&S wholesale (base_price) for the whole catalog from the bulk
// price call. S&S throttles the unfiltered endpoint during the day, so
// this runs pre-dawn when the window is usually open; COALESCE-style
// per-row update means it only ever adds coverage, never wipes a price.
async function runSsPriceBackfill() {
  try {
    const prices = await fetchAllStylePrices({ maxAttempts: 8 });
    let updated = 0;
    for (const [styleId, price] of prices) {
      const r = await pool.query(
        `UPDATE products SET base_price = $2, last_synced = NOW()
          WHERE ss_id = $1 AND (base_price IS NULL OR base_price <> $2)`,
        [styleId, price],
      );
      updated += r.rowCount;
    }
    console.log(`[ss-price-backfill] ${prices.size} styles priced, ${updated} products updated`);
  } catch (err) {
    console.error('[ss-price-backfill] failed (likely S&S throttle) — retries tomorrow:', err.message);
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

  // Pre-dawn S&S wholesale backfill — the unfiltered price window is
  // usually open at this hour.
  cron.schedule('20 4 * * *', () => {
    runSsPriceBackfill();
  });

  // Nightly at 5:50 AM: re-snapshot every active JDS SKU (cost / image /
  // stock), deactivate discontinued ones, flag margin problems.
  cron.schedule('50 5 * * *', () => {
    runJdsCatalogSync();
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
  // Twice daily at 07:15 and 15:15 UTC (early morning + mid-morning Atlanta
  // time) — pull live S&S status/tracking for open blanks POs so shipments
  // surface without anyone pressing the refresh button. Dynamic import keeps
  // scheduler boot independent of the S&S client.
  cron.schedule('15 7,15 * * *', () => {
    import('./purchaseOrders.js')
      .then((m) => m.refreshOpenPurchaseOrders())
      .catch((err) => console.error('[scheduler] PO refresh failed:', err.message));
  });

  // Parcel tracking, every 20 minutes. staleOnly skips anything already
  // checked within the hour, so a parcel costs ~1 EasyPost call an hour
  // rather than one per run, and a quiet week costs almost nothing.
  // Carriers scan a few times a day; 20 minutes is about the shop asking
  // "has it moved" rather than about the carrier's cadence.
  cron.schedule('*/20 * * * *', () => {
    refreshTracking({ staleOnly: true, limit: 60 })
      .then((r) => {
        if (r.updated > 0) {
          console.log(`[scheduler] tracking: ${r.updated}/${r.checked} updated` +
            (r.delivered ? `, ${r.delivered} newly delivered` : ''));
        }
      })
      .catch((err) => console.error('[scheduler] tracking refresh failed:', err.message));
  });
  // Once shortly after boot, so a redeploy doesn't leave the board stale
  // for up to 20 minutes.
  setTimeout(() => {
    refreshTracking({ staleOnly: true, limit: 60 })
      .catch((err) => console.error('[scheduler] boot tracking refresh failed:', err.message));
  }, 45_000);
  console.log('[scheduler] started (abandoned-quote follow-up hourly @ :05, franchise payouts daily @ 06:00 UTC, abandoned gang-sheet checkout purge daily @ 06:30 UTC, non-responsive quote archive daily @ 06:45 UTC, newsletter schedules every 5 min, S&S PO refresh @ 07:15/15:15 UTC, parcel tracking every 20 min)');
}
