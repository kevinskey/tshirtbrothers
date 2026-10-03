// Keep parcel tracking current without anyone pressing a button.
//
// The Post Office's Tracking tab only knew what it was told the last time
// someone clicked Refresh, so "where is this parcel" was as stale as the
// last person who thought to ask. EasyPost holds the truth; this pulls it
// on a schedule and writes it onto the shipment row.
//
// Shared by the cron and by POST /api/admin/post-office/refresh-tracking,
// so the manual button and the background job can never disagree.
import pool from '../db.js';
import { getClient } from '../routes/shipping.js';

/** Parcels we stop asking about: delivered, or refunded/voided labels. */
const OPEN_FILTER = `status = 'purchased' AND COALESCE(tracking_status, '') <> 'delivered'`;

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
    `SELECT id, tracker_id, tracking_code, tracking_status
       FROM shipments
      WHERE ${OPEN_FILTER}
        ${staleOnly ? "AND updated_at < NOW() - INTERVAL '55 minutes'" : ''}
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) return { checked: 0, updated: 0, delivered: 0 };

  let client;
  try {
    client = getClient();
  } catch (err) {
    // No EasyPost key configured — not an error worth waking anyone for.
    console.log('[tracking] skipped:', err.message);
    return { checked: 0, updated: 0, delivered: 0 };
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
      if (tracker.status === 'delivered' && s.tracking_status !== 'delivered') delivered += 1;
    } catch (err) {
      console.error(`[tracking] ${s.tracking_code} failed:`, err.message);
    }
  }
  return { checked: rows.length, updated, delivered };
}
