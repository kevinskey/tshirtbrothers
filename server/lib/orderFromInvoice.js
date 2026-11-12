// Every invoice gets an order number. The order number is TSB-<quote id>,
// so an invoice written from scratch (no quote behind it) needs an order
// row of its own before it can carry one. This opens that order: a quotes
// row built from the invoice's customer and line items, linked back through
// quotes.source_invoice_id and forward through invoices.quote_id.
//
// An invoice is a quote written by hand, so writing one is not proof the job
// was taken: the row opens as 'quoted' with accepted_at NULL and only becomes
// an order ('paid', stamped) once the invoice is paid. Anything else would
// show uncollected money as "Deposit paid" and push unpaid work into Open
// Orders. follow_up_sent_at is stamped so the abandoned-quote follow-up never
// treats it as a lead.
import pool from '../db.js';

function parseItems(raw) {
  let items = raw;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  return Array.isArray(items) ? items : [];
}

export function orderStatusForInvoice(invoice) {
  return invoice.status === 'paid' ? 'paid' : 'quoted';
}

// accepted_at means money arrived. Only a paid invoice may stamp it; the
// timestamp is the invoice's own paid_at when it has one.
function acceptedAtForInvoice(invoice) {
  if (invoice.status !== 'paid') return null;
  return invoice.paid_at || invoice.created_at || null;
}

/**
 * Open an order for an invoice that has none. Idempotent: an invoice that
 * already has a quote_id, or an order already opened from it, is returned
 * as-is.
 *
 * @returns {Promise<number|null>} the order (quote) id now on the invoice
 */
export async function ensureOrderForInvoice(invoice) {
  if (!invoice) return null;
  if (invoice.quote_id != null) return Number(invoice.quote_id);

  const items = parseItems(invoice.items);
  const quantity = Math.max(1, items.reduce((n, it) => n + (Number(it.quantity) || 0), 0));
  const first = items.find((it) => String(it.description || '').trim());
  const productName = first
    ? `${String(first.description).trim()}${items.length > 1 ? ` +${items.length - 1} more` : ''}`
    : 'Custom order';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Someone (or a retry) may already have opened an order from this invoice.
    const existing = await client.query(
      'SELECT id FROM quotes WHERE source_invoice_id = $1 ORDER BY id LIMIT 1',
      [invoice.id]
    );
    let orderId = existing.rows[0]?.id ?? null;

    if (orderId == null) {
      const ins = await client.query(
        `INSERT INTO quotes
           (customer_name, customer_email, customer_phone, product_name, quantity,
            estimated_price, status, notes, accepted_at, follow_up_sent_at,
            source_invoice_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, NOW(), $11, COALESCE($10::timestamptz, NOW()))
         RETURNING id`,
        [
          invoice.customer_name || 'Customer',
          invoice.customer_email || '',
          invoice.customer_phone || null,
          productName,
          quantity,
          Number(invoice.total) || null,
          orderStatusForInvoice(invoice),
          `Order opened from invoice ${invoice.invoice_number}`,
          acceptedAtForInvoice(invoice),
          invoice.created_at || null,
          invoice.id,
        ]
      );
      orderId = ins.rows[0].id;
    }

    // Copy the invoice's line items onto the order — also when the order
    // already existed but opened empty (it happened: an order opened before
    // the invoice carried items left the admin drawer with no line items at
    // all). Self-healing: any later call with items present fills them in.
    if (items.length) {
      const hasItems = await client.query(
        'SELECT 1 FROM quote_items WHERE quote_id = $1 LIMIT 1',
        [orderId]
      );
      if (hasItems.rows.length === 0) {
        for (const [i, it] of items.entries()) {
          const qty = Number(it.quantity) || 0;
          const unit = it.unit_price != null && it.unit_price !== '' ? Number(it.unit_price) : null;
          const lineTotal = it.total != null && it.total !== ''
            ? Number(it.total)
            : (unit != null ? Math.round(unit * qty * 100) / 100 : null);
          await client.query(
            `INSERT INTO quote_items (quote_id, position, product_name, quantity, unit_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [orderId, i, String(it.description || '').trim() || null, qty, unit, lineTotal]
          );
        }
      }
    }

    await client.query(
      'UPDATE invoices SET quote_id = $1 WHERE id = $2 AND quote_id IS NULL',
      [orderId, invoice.id]
    );
    await client.query('COMMIT');
    return Number(orderId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sync an order's payment stamps from its linked invoices. Any collected
 * money accepts the order; final payment requires no balance on ANY linked
 * invoice, matching the order page's totals. Reopening a balance clears the
 * final-payment stamp without moving production backwards.
 *
 * Best-effort: a promotion failure must not fail the payment that already
 * cleared.
 *
 * @param {number|string} quoteId   invoices.quote_id
 */
export async function promoteOrderForInvoicePayment(quoteId) {
  if (quoteId == null) return;
  try {
    const { rows } = await pool.query(
      `WITH invoice_money AS (
         SELECT COALESCE(SUM(amount_paid), 0) AS paid,
                COALESCE(SUM(GREATEST(amount_due, 0)), 0) AS due
           FROM invoices
          WHERE quote_id = $1
       )
       UPDATE quotes q SET
         status = CASE
           WHEN m.due > 0 AND q.status = 'paid' THEN 'accepted'
           WHEN m.paid > 0 AND q.status NOT IN ('accepted','awaiting_approval','approved','paid','in_production','ready','completed')
           THEN 'accepted' ELSE q.status END,
         accepted_at = CASE WHEN m.paid > 0 THEN COALESCE(q.accepted_at, NOW()) ELSE q.accepted_at END,
         balance_paid_at = CASE
           WHEN m.paid > 0 AND m.due <= 0 THEN COALESCE(q.balance_paid_at, NOW())
           ELSE NULL END
        FROM invoice_money m
       WHERE q.id = $1
       RETURNING q.*`,
      [quoteId],
    );
    return rows[0] || null;
  } catch (e) {
    console.error('[orderFromInvoice] order promotion failed:', e.message);
  }
}
