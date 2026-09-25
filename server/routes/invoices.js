import { Router } from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import * as theme from '../services/emailTheme.js';

const router = Router();

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@tshirtbrothers.com';
const DOMAIN = process.env.DOMAIN || 'https://tshirtbrothers.com';
const BRAND_ORANGE = '#f97316';
const BRAND_DARK = '#111827';
const LOGO_URL = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function formatCurrency(amount) {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Generate next invoice number: INV-YYYYMMDD-001
export async function generateInvoiceNumber() {
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

// What a customer owes RIGHT NOW on an invoice: the deposit if one is
// configured and nothing has been collected yet, otherwise whatever is left
// of the total. Shared by the send-email path, the public invoice payload and
// the on-demand checkout endpoint so those three can never quote different
// numbers at the customer.
export function computeAmountOwed(invoice) {
  const total = Number(invoice.total);
  const paid = Number(invoice.amount_paid || 0);
  const depositPercent = Number(invoice.deposit_percent || 0);

  if (depositPercent > 0 && paid === 0) {
    return {
      amount: +(total * (depositPercent / 100)).toFixed(2),
      paymentType: 'deposit',
      depositPercent,
    };
  }
  return {
    amount: +(total - paid).toFixed(2),
    paymentType: paid > 0 ? 'balance' : 'full',
    depositPercent,
  };
}

// Mint a Stripe Checkout session for an invoice.
//
// Called at click time, never at send time. A Checkout session URL dies 24h
// after it is created, so emailing the raw session URL meant every invoice
// became unpayable the next day — the customer clicked "Pay Now" and got
// Stripe's expired-session page with nothing to do about it. The email now
// links to the invoice page and the button there calls this, so the link in
// the customer's inbox keeps working for as long as the invoice is open.
async function createInvoiceCheckoutSession(invoice, owed) {
  const stripe = getStripe();
  const productName =
    owed.paymentType === 'deposit'
      ? `Deposit (${owed.depositPercent}%) - Invoice ${invoice.invoice_number}`
      : owed.paymentType === 'balance'
      ? `Balance - Invoice ${invoice.invoice_number}`
      : `Invoice ${invoice.invoice_number}`;

  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            description: `Payment for invoice ${invoice.invoice_number} - ${invoice.customer_name}`,
          },
          unit_amount: Math.round(owed.amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${DOMAIN}/payment/success?invoice=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
    // Back to the invoice, which carries its own Pay button — so backing out
    // of Stripe is no longer a dead end the customer can't recover from.
    cancel_url: `${DOMAIN}/invoice/view/${invoice.id}`,
    customer_email: invoice.customer_email,
    metadata: {
      invoice_id: String(invoice.id),
      invoice_number: invoice.invoice_number,
      payment_type: owed.paymentType,
    },
  });
}

// Build invoice email HTML
// 2026-09 branded redesign — shared theme (services/emailTheme.js). Same
// data, amounts, terms, and payment link semantics as before.
export async function buildInvoiceEmailHtml(invoice, paymentUrl) {
  const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
  const amountPaid = Number(invoice.amount_paid || 0);
  const amountDue = Number(invoice.amount_due ?? invoice.total);
  // Standing terms: any deposit is due upon receipt of the invoice; the
  // remaining balance is due on delivery.
  const owedNow = computeAmountOwed(invoice);
  const termsLine = amountDue <= 0
    ? null
    : owedNow.paymentType === 'deposit'
    ? `${owedNow.depositPercent}% deposit of ${formatCurrency(owedNow.amount)} due upon receipt &middot; remaining balance of ${formatCurrency(amountDue - owedNow.amount)} due on delivery`
    : owedNow.paymentType === 'balance'
    ? `Remaining balance of ${formatCurrency(owedNow.amount)} due on delivery`
    : 'Payment due upon receipt';
  const dueDisplay = invoice.due_date
    ? theme.fmtDate(invoice.due_date)
    : amountDue > 0
    ? (owedNow.paymentType === 'balance' ? 'On delivery' : 'Upon receipt')
    : null;
  const promo = await theme.getActivePromotion();
  const pdfUrl = `${DOMAIN}/api/invoices/${invoice.id}/pdf`;

  const itemRows = (items || []).map((it) => ({
    name: it.description || '\u2014',
    color: it.color || '\u2014',
    size: it.size || '\u2014',
    qty: it.quantity || 0,
    unit: Number(it.unit_price || 0),
    subtotal: (Number(it.quantity || 0) * Number(it.unit_price || 0)),
  }));

  const mockups = [];
  if (invoice.mockup_preview_url) mockups.push({ src: invoice.mockup_preview_url, label: invoice.mockup_preview_url_back ? 'Front' : '' });
  if (invoice.mockup_preview_url_back) mockups.push({ src: invoice.mockup_preview_url_back, label: 'Back' });
  if (Array.isArray(invoice.extra_mockups)) for (const m of invoice.extra_mockups) if (m && m.front) mockups.push({ src: m.front, label: '' });

  const summaryRows = [
    { label: 'Product Subtotal', value: formatCurrency(invoice.subtotal) },
    Number(invoice.tax) > 0 ? { label: 'Tax', value: formatCurrency(invoice.tax) } : null,
    Number(invoice.shipping) > 0 ? { label: 'Shipping', value: formatCurrency(invoice.shipping) } : null,
    Number(invoice.discount) > 0 ? { label: 'Discount', value: `&minus;${formatCurrency(invoice.discount)}`, color: '#16a34a', bold: true } : null,
    { label: 'Invoice Total', value: formatCurrency(invoice.total), bold: true },
    amountPaid > 0 ? { label: `Payments Received`, value: `&minus;${formatCurrency(amountPaid)}`, color: '#16a34a', bold: true } : null,
    amountDue > 0 && owedNow.paymentType === 'deposit'
      ? { label: `Balance on delivery`, value: formatCurrency(amountDue - owedNow.amount) }
      : null,
  ];
  const totalBand = amountDue <= 0
    ? { label: 'Status', value: 'PAID', color: '#16a34a' }
    : owedNow.paymentType === 'deposit'
    ? { label: `Due Now (${owedNow.depositPercent}% deposit)`, value: formatCurrency(owedNow.amount), color: BRAND_ORANGE }
    : { label: 'Amount Due (USD)', value: formatCurrency(amountDue), color: BRAND_ORANGE };

  const buttons = [];
  if (paymentUrl) buttons.push({ label: '&#128179;&nbsp; Pay Invoice', href: paymentUrl, style: 'primary' });
  buttons.push({ label: '&#8681;&nbsp; Download PDF', href: pdfUrl, style: 'outline' });
  buttons.push({ label: '&#128172;&nbsp; Contact TSB', href: `mailto:${theme.SHOP_EMAIL}?subject=Invoice%20${encodeURIComponent(invoice.invoice_number || '')}`, style: 'navy' });

  return theme.emailShell({
    title: `Invoice ${invoice.invoice_number}`,
    headerTr: theme.docHeader({
      metaLines: [
        `Invoice # <strong style="color:${BRAND_DARK};">${invoice.invoice_number}</strong>`,
        invoice.quote_id ? `Order # TSB-${invoice.quote_id}` : null,
        `Invoice Date &nbsp;${theme.fmtDate(invoice.created_at)}`,
        dueDisplay ? `Due &nbsp;${dueDisplay}` : null,
      ],
      pill: amountDue <= 0 ? theme.statusPill('Paid', 'green') : theme.statusPill('Payment Due'),
    }),
    sections: [
      theme.hero({
        titleTop: 'Your Invoice',
        titleAccent: 'is Ready!',
        greeting: `Hi ${invoice.customer_name || 'there'},`,
        copy: 'Your invoice for your custom apparel order is ready. Thank you for choosing T-Shirt Brothers! We appreciate your business and look forward to continuing to bring your ideas to life.',
      }),
      theme.bodySection(theme.infoPanels([
        { label: 'Customer Information', lines: [
          theme.escapeHtml(invoice.customer_name || ''),
          theme.escapeHtml(invoice.customer_email || ''),
          theme.escapeHtml(invoice.customer_phone || ''),
        ] },
        invoice.customer_address ? { label: 'Billing Information', lines: [theme.escapeHtml(invoice.customer_address)] } : null,
        { label: 'Payment Terms', lines: [
          owedNow.paymentType === 'deposit' ? `<strong>${owedNow.depositPercent}% deposit up front</strong>` : (amountDue <= 0 ? 'Paid' : '<strong>Due upon receipt</strong>'),
          termsLine || 'Thank you for your payment.',
        ] },
      ].filter(Boolean))),
      mockups.length ? theme.bodySection(`
        ${theme.sectionTitle('Approved Mockup')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;"><tr>
          ${mockups.slice(0, 3).map((m) => `<td style="text-align:center;padding:12px;">
            ${m.label ? `<div style="font-size:10px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${m.label}</div>` : ''}
            <img src="${m.src}" alt="Mockup" style="max-width:100%;height:auto;border-radius:8px;" />
          </td>`).join('')}
        </tr></table>
      `) : '',
      theme.bodySection(`
        ${theme.sectionTitle('Invoice Items')}
        ${theme.itemsTable(itemRows, { unitLabel: 'Unit Price' })}
      `),
      theme.bodySection(`
        ${theme.sectionTitle('Invoice Summary')}
        ${theme.summaryTable(summaryRows.filter(Boolean), totalBand)}
        ${termsLine ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;text-align:center;"><strong>Payment terms:</strong> ${termsLine}</p>` : ''}
      `),
      invoice.notes ? theme.bodySection(`
        <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#166534;">Notes</p>
          <p style="margin:4px 0 0;font-size:13px;color:#166534;">${theme.escapeHtml(invoice.notes)}</p>
        </div>
      `) : '',
      promo ? theme.bodySection(theme.couponPanel(promo)) : '',
      theme.bodySection(`
        ${theme.buttonRow(buttons)}
        <p style="margin:16px 0 20px;font-size:13px;color:#9ca3af;text-align:center;">Questions about this invoice? Reply to this email or call ${theme.SHOP_PHONE}.</p>
      `),
    ].filter(Boolean),
  });
}

// All routes require admin auth
// Public: minimal invoice view (for customer print/share link). Returns only
// customer-visible fields. Does NOT require auth so the email link works.
router.get('/public/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, m.preview_image_url AS mockup_preview_url, m.preview_image_url_back AS mockup_preview_url_back
         FROM invoices i
         LEFT JOIN mockups m ON m.id = i.mockup_id
        WHERE i.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const i = rows[0];
    const owed = computeAmountOwed(i);
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
      deposit_percent: i.deposit_percent,
      // Server-computed so the Pay button can never quote a different figure
      // from the one the Stripe session is created for.
      amount_due_now: owed.amount,
      payment_type: owed.paymentType,
      mockup_id: i.mockup_id,
      mockup_preview_url: i.mockup_preview_url,
      mockup_preview_url_back: i.mockup_preview_url_back,
    });
  } catch (err) { next(err); }
});

// POST /public/:id/create-checkout - Mint a fresh Stripe Checkout session for
// an invoice and hand back its URL. Public for the same reason GET /public/:id
// is: the customer paying has no account. Creating a session leaks nothing —
// the worst an id-guesser achieves is paying someone else's bill.
router.post('/public/:id/create-checkout', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = rows[0];
    const owed = computeAmountOwed(invoice);
    if (owed.amount <= 0) {
      return res.status(400).json({ error: 'This invoice is already paid in full.' });
    }

    const session = await createInvoiceCheckoutSession(invoice, owed);
    res.json({ checkoutUrl: session.url, amount: owed.amount, paymentType: owed.paymentType });
  } catch (err) {
    next(err);
  }
});

// Public: PDF of the invoice. Accessed from the customer success page's
// "Download invoice" button — no auth, just the invoice id.
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${inv.invoice_number}.pdf"`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    doc.pipe(res);

    const items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []);
    const isPaid = inv.status === 'paid' || Number(inv.amount_due) <= 0;

    // Header
    doc.fillColor(BRAND_DARK).fontSize(22).font('Helvetica-Bold').text('TShirt Brothers', 50, 50);
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
      .text('6010 Renaissance Parkway', 50, 78)
      .text('Fairburn, GA 30213', 50, 90)
      .text('(470) 622-1392', 50, 102);
    doc.fontSize(20).font('Helvetica-Bold').fillColor(BRAND_DARK).text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text(inv.invoice_number, 400, 78, { align: 'right' });
    if (isPaid) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#16a34a').text('PAID', 400, 95, { align: 'right' });
    }

    // Bill to
    let y = 140;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af').text('BILL TO', 50, y);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_DARK).text(inv.customer_name, 50, y + 12);
    doc.fontSize(10).font('Helvetica').fillColor('#4b5563');
    let lineY = y + 28;
    if (inv.customer_email) { doc.text(inv.customer_email, 50, lineY); lineY += 12; }
    if (inv.customer_phone) { doc.text(inv.customer_phone, 50, lineY); lineY += 12; }

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af').text('DATE', 400, y, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor(BRAND_DARK)
      .text(new Date(inv.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 400, y + 12, { align: 'right' });
    if (inv.due_date) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af').text('DUE', 400, y + 30, { align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor(BRAND_DARK)
        .text(new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 400, y + 42, { align: 'right' });
    } else if (!isPaid) {
      const owedPdf = computeAmountOwed(inv);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af').text('DUE', 400, y + 30, { align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor(BRAND_DARK)
        .text(owedPdf.paymentType === 'balance' ? 'On delivery' : 'Upon receipt', 400, y + 42, { align: 'right' });
    }

    // Items table
    const tableTop = Math.max(lineY, y + 70) + 20;
    doc.moveTo(50, tableTop).lineTo(562, tableTop).strokeColor('#e5e7eb').stroke();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#6b7280');
    doc.text('DESCRIPTION', 50, tableTop + 8, { width: 280 });
    doc.text('QTY', 330, tableTop + 8, { width: 50, align: 'center' });
    doc.text('UNIT', 380, tableTop + 8, { width: 80, align: 'right' });
    doc.text('TOTAL', 462, tableTop + 8, { width: 100, align: 'right' });
    doc.moveTo(50, tableTop + 24).lineTo(562, tableTop + 24).strokeColor('#e5e7eb').stroke();

    let rowY = tableTop + 32;
    doc.fontSize(10).font('Helvetica').fillColor(BRAND_DARK);
    for (const it of items) {
      const desc = it.description || '—';
      const qty = it.quantity || 1;
      const unit = Number(it.unit_price || 0);
      const lineTotal = it.total != null ? Number(it.total) : qty * unit;
      const variant = [it.color, it.size].filter(Boolean).join(' · ');
      doc.fontSize(10).fillColor(BRAND_DARK).text(desc, 50, rowY, { width: 280 });
      doc.fillColor('#4b5563').text(String(qty), 330, rowY, { width: 50, align: 'center' });
      doc.text(`$${unit.toFixed(2)}`, 380, rowY, { width: 80, align: 'right' });
      doc.fillColor(BRAND_DARK).text(`$${lineTotal.toFixed(2)}`, 462, rowY, { width: 100, align: 'right' });
      if (variant) {
        doc.fontSize(8).fillColor('#6b7280').text(variant, 50, rowY + 12, { width: 280 });
        rowY += 30;
      } else {
        rowY += 22;
      }
    }
    doc.moveTo(50, rowY + 6).lineTo(562, rowY + 6).strokeColor('#e5e7eb').stroke();

    // Totals (right-aligned column)
    let totalsY = rowY + 22;
    const labelX = 380;
    const valueX = 462;
    const labelW = 80;
    const valueW = 100;
    const drawRow = (label, value, opts = {}) => {
      doc.fontSize(opts.bold ? 11 : 10)
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(opts.color || '#6b7280')
        .text(label, labelX, totalsY, { width: labelW, align: 'right' });
      doc.fillColor(opts.color || BRAND_DARK)
        .text(value, valueX, totalsY, { width: valueW, align: 'right' });
      totalsY += opts.bold ? 20 : 16;
    };
    drawRow('Subtotal', `$${Number(inv.subtotal).toFixed(2)}`);
    if (Number(inv.tax) > 0) drawRow('Tax', `$${Number(inv.tax).toFixed(2)}`);
    if (Number(inv.shipping) > 0) drawRow('Shipping', `$${Number(inv.shipping).toFixed(2)}`);
    if (Number(inv.discount) > 0) drawRow('Discount', `-$${Number(inv.discount).toFixed(2)}`, { color: '#16a34a' });
    doc.moveTo(380, totalsY).lineTo(562, totalsY).strokeColor('#e5e7eb').stroke();
    totalsY += 6;
    drawRow('Total', `$${Number(inv.total).toFixed(2)}`, { bold: true, color: BRAND_DARK });
    if (Number(inv.amount_paid) > 0) drawRow('Paid', `-$${Number(inv.amount_paid).toFixed(2)}`, { color: '#16a34a' });
    doc.moveTo(380, totalsY).lineTo(562, totalsY).strokeColor(BRAND_DARK).lineWidth(1.5).stroke();
    doc.lineWidth(1);
    totalsY += 6;
    drawRow(
      isPaid ? 'Balance' : 'Due',
      `$${Number(inv.amount_due).toFixed(2)}`,
      { bold: true, color: isPaid ? '#16a34a' : BRAND_ORANGE },
    );

    if (inv.notes) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#9ca3af').text('NOTES', 50, totalsY + 30);
      doc.fontSize(10).font('Helvetica').fillColor('#4b5563').text(String(inv.notes), 50, totalsY + 44, { width: 512 });
    }

    if (!isPaid) {
      const owedTerms = computeAmountOwed(inv);
      const terms = owedTerms.paymentType === 'deposit'
        ? `Payment terms: ${owedTerms.depositPercent}% deposit ($${owedTerms.amount.toFixed(2)}) due upon receipt; remaining balance due on delivery.`
        : owedTerms.paymentType === 'balance'
        ? 'Payment terms: remaining balance due on delivery.'
        : 'Payment terms: due upon receipt.';
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
        .text(terms, 50, 700, { align: 'center', width: 512 });
    }

    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#9ca3af')
      .text('Thank you for your business!', 50, 720, { align: 'center', width: 512 });

    doc.end();
  } catch (err) { next(err); }
});

router.use(authenticate, adminOnly);

// POST /:id/send-sms - text the customer a link to the invoice.
// The link is the invoice page, which carries its own Pay button, so a texted
// invoice is payable for as long as it is open (unlike a Stripe session URL).
router.post('/:id/send-sms', async (req, res, next) => {
  let inv;
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    inv = rows[0];
  } catch (err) {
    return next(err);
  }

  if (!inv.customer_phone) return res.status(400).json({ error: 'No phone number on this invoice' });

  try {
    const { smsInvoiceLinkToCustomer } = await import('../services/sms.js');
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const sid = await smsInvoiceLinkToCustomer(inv, `${domain}/invoice/view/${inv.id}`);
    res.json({ sent: true, sid });
  } catch (err) {
    // Reported here rather than handed to the generic error middleware, which
    // replaces err.message with "Internal server error" in production. This
    // route used to answer { sent: true } even when Twilio was unconfigured
    // and nothing went out; an admin needs to see why a text failed.
    console.error('[Invoice SMS] failed for invoice ' + inv.id + ':', err);
    res.status(502).json({ error: `Could not text this invoice: ${err.message}` });
  }
});

// GET / - List all invoices, optional ?status= filter
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let whereClause = '';
    const params = [];

    // Archived invoices leave the normal views (status=archived shows them).
    if (status === 'archived') {
      whereClause = 'WHERE i.archived_at IS NOT NULL';
    } else if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE i.archived_at IS NULL AND i.status = $${params.length}`;
    } else {
      whereClause = 'WHERE i.archived_at IS NULL';
    }

    const { rows } = await pool.query(
      `SELECT i.*, m.preview_image_url AS mockup_preview_url, m.preview_image_url_back AS mockup_preview_url_back
         FROM invoices i
         LEFT JOIN mockups m ON m.id = i.mockup_id
         ${whereClause ? whereClause.replace('WHERE status', 'WHERE i.status') : ''}
        ORDER BY i.created_at DESC`,
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
    const { rows } = await pool.query(
      `SELECT i.*, m.preview_image_url AS mockup_preview_url, m.preview_image_url_back AS mockup_preview_url_back
         FROM invoices i
         LEFT JOIN mockups m ON m.id = i.mockup_id
        WHERE i.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Sanitize the extra_mockups jsonb payload: https-only urls, capped list.
function cleanExtraMockups(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m) => m && typeof m.front === 'string' && /^https:\/\//.test(m.front))
    .slice(0, 12)
    .map((m) => ({
      mockup_id: Number.isInteger(m.mockup_id) ? m.mockup_id : null,
      front: m.front,
      back: typeof m.back === 'string' && /^https:\/\//.test(m.back) ? m.back : null,
    }));
}

// POST / - Create invoice
router.post('/', async (req, res, next) => {
  try {
    const {
      customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, tax, shipping, discount, total, notes, due_date, quote_id,
      deposit_percent, mockup_id, extra_mockups,
    } = req.body;

    if (!customer_name || !customer_email) {
      return res.status(400).json({ error: 'customer_name and customer_email are required' });
    }

    const invoice_number = await generateInvoiceNumber();
    const amount_due = Number(total) || 0;
    const depositPct = Math.max(0, Math.min(100, parseInt(deposit_percent, 10) || 0));

    const { rows } = await pool.query(
      `INSERT INTO invoices
        (invoice_number, customer_name, customer_email, customer_phone, customer_address,
         items, subtotal, tax, shipping, discount, total, amount_paid, amount_due,
         notes, due_date, quote_id, status, deposit_percent, mockup_id, extra_mockups)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15,'draft',$16,$17,$18::jsonb)
       RETURNING *`,
      [
        invoice_number, customer_name, customer_email, customer_phone || null,
        (customer_address && customer_address !== '') ? (typeof customer_address === 'string' ? JSON.stringify({ address: customer_address }) : JSON.stringify(customer_address)) : null,
        JSON.stringify(items || []), Number(subtotal) || 0, Number(tax) || 0, Number(shipping) || 0, Number(discount) || 0, Number(total) || 0,
        amount_due, notes || null, due_date || null, quote_id || null, depositPct,
        mockup_id ? Number(mockup_id) : null,
        JSON.stringify(cleanExtraMockups(extra_mockups)),
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
      deposit_percent, mockup_id, extra_mockups,
    } = req.body;

    const existing = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const inv = existing.rows[0];
    const newTotal = total !== undefined ? Number(total) : Number(inv.total);
    const newAmountPaid = Number(inv.amount_paid);
    const newAmountDue = newTotal - newAmountPaid;

    // A total change can invalidate a payment-derived status: raising the
    // total on a 'paid' invoice reopens a balance, and lowering it on a
    // 'partial' one can settle it. Recompute unless the caller is
    // explicitly setting a status.
    let newStatus = status || null;
    if (!newStatus && newAmountPaid > 0 && ['paid', 'partial'].includes(inv.status)) {
      newStatus = newAmountDue <= 0 ? 'paid' : 'partial';
    }

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
        deposit_percent = COALESCE($16, deposit_percent),
        mockup_id = COALESCE($17, mockup_id),
        extra_mockups = COALESCE($18::jsonb, extra_mockups),
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
        newAmountDue, notes, due_date, newStatus,
        deposit_percent !== undefined ? Math.max(0, Math.min(100, parseInt(deposit_percent, 10) || 0)) : null,
        mockup_id !== undefined ? (mockup_id ? Number(mockup_id) : null) : null,
        extra_mockups !== undefined ? JSON.stringify(cleanExtraMockups(extra_mockups)) : null,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /:id/send - Email the invoice with a Pay Now link.
// The link points at the invoice page, which mints the Stripe session on
// click (see createInvoiceCheckoutSession for why it is not minted here).
// What gets charged — deposit vs. balance vs. full — is decided at that
// point by computeAmountOwed, so re-sending an invoice after a partial
// payment naturally asks for the remainder.
router.post('/:id/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT i.*, m.preview_image_url AS mockup_preview_url, m.preview_image_url_back AS mockup_preview_url_back
         FROM invoices i
         LEFT JOIN mockups m ON m.id = i.mockup_id
        WHERE i.id = $1`,
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = rows[0];
    if (!invoice.customer_email) {
      return res.status(400).json({ error: 'No email address on this invoice' });
    }

    const owed = computeAmountOwed(invoice);
    const { paymentType } = owed;

    // If nothing is owed, send a receipt (no Pay Now button).
    const isReceipt = owed.amount <= 0;

    // Link to the invoice page, NOT a Stripe session URL. Sessions expire 24h
    // after creation, so a session minted here was dead by the time most
    // customers got round to paying. The invoice page mints a fresh one on
    // click, so this link stays good for the life of the invoice.
    const paymentUrl = isReceipt ? null : `${DOMAIN}/invoice/view/${id}`;

    const subject = isReceipt
      ? `Receipt for Invoice ${invoice.invoice_number} from TShirt Brothers`
      : paymentType === 'deposit'
      ? `Deposit due — Invoice ${invoice.invoice_number} from TShirt Brothers`
      : paymentType === 'balance'
      ? `Balance due — Invoice ${invoice.invoice_number} from TShirt Brothers`
      : `Invoice ${invoice.invoice_number} from TShirt Brothers`;

    const html = await buildInvoiceEmailHtml(invoice, paymentUrl);

    // Resend REPORTS send failures in the response rather than throwing them,
    // so a bare `await` reads a rejected send as a successful one and the
    // surrounding try/catch never fires. This route used to mark the invoice
    // 'sent' and answer 200 on that path, so an unverified sending domain, a
    // bad recipient, or a rate limit looked exactly like a delivered email
    // while the customer got nothing.
    //
    // Config problems DO throw (getResend() with no RESEND_API_KEY), so both
    // shapes are collected here and reported the same way.
    let sendError = null;
    try {
      ({ error: sendError } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: [invoice.customer_email],
        subject,
        html,
      }));
    } catch (err) {
      sendError = err;
    }

    if (sendError) {
      console.error(
        `[Invoice] Resend rejected invoice ${invoice.invoice_number} to ${invoice.customer_email}:`,
        sendError,
      );
      // Said here rather than thrown, because the generic error middleware
      // replaces err.message with "Internal server error" in production and
      // the reason is the whole point.
      return res.status(502).json({
        error: `Could not email this invoice: ${sendError.message || 'the mail provider rejected it.'}`,
      });
    }

    // Only now is the invoice genuinely sent.
    // Don't downgrade a paid invoice back to 'sent'; just bump sent_at.
    const updated = await pool.query(
      isReceipt
        ? `UPDATE invoices SET sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`
        : `UPDATE invoices SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
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
    // Flip to 'partial' when some — but not all — of the total has been
    // paid, so the UI can show a distinct status badge and the admin can
    // see at a glance which invoices have a balance still due.
    const newStatus = newAmountDue <= 0
      ? 'paid'
      : (newAmountPaid > 0 ? 'partial' : invoice.status);

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

// Archive/restore an invoice — archived invoices leave the pipeline and
// invoice lists (mirrors the quote archive added the same day).
router.post('/:id/archive', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE invoices SET archived_at = NOW(), archive_reason = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id`,
      [req.params.id, String(req.body?.reason || 'archived').slice(0, 60)],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found or already archived' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/unarchive', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE invoices SET archived_at = NULL, archive_reason = NULL WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
