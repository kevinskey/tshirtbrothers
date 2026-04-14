import { Router } from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@tshirtbrothers.com';
const DOMAIN = process.env.DOMAIN || 'https://tshirtbrothers.com';
const BRAND_ORANGE = '#f97316';
const BRAND_DARK = '#111827';
const LOGO_URL = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tsb-logo.png';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function formatCurrency(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

// Generate next invoice number: INV-YYYYMMDD-001
async function generateInvoiceNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INV-${dateStr}-`;

  const { rows } = await pool.query(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].invoice_number;
    const lastSeq = parseInt(last.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// Build invoice email HTML
function buildInvoiceEmailHtml(invoice, paymentUrl) {
  const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
  const amountPaid = Number(invoice.amount_paid || 0);
  const amountDue = Number(invoice.amount_due ?? invoice.total);

  const itemRows = (items || []).map((item) => `
    <tr>
      <td style="padding:10px 12px;font-size:14px;color:${BRAND_DARK};border-bottom:1px solid #f3f4f6;">${item.description || ''}</td>
      <td style="padding:10px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;text-align:center;">${item.quantity || 0}</td>
      <td style="padding:10px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(item.unit_price || 0)}</td>
      <td style="padding:10px 12px;font-size:14px;color:${BRAND_DARK};border-bottom:1px solid #f3f4f6;text-align:right;font-weight:500;">${formatCurrency((item.quantity || 0) * (item.unit_price || 0))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoice.invoice_number}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header with logo -->
  <tr><td style="background:${BRAND_DARK};padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td><img src="${LOGO_URL}" alt="T-Shirt Brothers" style="height:48px;" /></td>
        <td style="text-align:right;">
          <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">INVOICE</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Invoice details -->
  <tr><td style="padding:32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="vertical-align:top;width:50%;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Bill To:</p>
          <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:${BRAND_DARK};">${invoice.customer_name}</p>
          <p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${invoice.customer_email}</p>
          ${invoice.customer_phone ? `<p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${invoice.customer_phone}</p>` : ''}
          ${invoice.customer_address ? `<p style="margin:0;font-size:13px;color:#6b7280;">${invoice.customer_address}</p>` : ''}
        </td>
        <td style="vertical-align:top;width:50%;text-align:right;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Invoice #: <strong style="color:${BRAND_DARK};">${invoice.invoice_number}</strong></p>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Date: ${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          ${invoice.due_date ? `<p style="margin:0;font-size:13px;color:#6b7280;">Due: ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
        </td>
      </tr>
    </table>

    <!-- Line items -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:left;font-weight:600;">Description</th>
          <th style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:right;font-weight:600;">Unit Price</th>
          <th style="padding:10px 12px;font-size:13px;color:#6b7280;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- Totals -->
    <table role="presentation" width="280" cellpadding="0" cellspacing="0" style="margin-left:auto;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Subtotal</td>
        <td style="padding:6px 0;font-size:14px;color:${BRAND_DARK};text-align:right;">${formatCurrency(invoice.subtotal)}</td>
      </tr>
      ${Number(invoice.tax) > 0 ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Tax</td>
        <td style="padding:6px 0;font-size:14px;color:${BRAND_DARK};text-align:right;">${formatCurrency(invoice.tax)}</td>
      </tr>` : ''}
      ${Number(invoice.shipping) > 0 ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Shipping</td>
        <td style="padding:6px 0;font-size:14px;color:${BRAND_DARK};text-align:right;">${formatCurrency(invoice.shipping)}</td>
      </tr>` : ''}
      ${Number(invoice.discount) > 0 ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#6b7280;">Discount</td>
        <td style="padding:6px 0;font-size:14px;color:#16a34a;text-align:right;">-${formatCurrency(invoice.discount)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 0;font-size:16px;font-weight:700;color:${BRAND_DARK};border-top:2px solid #e5e7eb;">Total</td>
        <td style="padding:10px 0;font-size:16px;font-weight:700;color:${BRAND_DARK};text-align:right;border-top:2px solid #e5e7eb;">${formatCurrency(invoice.total)}</td>
      </tr>
      ${amountPaid > 0 ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#16a34a;">Paid</td>
        <td style="padding:6px 0;font-size:14px;color:#16a34a;text-align:right;">-${formatCurrency(amountPaid)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 0;font-size:18px;font-weight:700;color:${BRAND_ORANGE};">Amount Due</td>
        <td style="padding:10px 0;font-size:18px;font-weight:700;color:${BRAND_ORANGE};text-align:right;">${formatCurrency(amountDue)}</td>
      </tr>
    </table>

    ${invoice.notes ? `<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;margin:24px 0;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#166534;">Notes</p>
      <p style="margin:4px 0 0;font-size:13px;color:#166534;">${invoice.notes}</p>
    </div>` : ''}

    <!-- Pay Now button -->
    ${paymentUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
      <tr><td style="background:${BRAND_ORANGE};border-radius:8px;">
        <a href="${paymentUrl}" target="_blank" style="display:inline-block;padding:16px 48px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Pay Now</a>
      </td></tr>
    </table>` : ''}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">T-Shirt Brothers &mdash; Custom Apparel &amp; Screen Printing</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">Phone: (555) 123-4567 &bull; Email: info@tshirtbrothers.com</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">123 Print Ave, Dallas TX 75001</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// All routes require admin auth
// Public: minimal invoice view (for customer print/share link). Returns only
// customer-visible fields. Does NOT require auth so the email link works.
router.get('/public/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const i = rows[0];
    res.json({
      id: i.id,
      invoice_number: i.invoice_number,
      customer_name: i.customer_name,
      customer_email: i.customer_email,
      customer_phone: i.customer_phone,
      customer_address: i.customer_address,
      items: i.items,
      subtotal: i.subtotal,
      tax: i.tax,
      shipping: i.shipping,
      discount: i.discount,
      total: i.total,
      amount_paid: i.amount_paid,
      amount_due: i.amount_due,
      status: i.status,
      due_date: i.due_date,
      notes: i.notes,
      created_at: i.created_at,
    });
  } catch (err) { next(err); }
});

router.use(authenticate, adminOnly);

// POST /:id/send-sms - send the invoice link via Twilio
router.post('/:id/send-sms', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];
    if (!inv.customer_phone) return res.status(400).json({ error: 'No phone number on this invoice' });
    const { smsInvoiceLinkToCustomer } = await import('../services/sms.js');
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const sid = await smsInvoiceLinkToCustomer(inv, `${domain}/invoice/view/${inv.id}`);
    res.json({ sent: true, sid: sid || null });
  } catch (err) { next(err); }
});

// GET / - List all invoices, optional ?status= filter
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let whereClause = '';
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT * FROM invoices ${whereClause} ORDER BY created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id - Get single invoice
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST / - Create invoice
router.post('/', async (req, res, next) => {
  try {
    const {
      customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, tax, shipping, discount, total, notes, due_date, quote_id,
    } = req.body;

    if (!customer_name || !customer_email) {
      return res.status(400).json({ error: 'customer_name and customer_email are required' });
    }

    const invoice_number = await generateInvoiceNumber();
    const amount_due = Number(total) || 0;

    const { rows } = await pool.query(
      `INSERT INTO invoices
        (invoice_number, customer_name, customer_email, customer_phone, customer_address,
         items, subtotal, tax, shipping, discount, total, amount_paid, amount_due,
         notes, due_date, quote_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15,'draft')
       RETURNING *`,
      [
        invoice_number, customer_name, customer_email, customer_phone || null,
        (customer_address && customer_address !== '') ? (typeof customer_address === 'string' ? JSON.stringify({ address: customer_address }) : JSON.stringify(customer_address)) : null,
        JSON.stringify(items || []), Number(subtotal) || 0, Number(tax) || 0, Number(shipping) || 0, Number(discount) || 0, Number(total) || 0,
        amount_due, notes || null, due_date || null, quote_id || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - Update invoice
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, tax, shipping, discount, total, notes, due_date, status,
    } = req.body;

    const existing = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const inv = existing.rows[0];
    const newTotal = total !== undefined ? Number(total) : Number(inv.total);
    const newAmountPaid = Number(inv.amount_paid);
    const newAmountDue = newTotal - newAmountPaid;

    const { rows } = await pool.query(
      `UPDATE invoices SET
        customer_name = COALESCE($2, customer_name),
        customer_email = COALESCE($3, customer_email),
        customer_phone = COALESCE($4, customer_phone),
        customer_address = COALESCE($5, customer_address),
        items = COALESCE($6, items),
        subtotal = COALESCE($7, subtotal),
        tax = COALESCE($8, tax),
        shipping = COALESCE($9, shipping),
        discount = COALESCE($10, discount),
        total = COALESCE($11, total),
        amount_due = $12,
        notes = COALESCE($13, notes),
        due_date = COALESCE($14, due_date),
        status = COALESCE($15, status),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        customer_name || null, customer_email || null, customer_phone,
        (customer_address && customer_address !== '') ? (typeof customer_address === 'string' ? JSON.stringify({ address: customer_address }) : JSON.stringify(customer_address)) : null,
        items ? JSON.stringify(items) : null, subtotal !== undefined ? Number(subtotal) : null,
        tax !== undefined ? Number(tax) : null, shipping !== undefined ? Number(shipping) : null,
        discount !== undefined ? Number(discount) : null, total !== undefined ? Number(total) : null,
        newAmountDue, notes, due_date, status || null,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /:id/send - Send invoice email with Stripe payment link
router.post('/:id/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = rows[0];
    const amountDue = Number(invoice.amount_due ?? invoice.total);

    if (amountDue <= 0) {
      return res.status(400).json({ error: 'No amount due on this invoice' });
    }

    // Create Stripe Checkout session
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for invoice ${invoice.invoice_number} - ${invoice.customer_name}`,
            },
            unit_amount: Math.round(amountDue * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${DOMAIN}/invoice/paid?invoice=${id}`,
      cancel_url: `${DOMAIN}/invoice/view/${id}`,
      customer_email: invoice.customer_email,
      metadata: {
        invoice_id: String(id),
        invoice_number: invoice.invoice_number,
      },
    });

    // Send email
    const resend = getResend();
    const html = buildInvoiceEmailHtml(invoice, session.url);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: [invoice.customer_email],
      subject: `Invoice ${invoice.invoice_number} from TShirt Brothers`,
      html,
    });

    // Update status to sent
    const updated = await pool.query(
      `UPDATE invoices SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    console.log(`[Invoice] Sent invoice ${invoice.invoice_number} to ${invoice.customer_email}`);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /:id/record-payment - Record manual payment
router.post('/:id/record-payment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, method } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }

    const { rows: existing } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = existing[0];
    const newAmountPaid = Number(invoice.amount_paid) + Number(amount);
    const newAmountDue = Number(invoice.total) - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? 'paid' : invoice.status;

    // Store payment in a JSON array
    const payments = typeof invoice.payments === 'string'
      ? JSON.parse(invoice.payments)
      : (invoice.payments || []);
    payments.push({
      amount: Number(amount),
      method: method || 'manual',
      date: new Date().toISOString(),
    });

    const { rows } = await pool.query(
      `UPDATE invoices SET
        amount_paid = $2,
        amount_due = $3,
        status = $4,
        payments = $5,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, newAmountPaid, Math.max(0, newAmountDue), newStatus, JSON.stringify(payments)]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - Delete any invoice
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
