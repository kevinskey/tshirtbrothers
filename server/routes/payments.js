import { Router } from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import { sendQuoteAcceptedNotification } from '../services/email.js';
import { smsQuoteAcceptedToAdmin } from '../services/sms.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

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

// POST /webhook - Stripe webhook for payment confirmation
router.post('/webhook', async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  if (endpointSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    event = JSON.parse(req.body.toString());
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const quoteId = session.metadata?.quoteId;
    const paymentType = session.metadata?.type || 'deposit';

    if (quoteId) {
      try {
        if (paymentType === 'balance') {
          // Balance payment — mark fully paid
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
          }
        } else {
          // Deposit payment — accept quote
          const result = await pool.query(
            `UPDATE quotes SET
              status = 'accepted',
              accepted_at = NOW(),
              deposit_amount = $1
            WHERE id = $2
            RETURNING *`,
            [session.amount_total / 100, quoteId]
          );
          if (result.rows.length > 0) {
            const quote = result.rows[0];
            console.log('[Stripe] Quote #' + quoteId + ' deposit paid: $' + (session.amount_total / 100));
            sendQuoteAcceptedNotification(quote).catch(() => {});
            smsQuoteAcceptedToAdmin(quote).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[Stripe Webhook] DB update failed:', err);
      }
    }
  }

  res.json({ received: true });
});

// GET /success - Verify Stripe payment and update quote status
router.get('/success', async (req, res, next) => {
  try {
    const { quote: quoteId, session_id, type } = req.query;
    if (!quoteId) return res.status(400).json({ error: 'Missing quote ID' });

    const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    const quote = result.rows[0];

    if (session_id) {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid' && session.metadata?.quoteId === String(quoteId)) {
          const paymentType = type || session.metadata?.type || 'deposit';

          if (paymentType === 'balance') {
            // Balance payment — mark fully paid
            const updated = await pool.query(
              `UPDATE quotes SET
                deposit_amount = estimated_price,
                balance_paid_at = NOW()
              WHERE id = $1 AND balance_paid_at IS NULL
              RETURNING *`,
              [quoteId]
            );
            if (updated.rows.length > 0) {
              console.log('[Payment Success] Quote #' + quoteId + ' balance verified & paid: $' + (session.amount_total / 100));
              return res.json({ ...updated.rows[0], payment_type: 'balance' });
            }
          } else if (quote.status !== 'accepted') {
            // Deposit payment — accept quote
            const updated = await pool.query(
              `UPDATE quotes SET
                status = 'accepted',
                accepted_at = NOW(),
                deposit_amount = $1
              WHERE id = $2 AND status != 'accepted'
              RETURNING *`,
              [session.amount_total / 100, quoteId]
            );
            if (updated.rows.length > 0) {
              console.log('[Payment Success] Quote #' + quoteId + ' deposit verified & accepted: $' + (session.amount_total / 100));
              sendQuoteAcceptedNotification(updated.rows[0]).catch(() => {});
              smsQuoteAcceptedToAdmin(updated.rows[0]).catch(() => {});
              return res.json({ ...updated.rows[0], payment_type: 'deposit' });
            }
          }
        }
      } catch (stripeErr) {
        console.error('[Payment Success] Stripe verification failed:', stripeErr.message);
      }
    }

    res.json(quote);
  } catch (err) {
    next(err);
  }
});

export default router;
