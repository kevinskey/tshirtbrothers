// TSB admin actions on franchise store payouts. Gated by TSB's own
// authenticate + adminOnly (JWT bearer token, not the store API key).
//
// The nightly payoutJob creates 'pending' payouts + debits the ledger.
// A TSB operator then processes the actual ACH / check / manual transfer
// out of band, and comes here to:
//   - mark-paid: record the trace/reference and paid_at timestamp
//   - mark-failed: reverse the ledger debit (restore the store's balance)
//                  so the amount rolls into the next payout cycle
//
// Both endpoints fire the payout.paid or payout.failed webhook.

import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { dispatchStoreEvent } from '../services/storeWebhookDispatcher.js';
import { createStorePayout } from '../services/storePayoutJob.js';
import { sendPayoutRemittanceEmail } from '../services/email.js';

const router = Router();
router.use(authenticate, adminOnly);

// GET /api/admin/store-payouts?status=pending
// Cross-store view for TSB operators to work down the queue.
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const params = [];
    let where = '1=1';
    if (status) {
      params.push(status);
      where += ` AND sp.status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT sp.id, sp.store_id, s.slug AS store_slug, s.name AS store_name,
              sp.period_start, sp.period_end, sp.amount_cents, sp.method,
              sp.status, sp.reference, sp.created_at, sp.paid_at
         FROM store_payouts sp
         JOIN stores s ON s.id = sp.store_id
        WHERE ${where}
        ORDER BY sp.created_at DESC
        LIMIT 200`,
      params,
    );
    res.json({ payouts: rows });
  } catch (err) { next(err); }
});

// GET /api/admin/store-payouts/store/:storeId
// Balance owed right now + this store's payout history, for the store
// detail page's payout panel.
router.get('/store/:storeId', async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    if (!Number.isInteger(storeId)) return res.status(400).json({ error: 'invalid store id' });
    const [{ rows: balRows }, { rows: payouts }, { rows: termRows }] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS balance_cents
           FROM store_ledger WHERE store_id = $1`,
        [storeId],
      ),
      pool.query(
        `SELECT id, period_start, period_end, amount_cents, method, status, reference, created_at, paid_at
           FROM store_payouts WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [storeId],
      ),
      pool.query(
        `SELECT payout_terms_json FROM store_agreements
          WHERE store_id = $1 AND kind = 'store'
          ORDER BY id DESC LIMIT 1`,
        [storeId],
      ),
    ]);
    res.json({
      balance_cents: balRows[0]?.balance_cents ?? 0,
      payout_terms: termRows[0]?.payout_terms_json ?? null,
      payouts,
    });
  } catch (err) { next(err); }
});

// POST /api/admin/store-payouts/store/:storeId/pay-now
// Body: { method?: 'ach' | 'check' | ... }
//
// Creates a payout for whatever the store is owed right now, ignoring
// cadence and threshold. This is the trigger the 'per_campaign_close'
// cadence always implied and never had: isDueToday() returns false for
// it, so the cron can never pay those stores — before this endpoint there
// was NO way to produce a payout for them at all.
router.post('/store/:storeId/pay-now', async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    if (!Number.isInteger(storeId)) return res.status(400).json({ error: 'invalid store id' });

    const { rows } = await pool.query(
      `SELECT s.id, s.slug, s.created_at AS store_created_at,
              (SELECT sa.payout_terms_json FROM store_agreements sa
                WHERE sa.store_id = s.id AND sa.kind = 'store'
                ORDER BY sa.id DESC LIMIT 1) AS payout_terms_json
         FROM stores s WHERE s.id = $1`,
      [storeId],
    );
    const store = rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const method = String(
      req.body?.method || store.payout_terms_json?.method || 'ach',
    ).toLowerCase();

    const result = await createStorePayout({ store, method });
    if (result.skipped) return res.status(409).json({ error: result.skipped });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/admin/store-payouts/:id/mark-paid
// Body: { reference: string, paid_at?: iso8601 }
// Records the ACH trace / check number / etc. No ledger change — the
// debit was already inserted at payout creation time.
router.post('/:id/mark-paid', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { reference, paid_at } = req.body ?? {};
    if (!reference || typeof reference !== 'string' || reference.trim().length === 0) {
      return res.status(400).json({ error: 'reference (non-empty string) required' });
    }

    const { rows } = await pool.query(
      `UPDATE store_payouts
          SET status = 'paid',
              reference = $1,
              paid_at = COALESCE($2::timestamptz, NOW())
        WHERE id = $3 AND status IN ('pending', 'sent')
       RETURNING id, store_id, amount_cents, period_start, period_end, method, status, reference, paid_at`,
      [reference.trim(), paid_at ?? null, id],
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Payout not found or not in a payable state' });
    }
    const payout = rows[0];

    dispatchStoreEvent(payout.store_id, 'payout.paid', {
      payout_id: payout.id,
      amount_cents: payout.amount_cents,
      method: payout.method,
      reference: payout.reference,
      paid_at: payout.paid_at,
      period_start: payout.period_start,
      period_end: payout.period_end,
    }).catch((err) => console.error('[adminStorePayouts.mark-paid] webhook error:', err));

    // Remittance advice to the store's owners. The money moves out of band
    // (bill-pay / check), so this is the only thing that tells them it was
    // sent — and it is the receipt their bookkeeper files. Fire-and-forget:
    // the payout is already recorded, a mail failure must not undo it.
    (async () => {
      try {
        const { rows: storeRows } = await pool.query(
          `SELECT id, slug, name FROM stores WHERE id = $1`, [payout.store_id],
        );
        const store = storeRows[0];
        if (!store) return;
        const { rows: owners } = await pool.query(
          `SELECT email, name FROM store_admins
            WHERE store_id = $1 AND role = 'owner' AND email IS NOT NULL`,
          [payout.store_id],
        );
        if (owners.length === 0) {
          console.warn(`[adminStorePayouts.mark-paid] store ${store.slug} has no owner admin to notify`);
          return;
        }
        for (const owner of owners) {
          await sendPayoutRemittanceEmail({
            store, payout, toEmail: owner.email, toName: owner.name,
          }).catch((err) => console.error(
            `[adminStorePayouts.mark-paid] remittance to ${owner.email} failed:`, err.message,
          ));
        }
      } catch (err) {
        console.error('[adminStorePayouts.mark-paid] remittance lookup failed:', err.message);
      }
    })();

    res.json(payout);
  } catch (err) { next(err); }
});

// POST /api/admin/store-payouts/:id/mark-failed
// Body: { reason: string }
// Reverses the ledger debit inserted at payout creation — restores the
// store's balance so the amount rolls into the next cycle.
router.post('/:id/mark-failed', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { reason } = req.body ?? {};
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'reason (non-empty string) required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Idempotency: block if already failed. Also blocks marking a 'paid'
      // payout as failed (a reversal after real ACH cleared should be a
      // separate refund flow, not this endpoint).
      const upd = await client.query(
        `UPDATE store_payouts
            SET status = 'failed'
          WHERE id = $1 AND status IN ('pending', 'sent')
         RETURNING id, store_id, amount_cents`,
        [id],
      );
      if (!upd.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Payout not found or not in a failable state' });
      }
      const payout = upd.rows[0];

      // Ledger reversal: original 'payout' entry was amount = -balance.
      // We insert an 'adjustment' with the opposite sign, referencing the
      // failed payout via memo, so the balance restores.
      await client.query(
        `INSERT INTO store_ledger (store_id, entry_type, amount_cents, payout_id, memo)
         VALUES ($1, 'adjustment', $2, $3, $4)`,
        [payout.store_id, payout.amount_cents, payout.id, `Reversal of failed payout #${payout.id}: ${reason.trim()}`],
      );
      await client.query('COMMIT');

      dispatchStoreEvent(payout.store_id, 'payout.failed', {
        payout_id: payout.id,
        amount_cents: payout.amount_cents,
        reason: reason.trim(),
      }).catch((err) => console.error('[adminStorePayouts.mark-failed] webhook error:', err));

      res.json({ id: payout.id, status: 'failed', reason: reason.trim() });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// POST /api/admin/store-payouts/run-now
// Manually trigger the payout job (useful for month-end batch runs
// outside the cron schedule, or for testing). No body.
router.post('/run-now', async (req, res, next) => {
  try {
    const { runPayoutJob } = await import('../services/storePayoutJob.js');
    // Fire and forget — the job logs its own results. We ack immediately
    // so the admin UI doesn't wait on cross-store I/O.
    runPayoutJob().catch((err) => console.error('[adminStorePayouts.run-now] job crashed:', err));
    res.json({ started: true });
  } catch (err) { next(err); }
});

export default router;
