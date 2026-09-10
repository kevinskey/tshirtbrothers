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
