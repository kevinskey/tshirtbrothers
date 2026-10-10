// Keep parcel tracking current without anyone pressing a button.
//
// The Post Office's Tracking tab only knew what it was told the last time
// someone clicked Refresh, so "where is this parcel" was as stale as the
// last person who thought to ask. EasyPost holds the truth; this pulls it
// on a schedule and writes it onto the shipment row — and, since 2026-10-10,
// carries a 'delivered' scan through to the order the parcel was carrying,
// so a finished job leaves the dashboard's Open Orders list on its own.
//
// Shared by the cron and by POST /api/admin/post-office/refresh-tracking,
// so the manual button and the background job can never disagree.
import pool from '../db.js';
import { getClient } from '../routes/shipping.js';

/** Parcels we stop asking about: delivered, or refunded/voided labels. */
const OPEN_FILTER = `status = 'purchased' AND COALESCE(tracking_status, '') <> 'delivered'`;

/**
 * Carry a delivered parcel back onto the order it was carrying.
 *
 * Without this the loop never closed: EasyPost knew the shirts arrived and
 * the shipment row said so, but the order stayed 'paid'/'printing' and sat
 * on the dashboard's Open Orders list aging forever, because the only thing
 * that ever advanced an order was a human clicking through Store Orders.
 *
 * Deliberately narrow: it only moves orders that are still mid-flight, so a
 * refunded or cancelled order can never be resurrected by a late scan.
 */
async function markSubjectDelivered(type, id) {
  if (!type || !id) return;
  if (type === 'store_order') {
    await pool.query(
      `UPDATE store_orders
          SET status = 'delivered',
              shipped_at = COALESCE(shipped_at, NOW()),
              updated_at = NOW()
        WHERE id = $1 AND status IN ('paid', 'printing', 'shipped')`,
      [id],
    );
  } else if (type === 'quote') {
    // Same shape the Delivered button writes (quotes.js production-step):
    // the checklist flag plus the terminal status, so a mailed job looks
    // identical however it got there.
    await pool.query(
      `UPDATE quotes
          SET production_steps = COALESCE(production_steps, '{}'::jsonb)
                                 || jsonb_build_object('delivered', 'mailed',
                                                       'delivered_at', NOW()::text),
              status = 'completed'
        WHERE id = $1 AND archived_at IS NULL
          AND status IN ('accepted', 'awaiting_approval', 'approved', 'in_production', 'ready')`,
      [id],
    );
  }
}

/**
 * Pull the current tracker for every live parcel and record it.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.limit=100]  how many to check in one pass
 * @param {boolean} [opts.staleOnly]  cron mode: skip anything checked in
 *                                    the last hour, so a 15-minute cron
 *                                    doesn't burn a call per parcel per run
 * @returns {Promise<{checked:number, updated:number, delivered:number}>}
 */
export async function refreshTracking({ limit = 100, staleOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, tracker_id, tracking_code, tracking_status, subject_type, subject_id
       FROM shipments
      WHERE ${OPEN_FILTER}
        ${staleOnly ? "AND updated_at < NOW() - INTERVAL '55 minutes'" : ''}
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) {
    return { checked: 0, updated: 0, delivered: await reconcileDelivered() };
  }

  let client;
  try {
    client = getClient();
  } catch (err) {
    // No EasyPost key configured — not an error worth waking anyone for.
    console.log('[tracking] skipped:', err.message);
    return { checked: 0, updated: 0, delivered: await reconcileDelivered() };
  }

  let updated = 0;
  let delivered = 0;
  for (const s of rows) {
    try {
      const tracker = s.tracker_id
        ? await client.Tracker.retrieve(s.tracker_id)
        : await client.Tracker.create({ tracking_code: s.tracking_code });
      const last = tracker.tracking_details?.[tracker.tracking_details.length - 1];
      const detail = last
        ? `${last.message || ''}${last.tracking_location?.city ? ` — ${last.tracking_location.city}, ${last.tracking_location.state}` : ''}`.trim()
        : null;

      await pool.query(
        `UPDATE shipments
            SET tracker_id = COALESCE(tracker_id, $2),
                tracking_status = $3,
                tracking_detail = $4,
                est_delivery_date = COALESCE($5, est_delivery_date),
                delivered_at = CASE WHEN $3 = 'delivered'
                                    THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [s.id, tracker.id, tracker.status || null, detail || null, tracker.est_delivery_date || null],
      );
      updated += 1;
      if (tracker.status === 'delivered' && s.tracking_status !== 'delivered') {
        delivered += 1;
        await markSubjectDelivered(s.subject_type, s.subject_id);
      }
    } catch (err) {
      console.error(`[tracking] ${s.tracking_code} failed:`, err.message);
    }
  }
  delivered += await reconcileDelivered();
  return { checked: rows.length, updated, delivered };
}

/**
 * Catch orders whose parcel is already marked delivered but which never got
 * the memo — parcels delivered before this wiring existed, or an order that
 * was still 'paid' when the scan landed. OPEN_FILTER means the poll above
 * never looks at a delivered shipment twice, so without this pass the
 * backlog would sit on the board forever. Pure SQL; costs no EasyPost calls.
 *
 * @returns {Promise<number>} orders moved
 */
async function reconcileDelivered() {
  const [store, quote] = await Promise.all([
    pool.query(
      `UPDATE store_orders o
          SET status = 'delivered',
              shipped_at = COALESCE(o.shipped_at, s.delivered_at, NOW()),
              updated_at = NOW()
         FROM shipments s
        WHERE s.subject_type = 'store_order' AND s.subject_id = o.id
          AND s.tracking_status = 'delivered' AND s.status = 'purchased'
          AND o.status IN ('paid', 'printing', 'shipped')
        RETURNING o.id`,
    ),
    pool.query(
      `UPDATE quotes q
          SET production_steps = COALESCE(q.production_steps, '{}'::jsonb)
                                 || jsonb_build_object('delivered', 'mailed',
                                                       'delivered_at', COALESCE(s.delivered_at, NOW())::text),
              status = 'completed'
         FROM shipments s
        WHERE s.subject_type = 'quote' AND s.subject_id = q.id
          AND s.tracking_status = 'delivered' AND s.status = 'purchased'
          AND q.archived_at IS NULL
          AND q.status IN ('accepted', 'awaiting_approval', 'approved', 'in_production', 'ready')
        RETURNING q.id`,
    ),
  ]);
  const n = store.rowCount + quote.rowCount;
  if (n > 0) console.log(`[tracking] reconciled ${n} delivered order(s) off the board`);
  return n;
}
