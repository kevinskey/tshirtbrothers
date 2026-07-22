import { Router } from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import pool from '../db.js';
import {
  sendQuoteAcceptedNotification,
  sendDepositReceiptToCustomer,
  sendPaidInvoiceReceipt,
} from '../services/email.js';
import { smsQuoteAcceptedToAdmin, smsInvoiceReceiptToCustomer } from '../services/sms.js';
import { captureStoreOrder } from '../services/storeOrderCapture.js';

const router = Router();

// ── Create a paid invoice record + email a receipt when a balance payment
// succeeds. Idempotent: if an invoice for this quote already exists it just
// marks it paid. Returns the invoice row (or null if creation failed).
async function createPaidInvoiceForQuote(quote, amountPaidCents) {
  try {
    const total = Number(quote.estimated_price || 0);
    const amountPaid = (amountPaidCents || 0) / 100;
    const items = [
      {
        description: quote.product_name || 'Custom printing order',
        quantity: quote.quantity || 1,
        unit_price: quote.quantity ? total / quote.quantity : total,
        total,
      },
    ];

    // If we already created an invoice for this quote, just mark it paid.
    const existing = await pool.query(
      'SELECT * FROM invoices WHERE quote_id = $1 ORDER BY id DESC LIMIT 1',
      [quote.id],
    );
    let invoice;
    if (existing.rows.length > 0) {
      const { rows } = await pool.query(
        `UPDATE invoices SET amount_paid = $1, amount_due = 0, status = 'paid', updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [total, existing.rows[0].id],
      );
      invoice = rows[0];
    } else {
      // Generate next invoice number
      const seq = await pool.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\\d+)') AS INTEGER)), 1000) + 1 AS next_num FROM invoices`,
      );
      const invoiceNumber = `INV-${seq.rows[0].next_num}`;
      const { rows } = await pool.query(
        `INSERT INTO invoices
           (invoice_number, customer_name, customer_email, customer_phone,
            items, subtotal, tax, shipping, discount, total, amount_paid, amount_due,
            quote_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,0,0,0,$7,$8,0,$9,'paid')
         RETURNING *`,
        [
          invoiceNumber,
          quote.customer_name || '',
          quote.customer_email || '',
          quote.customer_phone || null,
          JSON.stringify(items),
          total,
          total,
          amountPaid || total,
          quote.id,
        ],
      );
      invoice = rows[0];
    }

    // Best-effort notifications (don't block or fail the webhook)
    try {
      if (typeof sendPaidInvoiceReceipt === 'function' && invoice.customer_email) {
        await sendPaidInvoiceReceipt(invoice);
      }
    } catch (emailErr) {
      console.error('[invoice receipt email] failed:', emailErr.message);
    }
    try {
      if (typeof smsInvoiceReceiptToCustomer === 'function' && invoice.customer_phone) {
        await smsInvoiceReceiptToCustomer(invoice);
      }
    } catch (smsErr) {
      console.error('[invoice receipt sms] failed:', smsErr.message);
    }

    return invoice;
  } catch (err) {
    console.error('[createPaidInvoiceForQuote] failed:', err);
    return null;
  }
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

// Apply a payment to an existing invoice row. Used by the Stripe webhook
// when metadata.invoice_id is set on a checkout session. Mirrors the
// admin /:id/record-payment handler in routes/invoices.js — both append
// to the same `payments` JSONB column so the invoice's payment history
// is one canonical list regardless of where the money came from.
//
// Idempotent: if the payment_intent_id is already in `payments`, no-op.
async function applyPaymentToInvoice({ invoiceId, amount, paymentIntentId, method = 'stripe' }) {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  if (rows.length === 0) return null;
  const inv = rows[0];

  const existingPayments = Array.isArray(inv.payments)
    ? inv.payments
    : (typeof inv.payments === 'string' ? JSON.parse(inv.payments || '[]') : []);

  if (paymentIntentId && existingPayments.some((p) => p.payment_intent_id === paymentIntentId)) {
    return inv; // already recorded
  }

  const total = Number(inv.total);
  const newPaid = +(Number(inv.amount_paid || 0) + Number(amount)).toFixed(2);
  const newDue = +(total - newPaid).toFixed(2);
  const newStatus = newDue <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : inv.status);

  const newPayments = [
    ...existingPayments,
    {
      amount: Number(amount),
      method,
      payment_intent_id: paymentIntentId || null,
      date: new Date().toISOString(),
    },
  ];

  const updated = await pool.query(
    `UPDATE invoices SET
       amount_paid = $2,
       amount_due  = $3,
       status      = $4,
       payments    = $5,
       updated_at  = NOW()
     WHERE id = $1
     RETURNING *`,
    [invoiceId, newPaid, Math.max(0, newDue), newStatus, JSON.stringify(newPayments)],
  );

  const row = updated.rows[0];

  // Send the receipt only when the invoice flips to fully paid, so partial
  // (deposit) payments don't trigger a "thanks, paid in full" email.
  if (newStatus === 'paid') {
    try {
      if (typeof sendPaidInvoiceReceipt === 'function' && row.customer_email) {
        await sendPaidInvoiceReceipt(row);
      }
    } catch (err) {
      console.error('[invoice receipt email] failed:', err.message);
    }
    try {
      if (typeof smsInvoiceReceiptToCustomer === 'function' && row.customer_phone) {
        await smsInvoiceReceiptToCustomer(row);
      }
    } catch (err) {
      console.error('[invoice receipt sms] failed:', err.message);
    }
  }

  return row;
}

export { applyPaymentToInvoice };

// POST /create-checkout - Create Stripe Checkout session for deposit payment
router.post('/create-checkout', async (req, res, next) => {
  try {
    const { quoteId, token } = req.body;

    if (!quoteId) {
      return res.status(400).json({ error: 'quoteId is required' });
    }

    // Look up the quote
    const quoteResult = await pool.query(
      'SELECT * FROM quotes WHERE id = $1',
      [quoteId]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    // Validate accept token if provided
    if (token && quote.accept_token && token !== quote.accept_token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Calculate deposit amount
    const total = parseFloat(quote.estimated_price || 0);
    if (total <= 0) {
      return res.status(400).json({ error: 'Quote has no price set yet' });
    }

    const depositPercent = 50; // Could read from settings table
    const depositAmount = Math.round((total * depositPercent / 100) * 100); // in cents

    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Deposit - ${quote.product_name || 'Custom Printing Order'}`,
              description: `${depositPercent}% deposit for Quote #${quote.id}. Customer: ${quote.customer_name || 'N/A'}`,
            },
            unit_amount: depositAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${domain}/payment/success?quote=${quoteId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/payment/cancel?quote=${quoteId}`,
      customer_email: quote.customer_email || undefined,
      metadata: {
        quoteId: String(quote.id),
        customerName: quote.customer_name || '',
        depositPercent: String(depositPercent),
        type: 'deposit',
      },
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// POST /create-full-checkout - Create Stripe Checkout session for the
// full quote amount in one transaction. Customer opts into this from the
// payment-choice screen instead of paying the 50% deposit and a separate
// balance later. Behaves like the deposit flow downstream: the webhook
// marks the quote accepted AND sets deposit_amount = total + balance_paid_at,
// so /admin and the customer's receipt show "Paid in full" immediately.
router.post('/create-full-checkout', async (req, res, next) => {
  try {
    const { quoteId, token } = req.body;

    if (!quoteId) {
      return res.status(400).json({ error: 'quoteId is required' });
    }

    const quoteResult = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    if (token && quote.accept_token && token !== quote.accept_token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const total = parseFloat(quote.estimated_price || 0);
    if (total <= 0) {
      return res.status(400).json({ error: 'Quote has no price set' });
    }

    const fullAmountCents = Math.round(total * 100);
    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Full Payment - ${quote.product_name || 'Custom Printing Order'}`,
              description: `Quote #${quote.id}. Customer: ${quote.customer_name || 'N/A'}`,
            },
            unit_amount: fullAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${domain}/payment/success?quote=${quoteId}&session_id={CHECKOUT_SESSION_ID}&type=full`,
      cancel_url: `${domain}/payment/cancel?quote=${quoteId}`,
      customer_email: quote.customer_email || undefined,
      metadata: {
        quoteId: String(quote.id),
        customerName: quote.customer_name || '',
        type: 'full',
      },
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// POST /create-balance-checkout - Create Stripe Checkout session for remaining balance
router.post('/create-balance-checkout', async (req, res, next) => {
  try {
    const { quoteId, token } = req.body;

    if (!quoteId) {
      return res.status(400).json({ error: 'quoteId is required' });
    }

    const quoteResult = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    // Validate accept token if provided
    if (token && quote.accept_token && token !== quote.accept_token) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (quote.status !== 'accepted') {
      return res.status(400).json({ error: 'Quote must be accepted before paying balance' });
    }

    const total = parseFloat(quote.estimated_price || 0);
    const depositPaid = parseFloat(quote.deposit_amount || 0);
    const balanceDue = total - depositPaid;

    if (balanceDue <= 0) {
      return res.status(400).json({ error: 'No balance due — already paid in full' });
    }

    const balanceAmountCents = Math.round(balanceDue * 100);

    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Balance - ${quote.product_name || 'Custom Printing Order'}`,
              description: `Remaining balance for Quote #${quote.id}. Customer: ${quote.customer_name || 'N/A'}`,
            },
            unit_amount: balanceAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${domain}/payment/success?quote=${quoteId}&session_id={CHECKOUT_SESSION_ID}&type=balance`,
      cancel_url: `${domain}/payment/cancel?quote=${quoteId}`,
      customer_email: quote.customer_email || undefined,
      metadata: {
        quoteId: String(quote.id),
        customerName: quote.customer_name || '',
        type: 'balance',
      },
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// POST /create-store-checkout - Franchise store buyer checkout.
//
// Public — a buyer (not the store owner) POSTs to this. We validate the
// product is currently sellable, then create a Stripe Checkout Session
// with metadata.store_id + store_product_id so the webhook can route
// the completion to captureStoreOrder().
//
// Body: {
//   store_slug: string,
//   product_slug: string,
//   qty: number,               // default 1
//   variant?: object,          // e.g. { size: "L", color: "Black" }
//   buyer_email?: string,
//   success_url?: string,      // frontend post-purchase redirect
//   cancel_url?: string,
// }
router.post('/create-store-checkout', async (req, res, next) => {
  try {
    const {
      store_slug, product_slug, qty: qtyRaw, variant,
      buyer_email, success_url, cancel_url,
    } = req.body ?? {};

    if (!store_slug || !product_slug) {
      return res.status(400).json({ error: 'store_slug + product_slug required' });
    }
    const qty = Math.min(Math.max(parseInt(String(qtyRaw ?? '1'), 10), 1), 100);

    // Load product + store, enforce currently-sellable + validate window.
    const q = await pool.query(
      `SELECT sp.id AS product_id, sp.store_id, sp.title, sp.slug, sp.cover_image,
              sp.retail_price_cents, sp.is_active,
              sp.opens_at, sp.closes_at,
              s.name AS store_name, s.slug AS store_slug
         FROM store_products sp
         JOIN stores s ON s.id = sp.store_id
        WHERE s.slug = $1 AND s.status = 'active'
          AND sp.slug = $2`,
      [store_slug, product_slug],
    );
    const product = q.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.is_active) return res.status(410).json({ error: 'Product not currently for sale' });
    const now = new Date();
    if (product.opens_at && now < new Date(product.opens_at)) {
      return res.status(410).json({ error: 'Product not yet on sale' });
    }
    if (product.closes_at && now >= new Date(product.closes_at)) {
      return res.status(410).json({ error: 'Product sale has closed' });
    }

    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';

    const variantSummary = variant && typeof variant === 'object'
      ? Object.entries(variant).map(([k, v]) => `${k}: ${v}`).join(', ')
      : null;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${product.title}${variantSummary ? ` (${variantSummary})` : ''}`,
              description: `From ${product.store_name}`,
              ...(product.cover_image ? { images: [product.cover_image] } : {}),
            },
            unit_amount: product.retail_price_cents,
          },
          quantity: qty,
        },
      ],
      mode: 'payment',
      customer_email: buyer_email || undefined,
      success_url: success_url
        ? `${success_url}${success_url.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
        : `${domain}/store/${store_slug}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${domain}/store/${store_slug}/product/${product_slug}`,
      // Stripe metadata values must be strings ≤ 500 chars.
      metadata: {
        store_id: String(product.store_id),
        store_slug,
        store_product_id: String(product.product_id),
        product_slug,
        qty: String(qty),
        ...(variant ? { variant: JSON.stringify(variant).slice(0, 500) } : {}),
      },
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// Process a checkout.session.completed event: update the quote/invoice and
// fire off receipts. Runs after we've already 200'd Stripe so a slow Resend or
// Twilio call can't blow the webhook's HTTP timeout.
async function handleCheckoutSessionCompleted(session) {
  const quoteId = session.metadata?.quoteId;
  const invoiceId = session.metadata?.invoice_id;
  const storeId = session.metadata?.store_id;
  const paymentType = session.metadata?.type || session.metadata?.payment_type || 'deposit';

  // Franchise-store checkout: distinct metadata shape from quote/invoice
  // flows. Route to the store capture pipeline (which handles idempotency,
  // ledger credit, and the outbound order.created webhook) and return —
  // franchise sessions never hit the quote/invoice branches below.
  if (storeId) {
    try {
      await captureStoreOrder(session);
    } catch (err) {
      console.error('[Stripe Webhook] store capture failed:', err);
    }
    return;
  }

  // Invoice payment: separate metadata shape from the quote flow. The
  // checkout session is created in routes/invoices.js with metadata
  // { invoice_id, payment_type }. Without this branch the webhook would
  // silently drop the event and the invoice would stay at amount_paid=0
  // even after a successful charge.
  if (invoiceId) {
    try {
      const amount = (session.amount_total || 0) / 100;
      const updated = await applyPaymentToInvoice({
        invoiceId: parseInt(invoiceId, 10),
        amount,
        paymentIntentId: session.payment_intent || null,
      });
      if (updated) {
        console.log('[Stripe] Invoice #' + invoiceId + ' payment recorded: $' + amount + ' (' + paymentType + ')');
      }
    } catch (err) {
      console.error('[Stripe Webhook] invoice update failed:', err);
    }
  }

  if (quoteId) {
    try {
      if (paymentType === 'balance') {
        const result = await pool.query(
          `UPDATE quotes SET
            deposit_amount = estimated_price,
            balance_paid_at = NOW()
          WHERE id = $1
          RETURNING *`,
          [quoteId]
        );
        if (result.rows.length > 0) {
          console.log('[Stripe] Quote #' + quoteId + ' balance paid: $' + (session.amount_total / 100));
          await createPaidInvoiceForQuote(result.rows[0], session.amount_total);
        }
      } else if (paymentType === 'full') {
        // Full payment from the choice screen — accept the quote AND
        // mark the balance paid in one shot, then create the paid
        // invoice + send all notifications (admin + customer receipt).
        const newToken = crypto.randomBytes(32).toString('hex');
        const result = await pool.query(
          `UPDATE quotes SET
            status = 'accepted',
            accepted_at = COALESCE(accepted_at, NOW()),
            deposit_amount = estimated_price,
            balance_paid_at = NOW(),
            accept_token = COALESCE(accept_token, $2)
          WHERE id = $1
          RETURNING *`,
          [quoteId, newToken],
        );
        if (result.rows.length > 0) {
          const quote = result.rows[0];
          console.log('[Stripe] Quote #' + quoteId + ' paid in full: $' + (session.amount_total / 100));
          await createPaidInvoiceForQuote(quote, session.amount_total);
          sendQuoteAcceptedNotification(quote).catch(() => {});
          smsQuoteAcceptedToAdmin(quote).catch(() => {});
        }
      } else {
        // Backfill accept_token for orders that went through the instant-quote
        // /lock-in path (which never generates one) so the deposit receipt's
        // balance-payment link is uniquely tied to this customer's order.
        const newToken = crypto.randomBytes(32).toString('hex');
        const result = await pool.query(
          `UPDATE quotes SET
            status = 'accepted',
            accepted_at = NOW(),
            deposit_amount = $1,
            accept_token = COALESCE(accept_token, $3)
          WHERE id = $2
          RETURNING *`,
          [session.amount_total / 100, quoteId, newToken]
        );
        if (result.rows.length > 0) {
          const quote = result.rows[0];
          console.log('[Stripe] Quote #' + quoteId + ' deposit paid: $' + (session.amount_total / 100));
          sendQuoteAcceptedNotification(quote).catch(() => {});
          sendDepositReceiptToCustomer(quote).catch(() => {});
          smsQuoteAcceptedToAdmin(quote).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Stripe Webhook] DB update failed:', err);
    }
  }

  if (!invoiceId && !quoteId) {
    console.warn('[Stripe Webhook] checkout.session.completed had no quoteId or invoice_id in metadata; session=' + session.id);
  }
}

// POST /webhook - Stripe webhook for payment confirmation.
//
// Stripe expects a 2xx response within seconds; if we wait on DB writes plus
// Resend plus Twilio before responding, slow upstreams cause webhook timeouts
// and the endpoint gets disabled. We verify the signature, ack immediately,
// then process the event asynchronously.
router.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Stripe sends a Buffer (because index.js mounts express.raw on this path).
  // If something upstream JSON-parsed it instead, signature verification can
  // never succeed — log loudly so this misconfiguration doesn't hide.
  if (!Buffer.isBuffer(req.body)) {
    console.error('[Stripe Webhook] req.body is not a Buffer (type=' + typeof req.body + '). Raw body middleware is not running for this route.');
    return res.status(400).send('Webhook Error: raw body not available');
  }

  let event;
  if (endpointSecret) {
    if (!sig) {
      console.error('[Stripe Webhook] missing stripe-signature header');
      return res.status(400).send('Webhook Error: missing signature');
    }
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // No secret configured — accept events unverified (dev/staging only).
    console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set; skipping signature verification');
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      console.error('[Stripe Webhook] failed to parse body:', err.message);
      return res.status(400).send('Webhook Error: invalid JSON');
    }
  }

  // Acknowledge Stripe immediately. Anything that throws after this point
  // would crash the response if we awaited it, so it goes to a queued
  // handler whose only job is to log on failure.
  res.json({ received: true });

  console.log('[Stripe Webhook] received event ' + event.type + ' (' + event.id + ')');

  if (event.type === 'checkout.session.completed') {
    setImmediate(() => {
      handleCheckoutSessionCompleted(event.data.object).catch((err) => {
        console.error('[Stripe Webhook] handler crashed for ' + event.id + ':', err);
      });
    });
  }
});

// Pull the bits of a Stripe Checkout session the customer-facing success
// page needs (receipt URL, card brand + last4 / wallet, transaction id).
// Returns null if the session can't be retrieved.
async function loadStripePaymentDetails(sessionId) {
  if (!sessionId) return null;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge.payment_method_details'],
    });
    const charge = session.payment_intent?.latest_charge;
    const pmDetails = charge?.payment_method_details;
    const card = pmDetails?.card;
    const wallet = card?.wallet?.type || null; // 'apple_pay', 'google_pay', etc.

    return {
      session,
      transaction_id: charge?.id || session.payment_intent?.id || session.id,
      receipt_url: charge?.receipt_url || null,
      payment_method: card
        ? { brand: card.brand, last4: card.last4, wallet }
        : pmDetails
          ? { brand: pmDetails.type, last4: null, wallet: null }
          : null,
      amount_total: session.amount_total || 0,
      paid: session.payment_status === 'paid',
    };
  } catch (err) {
    console.error('[loadStripePaymentDetails] failed:', err.message);
    return null;
  }
}

// Public success-page payload. Accepts either ?quote=ID or ?invoice=ID
// (plus session_id from Stripe). Returns a uniform shape so the frontend
// can render the same QB-style summary regardless of which flow paid.
//
// Shape: { invoice_number, customer_name, business_name, amount_total,
//   transaction_id, paid_at, payment_method, receipt_url, invoice_pdf_url,
//   payment_type }
router.get('/success', async (req, res, next) => {
  try {
    const { quote: quoteId, invoice: invoiceIdQuery, session_id, type } = req.query;
    if (!quoteId && !invoiceIdQuery) {
      return res.status(400).json({ error: 'Missing quote or invoice ID' });
    }

    const stripeDetails = await loadStripePaymentDetails(session_id);

    // ---------- Invoice flow (came from /api/invoices/:id/send) ----------
    if (invoiceIdQuery) {
      const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceIdQuery]);
      if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

      // If Stripe says paid and our DB hasn't recorded it yet, apply the
      // payment now so the success page never shows "amount due > 0" right
      // after a paid checkout (in case the webhook is slow / not delivered).
      if (stripeDetails?.paid && stripeDetails.session?.metadata?.invoice_id === String(invoiceIdQuery)) {
        await applyPaymentToInvoice({
          invoiceId: parseInt(invoiceIdQuery, 10),
          amount: (stripeDetails.amount_total || 0) / 100,
          paymentIntentId: stripeDetails.session.payment_intent?.id || stripeDetails.session.payment_intent || null,
        });
      }

      const fresh = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceIdQuery]);
      const inv = fresh.rows[0];
      return res.json({
        payment_type: stripeDetails?.session?.metadata?.payment_type || 'invoice',
        business_name: 'TShirt Brothers',
        customer_name: inv.customer_name,
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        amount_total: stripeDetails?.amount_total ?? Math.round(Number(inv.total) * 100),
        amount_due: Number(inv.amount_due),
        paid_at: new Date().toISOString(),
        transaction_id: stripeDetails?.transaction_id || null,
        receipt_url: stripeDetails?.receipt_url || null,
        invoice_pdf_url: `/api/invoices/${inv.id}/pdf`,
        payment_method: stripeDetails?.payment_method || null,
      });
    }

    // ---------- Quote flow (existing deposit/balance behaviour) ----------
    const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    let quote = result.rows[0];
    let invoiceForQuote = null;
    let paymentType = type || stripeDetails?.session?.metadata?.type || 'deposit';

    if (stripeDetails?.paid && stripeDetails.session?.metadata?.quoteId === String(quoteId)) {
      if (paymentType === 'balance') {
        const updated = await pool.query(
          `UPDATE quotes SET
             deposit_amount = estimated_price,
             balance_paid_at = NOW()
           WHERE id = $1 AND balance_paid_at IS NULL
           RETURNING *`,
          [quoteId],
        );
        if (updated.rows.length > 0) {
          quote = updated.rows[0];
          console.log('[Payment Success] Quote #' + quoteId + ' balance verified & paid: $' + (stripeDetails.amount_total / 100));
          invoiceForQuote = await createPaidInvoiceForQuote(quote, stripeDetails.amount_total);
        } else {
          // Already balance-paid earlier — surface the existing invoice.
          const existing = await pool.query(
            'SELECT * FROM invoices WHERE quote_id = $1 ORDER BY id DESC LIMIT 1',
            [quoteId],
          );
          invoiceForQuote = existing.rows[0] || null;
        }
      } else if (paymentType === 'full') {
        // Full payment fallback when the webhook is slow. Accept the
        // quote, set deposit_amount = total, mark balance paid in one
        // shot — same shape as the webhook handler so a refresh after
        // checkout is idempotent.
        const newToken = crypto.randomBytes(32).toString('hex');
        const updated = await pool.query(
          `UPDATE quotes SET
             status = 'accepted',
             accepted_at = COALESCE(accepted_at, NOW()),
             deposit_amount = estimated_price,
             balance_paid_at = COALESCE(balance_paid_at, NOW()),
             accept_token = COALESCE(accept_token, $2)
           WHERE id = $1 AND (status != 'accepted' OR balance_paid_at IS NULL)
           RETURNING *`,
          [quoteId, newToken],
        );
        if (updated.rows.length > 0) {
          quote = updated.rows[0];
          console.log('[Payment Success] Quote #' + quoteId + ' full payment verified: $' + (stripeDetails.amount_total / 100));
          invoiceForQuote = await createPaidInvoiceForQuote(quote, stripeDetails.amount_total);
          sendQuoteAcceptedNotification(quote).catch(() => {});
          smsQuoteAcceptedToAdmin(quote).catch(() => {});
        } else {
          // Already processed — surface the existing invoice.
          const existing = await pool.query(
            'SELECT * FROM invoices WHERE quote_id = $1 ORDER BY id DESC LIMIT 1',
            [quoteId],
          );
          invoiceForQuote = existing.rows[0] || null;
        }
      } else if (quote.status !== 'accepted') {
        const newToken = crypto.randomBytes(32).toString('hex');
        const updated = await pool.query(
          `UPDATE quotes SET
             status = 'accepted',
             accepted_at = NOW(),
             deposit_amount = $1,
             accept_token = COALESCE(accept_token, $3)
           WHERE id = $2 AND status != 'accepted'
           RETURNING *`,
          [stripeDetails.amount_total / 100, quoteId, newToken],
        );
        if (updated.rows.length > 0) {
          quote = updated.rows[0];
          console.log('[Payment Success] Quote #' + quoteId + ' deposit verified & accepted: $' + (stripeDetails.amount_total / 100));
          sendQuoteAcceptedNotification(quote).catch(() => {});
          sendDepositReceiptToCustomer(quote).catch(() => {});
          smsQuoteAcceptedToAdmin(quote).catch(() => {});
        }
      }
    }

    if (!invoiceForQuote && (paymentType === 'balance' || paymentType === 'full')) {
      const existing = await pool.query(
        'SELECT * FROM invoices WHERE quote_id = $1 ORDER BY id DESC LIMIT 1',
        [quoteId],
      );
      invoiceForQuote = existing.rows[0] || null;
    }

    res.json({
      payment_type: paymentType,
      business_name: 'TShirt Brothers',
      customer_name: quote.customer_name,
      product_name: quote.product_name,
      quote_id: quote.id,
      invoice_id: invoiceForQuote?.id || null,
      invoice_number: invoiceForQuote?.invoice_number || null,
      amount_total: stripeDetails?.amount_total ?? Math.round(Number(quote.deposit_amount || 0) * 100),
      amount_due:
        paymentType === 'balance' || paymentType === 'full'
          ? 0
          : Math.max(0, Number(quote.estimated_price || 0) - Number(quote.deposit_amount || 0)),
      paid_at: new Date().toISOString(),
      transaction_id: stripeDetails?.transaction_id || null,
      receipt_url: stripeDetails?.receipt_url || null,
      invoice_pdf_url: invoiceForQuote ? `/api/invoices/${invoiceForQuote.id}/pdf` : null,
      payment_method: stripeDetails?.payment_method || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
