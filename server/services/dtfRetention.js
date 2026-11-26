import { orderSheets } from '../lib/dtfCart.js';

// An abandoned reorder may reference the same production file as a paid
// purchase. Delete expired carts atomically, then delete only unreferenced
// objects. Never delete a paid order's durable print file.
export async function purgeAbandonedDtfOrders({ db, removeFile }) {
  const { rows } = await db.query(`DELETE FROM gang_sheet_orders
    WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING id, file_key, sheets_json`);
  for (const key of new Set(rows.flatMap(row => orderSheets(row).map(sheet => sheet.file_key)).filter(Boolean))) {
    const refs = await db.query(`SELECT 1 FROM gang_sheet_orders WHERE file_key = $1
      OR sheets_json @> jsonb_build_array(jsonb_build_object('file_key', $1::text)) LIMIT 1`, [key]);
    if (refs.rows.length === 0) await removeFile(key);
  }
  return rows.length;
}
