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

// jsonb columns come back parsed, but the same values arrive as strings from
// callers that built the invoice by hand, so both shapes have to work.
function parseJsonArray(raw) {
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

  const items = parseJsonArray(invoice.items);
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
    await syncInvoiceArtworkToOrder(invoice, orderId, client);
    await client.query('COMMIT');
    return Number(orderId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// One extra_mockups entry's identity. mockup_id is the real key, but entries
// written before the jsonb carried it have urls and nothing else, and keying
// those on nothing re-appended them on every sync.
function extraMockupKey(m) {
  if (Number.isInteger(m?.mockup_id)) return `id:${m.mockup_id}`;
  return `url:${m?.front || m?.back || m?.sleeve || m?.sleeve_left || ''}`;
}

/**
 * Mirror an invoice's artwork onto the order opened from it.
 *
 * An invoice written by hand carries its proof art in invoices.mockup_id +
 * invoices.extra_mockups, and nothing used to copy that to the quotes row the
 * order lives on. So the Quotes list drew an empty grey Art square for every
 * invoice-born order (TSB-313, TSB-314), "Send to Art Library" found nothing,
 * and the files modal opened empty — while the mockups sat right there on the
 * invoice. The images were never lost, just unreachable from the order.
 *
 * The load-bearing write is mockups.quote_id: approval and the proof emails
 * read the set through that column and deliberately never through
 * extra_mockups, which loses sleeves and misses orphans. The quote's own
 * mockup_image_url* columns are written too because that is what the Art
 * thumbnail, checkout image and invoice renderers read.
 *
 * Non-destructive and idempotent on purpose — it runs again on every invoice
 * edit, and must never overwrite art an admin attached to the order by hand.
 *
 * @param {object} invoice  the invoice row (mockup_id + extra_mockups)
 * @param {number} orderId  quotes.id of the order opened from it
 * @param {object} db       pool, or a client when inside a transaction
 */
export async function syncInvoiceArtworkToOrder(invoice, orderId, db = pool) {
  if (!invoice || orderId == null) return;

  const extras = parseJsonArray(invoice.extra_mockups);
  const primaryId = Number(invoice.mockup_id) || null;
  if (!primaryId && extras.length === 0) return;

  let front = null, back = null, sleeve = null, sleeveLeft = null;
  if (primaryId) {
    const m = await db.query(
      `SELECT preview_image_url, preview_image_url_back, back_preview_image_url,
              preview_image_url_sleeve, preview_image_url_sleeve_left
         FROM mockups WHERE id = $1`,
      [primaryId],
    );
    const row = m.rows[0];
    if (row) {
      front = row.preview_image_url;
      // back_preview_image_url is the older duplicate column no renderer
      // reads; fall back to it so those backs are not lost here either.
      back = row.preview_image_url_back || row.back_preview_image_url;
      sleeve = row.preview_image_url_sleeve;
      sleeveLeft = row.preview_image_url_sleeve_left;
    }
  }

  if (front || back || sleeve || sleeveLeft) {
    await db.query(
      `UPDATE quotes SET
         mockup_image_url             = COALESCE(mockup_image_url, $2),
         mockup_image_url_back        = COALESCE(mockup_image_url_back, $3),
         mockup_image_url_sleeve      = COALESCE(mockup_image_url_sleeve, $4),
         mockup_image_url_sleeve_left = COALESCE(mockup_image_url_sleeve_left, $5)
       WHERE id = $1`,
      [orderId, front, back, sleeve, sleeveLeft],
    );
  }

  if (extras.length) {
    const cur = await db.query('SELECT extra_mockups FROM quotes WHERE id = $1', [orderId]);
    const have = new Set(parseJsonArray(cur.rows[0]?.extra_mockups).map(extraMockupKey));
    const add = extras.filter((m) => !have.has(extraMockupKey(m)));
    if (add.length) {
      await db.query(
        `UPDATE quotes SET extra_mockups = COALESCE(extra_mockups, '[]'::jsonb) || $2::jsonb
          WHERE id = $1`,
        [orderId, JSON.stringify(add)],
      );
    }
  }

  // Only claims mockups nobody else owns: a mockup already pointed at another
  // order stays where it is rather than being stolen by an invoice edit.
  const ids = [primaryId, ...extras.map((m) => m?.mockup_id)]
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) {
    await db.query(
      'UPDATE mockups SET quote_id = $1 WHERE id = ANY($2::int[]) AND quote_id IS NULL',
      [orderId, [...new Set(ids)]],
    );
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
