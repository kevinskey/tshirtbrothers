import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

// Admin Order Detail: everything about one order (keyed by quote id) in a
// single payload — quote + items + mockups, invoices with payment history,
// blanks purchase orders, vendor file sends, the customer's email thread
// from the unified mailbox, activity events, and admin notes.

const router = Router();
router.use(authenticate, adminOnly);

router.get('/:quoteId', async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const quoteQ = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (quoteQ.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    const quote = quoteQ.rows[0];
    const email = (quote.customer_email || '').toLowerCase();

    const [items, invoices, purchaseOrders, vendorSends, emails, activity, notes] = await Promise.all([
      pool.query(
        `SELECT qi.*, p.name AS catalog_name, p.brand, p.ss_id
           FROM quote_items qi LEFT JOIN products p ON p.id = qi.product_id
          WHERE qi.quote_id = $1 ORDER BY qi.position`,
        [quoteId]
      ),
      pool.query(
        `SELECT id, invoice_number, status, total, amount_paid, amount_due,
                deposit_percent, payments, due_date, created_at, updated_at
           FROM invoices WHERE quote_id = $1 ORDER BY created_at`,
        [quoteId]
      ),
      pool.query(
        `SELECT po.* FROM purchase_orders po
          WHERE po.quote_id = $1
             OR po.invoice_id IN (SELECT id FROM invoices WHERE quote_id = $1)
          ORDER BY po.created_at`,
        [quoteId]
      ),
      pool.query(
        `SELECT * FROM vendor_sends
          WHERE reference ~ ('(^|[^0-9])' || $1 || '([^0-9]|$)')
          ORDER BY sent_at DESC LIMIT 20`,
        [String(quoteId)]
      ),
      email
        ? pool.query(
            `SELECT id, folder, from_name, from_addr, to_addrs, subject, snippet,
                    attachments, msg_date, seen, outgoing
               FROM mail_messages
              WHERE lower(from_addr) = $1 OR to_addrs ? $1
              ORDER BY msg_date DESC NULLS LAST LIMIT 30`,
            [email]
          )
        : Promise.resolve({ rows: [] }),
      email
        ? pool.query(
            `SELECT event, path, data, created_at FROM activity_events
              WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 40`,
            [email]
          )
        : Promise.resolve({ rows: [] }),
      pool.query(
        'SELECT * FROM order_notes WHERE quote_id = $1 ORDER BY created_at DESC',
        [quoteId]
      ),
    ]);

    res.json({
      quote,
      items: items.rows,
      invoices: invoices.rows,
      purchaseOrders: purchaseOrders.rows,
      vendorSends: vendorSends.rows,
      emails: emails.rows,
      activity: activity.rows,
      notes: notes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /:quoteId/stages — toggle a manual production stage on/off.
// body: {key, done}. Stamps now() when turning on.
router.put('/:quoteId/stages', async (req, res, next) => {
  try {
    const { key, done } = req.body || {};
    const allowed = ['gang_sent', 'gang_pickup', 'pressed', 'pickup_contacted'];
    if (!allowed.includes(key)) {
      return res.status(400).json({ error: `key must be one of ${allowed.join(', ')}` });
    }
    const { rows } = done
      ? await pool.query(
          `UPDATE quotes SET order_stages = COALESCE(order_stages, '{}'::jsonb) || jsonb_build_object($2::text, to_jsonb(NOW()))
            WHERE id = $1 RETURNING order_stages`,
          [req.params.quoteId, key]
        )
      : await pool.query(
          `UPDATE quotes SET order_stages = COALESCE(order_stages, '{}'::jsonb) - $2::text
            WHERE id = $1 RETURNING order_stages`,
          [req.params.quoteId, key]
        );
    if (rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    res.json({ order_stages: rows[0].order_stages });
  } catch (err) {
    next(err);
  }
});

// POST /:quoteId/offline-payment {amount, method} — record a payment that
// happened outside Stripe (cash, Zelle, Cash App, card in person). Creates
// a deposit invoice for the quote if none exists, applies the payment, and
// stamps the quote accepted — the same bookkeeping a Stripe deposit does,
// so the pipeline tabs and stage circles behave identically.
router.post('/:quoteId/offline-payment', async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const amount = Number(req.body?.amount);
    const method = (req.body?.method || 'offline').toString().slice(0, 40);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }

    const quoteQ = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (quoteQ.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    const quote = quoteQ.rows[0];
    const total = Number(quote.estimated_price || 0);

    // Reuse the latest invoice for this quote, or create one to hang the
    // payment on (mirrors createPaidInvoiceForQuote's shape).
    let invoice = (
      await pool.query('SELECT * FROM invoices WHERE quote_id = $1 ORDER BY id DESC LIMIT 1', [quoteId])
    ).rows[0];
    if (!invoice) {
      const seq = await pool.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\\d+)') AS INTEGER)), 1000) + 1 AS next_num FROM invoices`
      );
      const items = [{
        description: quote.product_name || 'Custom printing order',
        quantity: quote.quantity || 1,
        unit_price: quote.quantity ? total / quote.quantity : total,
        total,
      }];
      invoice = (
        await pool.query(
          `INSERT INTO invoices
             (invoice_number, customer_name, customer_email, customer_phone,
              items, subtotal, tax, shipping, discount, total, amount_paid, amount_due,
              quote_id, status, deposit_percent)
           VALUES ($1,$2,$3,$4,$5,$6,0,0,0,$6,0,$6,$7,'sent',50)
           RETURNING *`,
          [
            `INV-${seq.rows[0].next_num}`,
            quote.customer_name || '',
            quote.customer_email || '',
            quote.customer_phone || null,
            JSON.stringify(items),
            total,
            quoteId,
          ]
        )
      ).rows[0];
    }

    const newPaid = Number(invoice.amount_paid || 0) + amount;
    const newDue = Math.max(0, Number(invoice.total || 0) - newPaid);
    const payments = typeof invoice.payments === 'string'
      ? JSON.parse(invoice.payments)
      : (invoice.payments || []);
    payments.push({ amount, method, offline: true, date: new Date().toISOString(), recorded_by: req.user?.email || 'admin' });

    const updatedInvoice = (
      await pool.query(
        `UPDATE invoices SET amount_paid = $2, amount_due = $3,
            status = CASE WHEN $3 <= 0 THEN 'paid' ELSE 'partial' END,
            payments = $4, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [invoice.id, newPaid, newDue, JSON.stringify(payments)]
      )
    ).rows[0];

    // Same quote bookkeeping as the Stripe deposit webhook: accept the
    // quote and record the deposit. Never demote a later status, and stamp
    // balance_paid_at when this payment settles the full total.
    const updatedQuote = (
      await pool.query(
        `UPDATE quotes SET
            status = CASE WHEN status IN ('accepted','completed') THEN status ELSE 'accepted' END,
            accepted_at = COALESCE(accepted_at, NOW()),
            deposit_amount = COALESCE(deposit_amount, $2),
            balance_paid_at = CASE WHEN $3 <= 0 THEN COALESCE(balance_paid_at, NOW()) ELSE balance_paid_at END
          WHERE id = $1 RETURNING *`,
        [quoteId, amount, newDue]
      )
    ).rows[0];

    res.json({ invoice: updatedInvoice, quote: updatedQuote });
  } catch (err) {
    next(err);
  }
});

router.post('/:quoteId/notes', async (req, res, next) => {
  try {
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Note body required' });
    const { rows } = await pool.query(
      `INSERT INTO order_notes (quote_id, author, body) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.quoteId, req.user?.email || 'admin', body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:quoteId/notes/:noteId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM order_notes WHERE id = $1 AND quote_id = $2',
      [req.params.noteId, req.params.quoteId]
    );
    res.json({ deleted: rowCount > 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
