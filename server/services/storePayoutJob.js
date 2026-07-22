// Franchise store payout automation.
//
// Runs daily at 06:00 UTC. For each active store, reads the cadence and
// min_threshold_cents from the store's latest 'store' agreement. If today
// matches the cadence AND the store's ledger balance is >= threshold,
// creates a store_payouts row with status='pending' and inserts an
// offsetting store_ledger 'payout' entry that zeroes the balance
// atomically. Fires the payout.created outbound webhook.
//
// Approach note: we debit the ledger at CREATION time (not when the ACH
// actually clears). If the payout later fails / is reversed by a bank,
// admin marks it 'failed' via /api/admin/store-payouts/:id/mark-failed
// which inserts an opposite ledger entry to restore the balance. This
// keeps the balance a single source of truth: "what TSB owes the store,
// minus what has been dispatched for payment."
//
// Cadence semantics (MVP):
//   'monthly'              — fires on day 1 of the UTC month
//   'weekly'               — fires on Friday (UTC)
//   'per_campaign_close'   — reserved; fires from the campaign-close
//                            handler in the future, not from this cron
// Anything else is treated as monthly.

import pool from '../db.js';
import { dispatchStoreEvent } from './storeWebhookDispatcher.js';

/** True when today matches the store's payout cadence. UTC-only for
 *  simplicity; TSB is US-based but tenant admins are elsewhere too. */
export function isDueToday(cadence, now = new Date()) {
  const c = String(cadence || 'monthly').toLowerCase();
  if (c === 'monthly') return now.getUTCDate() === 1;
  if (c === 'weekly')  return now.getUTCDay() === 5;    // Friday
  if (c === 'per_campaign_close') return false;         // out-of-band
  return now.getUTCDate() === 1;                        // default: monthly
}

/** For a single store, decide whether a payout should fire and, if so,
 *  create the payout + ledger debit atomically. Never throws — logs
 *  and moves on so one store's bug can't block others.
 *
 *  @returns {Promise<{ payout_id?: number, skipped?: string }>}
 */
export async function processStorePayout(store) {
  try {
    const terms = store.payout_terms_json || {};
    if (!isDueToday(terms.cadence)) {
      return { skipped: `cadence ${terms.cadence || 'monthly'} not due today` };
    }

    const threshold = Math.max(0, Number(terms.min_threshold_cents || 0));
    const method = String(terms.method || 'ach').toLowerCase();

    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS balance
         FROM store_ledger WHERE store_id = $1`,
      [store.id],
    );
    const balance = Number(balanceRes.rows[0].balance);
    if (balance < threshold) {
      return { skipped: `balance ${balance}¢ below threshold ${threshold}¢` };
    }
    if (balance <= 0) {
      return { skipped: `no balance to pay out` };
    }

    // period_start = last previous payout's period_end (any status), or
    // the store's created_at as the genesis. period_end = now.
    const prev = await pool.query(
      `SELECT GREATEST(period_end, created_at) AS boundary
         FROM store_payouts
        WHERE store_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [store.id],
    );
    const periodStart = prev.rows[0]?.boundary
      ?? store.store_created_at
      ?? new Date(0);

    // Atomic: insert payout, then offsetting ledger debit that references it.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO store_payouts
           (store_id, period_start, period_end, amount_cents, method, status)
         VALUES ($1, $2, NOW(), $3, $4, 'pending')
         RETURNING id, period_start, period_end, amount_cents, method, status, created_at`,
        [store.id, periodStart, balance, method],
      );
      const payout = rows[0];
      await client.query(
        `INSERT INTO store_ledger (store_id, entry_type, amount_cents, payout_id, memo)
         VALUES ($1, 'payout', $2, $3, $4)`,
        [store.id, -balance, payout.id, `Payout #${payout.id} — ${method}`],
      );
      await client.query('COMMIT');

      // Fire payout.created (fire-and-forget)
      dispatchStoreEvent(store.id, 'payout.created', {
        payout_id: payout.id,
        amount_cents: balance,
        period_start: payout.period_start,
        period_end: payout.period_end,
        method,
        status: 'pending',
      }).catch((err) => {
        console.error('[payoutJob] webhook dispatch error:', err);
      });

      console.log(
        `[payoutJob] store ${store.slug}: payout ${payout.id} for ${balance}¢ (${method})`,
      );
      return { payout_id: payout.id };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`[payoutJob] store ${store?.slug || store?.id}: failed:`, err);
    return { skipped: `error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Run one pass over all active stores. Called by the scheduler cron. */
export async function runPayoutJob() {
  try {
    const { rows: stores } = await pool.query(`
      SELECT s.id, s.slug, s.created_at AS store_created_at,
             sa.payout_terms_json
        FROM stores s
        JOIN LATERAL (
          SELECT payout_terms_json
            FROM store_agreements
           WHERE store_id = s.id AND kind = 'store'
           ORDER BY accepted_at DESC LIMIT 1
        ) sa ON TRUE
       WHERE s.status = 'active'
    `);
    if (stores.length === 0) {
      console.log('[payoutJob] no active stores with agreements — nothing to do');
      return;
    }
    console.log(`[payoutJob] checking ${stores.length} store(s)`);
    for (const s of stores) {
      await processStorePayout(s);
    }
  } catch (err) {
    console.error('[payoutJob] outer failure:', err);
  }
}
