import pool from '../db.js';
import { fetchSsOrders } from './ssActivewear.js';

// Pull live status/tracking from S&S for one PO and persist it. Shared by
// the manual refresh button (routes/purchasing.js) and the nightly sweep —
// same rollup rules either way. Returns { po, becameShipped }.
export async function refreshPurchaseOrder(po) {
  const ssOrders = Array.isArray(po.ss_orders) ? po.ss_orders : [];
  const orderNumbers = ssOrders.map((o) => o.orderNumber).filter(Boolean);
  const live = await fetchSsOrders(
    orderNumbers.length ? { orderNumbers } : { poNumber: po.po_number }
  );

  const updatedOrders = live.map((o) => ({
    orderNumber: o.orderNumber,
    guid: o.guid,
    warehouseAbbr: o.warehouseAbbr,
    orderStatus: o.orderStatus,
    expectedDeliveryDate: o.expectedDeliveryDate,
    subtotal: Number(o.subtotal) || 0,
    shipping: Number(o.shipping) || 0,
    tax: Number(o.tax) || 0,
    total: Number(o.total) || 0,
  }));
  const tracking = live.map((o) => ({
    orderNumber: o.orderNumber,
    carrier: o.shippingCarrier || null,
    method: o.shippingMethod || null,
    trackingNumbers: (o.boxes || [])
      .map((b) => b.trackingNumber)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i),
    invoiceNumber: o.invoiceNumber || null,
  }));

  // Roll the per-warehouse statuses up to one PO status: any shipment
  // still open keeps the PO open; everything shipped/invoiced marks it
  // received-ready.
  const statuses = updatedOrders.map((o) => (o.orderStatus || '').toLowerCase());
  let status = po.status;
  if (po.is_test) status = 'test';
  else if (statuses.length && statuses.every((s) => s.includes('ship') || s.includes('invoice') || s.includes('complete'))) status = 'shipped';
  else if (statuses.some((s) => s.includes('cancel'))) status = statuses.every((s) => s.includes('cancel')) ? 'cancelled' : po.status;
  else if (statuses.length) status = 'in_progress';

  const { rows: updated } = await pool.query(
    `UPDATE purchase_orders
        SET ss_orders = $2, tracking = $3, status = $4, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [po.id, JSON.stringify(updatedOrders), JSON.stringify(tracking), status]
  );
  return { po: updated[0], becameShipped: status === 'shipped' && po.status !== 'shipped' };
}

// Nightly sweep: every open, non-test PO gets a live refresh, and the shop
// hears about blanks that shipped without anyone pressing the refresh
// button. Errors on one PO never stop the rest (S&S occasionally 500s on
// a single order lookup).
export async function refreshOpenPurchaseOrders() {
  try {
    const { rows: open } = await pool.query(
      `SELECT * FROM purchase_orders
        WHERE status IN ('submitted', 'in_progress')
          AND is_test = false
        ORDER BY created_at ASC
        LIMIT 100`
    );
    if (open.length === 0) return;
    console.log(`[po-refresh] sweeping ${open.length} open purchase order(s)`);
    for (const po of open) {
      try {
        const { po: updated, becameShipped } = await refreshPurchaseOrder(po);
        if (becameShipped) {
          const { sendPoShippedToAdmin } = await import('./email.js');
          sendPoShippedToAdmin(updated).catch(() => {});
        }
      } catch (err) {
        console.error(`[po-refresh] PO ${po.id} (${po.po_number}) failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[po-refresh] sweep failed:', err.message);
  }
}
