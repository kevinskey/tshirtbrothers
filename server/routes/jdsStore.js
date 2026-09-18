// JDS gifts & awards store — curated JDS Industries blanks sold retail
// through Stripe Checkout.
//
// Public:
//   GET  /products            — active products for the storefront
//   POST /checkout            — create a Stripe Checkout session for one SKU
// Admin (authenticate + adminOnly):
//   POST  /admin/publish      — publish a JDS SKU with a retail price
//   GET   /admin/products     — every published product (active or not)
//   PATCH /admin/products/:id — price / active / weight tweaks
//   GET   /admin/orders       — captured Stripe orders, newest first
//
// Order capture lives in routes/payments.js's webhook (metadata.jds_sku)
// so all Stripe events keep flowing through the one signed endpoint.
// Fulfillment is manual on jdsindustries.com — JDS has no ordering API.

import { Router } from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchJdsProducts } from '../services/jds.js';
import { parcelOunces, shippingChoicesForOunces } from '../lib/shippingRates.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe not configured');
  return new Stripe(key);
}

// ── Public: storefront list ──────────────────────────────────────────────
router.get('/products', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, sku, name, description, image_url, retail_price_cents
         FROM jds_products WHERE active ORDER BY created_at DESC`,
    );
    res.json({ products: rows });
  } catch (err) { next(err); }
});

// ── Public: checkout ─────────────────────────────────────────────────────
// Body: { sku, qty?, buyer_email?, success_url?, cancel_url? }
router.post('/checkout', async (req, res, next) => {
  try {
    const { sku, qty: qtyRaw, buyer_email, success_url, cancel_url } = req.body ?? {};
    if (!sku) return res.status(400).json({ error: 'sku required' });
    const qty = Math.min(Math.max(parseInt(String(qtyRaw ?? '1'), 10) || 1, 1), 100);

    const { rows } = await pool.query(
      `SELECT * FROM jds_products WHERE sku = $1 AND active`, [String(sku).toUpperCase()],
    );
    const product = rows[0];
    if (!product) return res.status(404).json({ error: 'Product not available' });

    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';

    // Weight-tiered shipping like the group stores; default a 16 oz parcel
    // estimate when the admin hasn't set one.
    const totalOz = parcelOunces([{ weightOz: Number(product.weight_oz) || 16, qty }]);
    const shippingOptions = shippingChoicesForOunces(totalOz).map((choice) => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: choice.cents, currency: 'usd' },
        display_name: choice.label,
        delivery_estimate: {
          minimum: { unit: 'business_day', value: choice.minDays },
          maximum: { unit: 'business_day', value: choice.maxDays },
        },
      },
    }));
    shippingOptions.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: 'usd' },
        display_name: 'Free local pickup (Fairburn, GA)',
      },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: shippingOptions,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            ...(product.description ? { description: String(product.description).slice(0, 300) } : {}),
            ...(product.image_url ? { images: [product.image_url] } : {}),
          },
          unit_amount: product.retail_price_cents,
        },
        quantity: qty,
      }],
      mode: 'payment',
      customer_email: buyer_email || undefined,
      success_url: success_url
        ? `${success_url}${success_url.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
        : `${domain}/gifts?purchased=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${domain}/gifts`,
      metadata: {
        jds_sku: product.sku,
        jds_product_name: String(product.name).slice(0, 400),
        qty: String(qty),
        unit_price_cents: String(product.retail_price_cents),
      },
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) { next(err); }
});

// ── Admin ────────────────────────────────────────────────────────────────
const admin = Router();
admin.use(authenticate, adminOnly);

// Publish (or republish) a SKU. Snapshots name/image/cost from the live
// JDS catalog so the storefront never needs a JDS call.
// Body: { sku, retail_price_cents, weight_oz?, description? }
admin.post('/publish', async (req, res, next) => {
  try {
    const { sku, retail_price_cents, weight_oz, description } = req.body ?? {};
    if (!sku) return res.status(400).json({ error: 'sku required' });
    const retail = parseInt(String(retail_price_cents), 10);
    if (!Number.isInteger(retail) || retail <= 0) {
      return res.status(400).json({ error: 'retail_price_cents (positive int) required' });
    }

    const [jds] = await fetchJdsProducts([String(sku)]);
    if (!jds || jds.notFound) return res.status(404).json({ error: `JDS SKU "${sku}" not found` });

    const name = jds.name || jds.description || jds.title || String(sku);
    const image = jds.image || jds.thumbnail || jds.quickImage || null;
    const oneCost = [jds.onePiece, jds.lessThanCase, jds.oneCase]
      .find((v) => typeof v === 'number' && Number.isFinite(v));

    const { rows } = await pool.query(
      `INSERT INTO jds_products (sku, name, description, image_url, cost_cents, retail_price_cents, weight_oz, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, description = COALESCE(EXCLUDED.description, jds_products.description),
         image_url = EXCLUDED.image_url, cost_cents = EXCLUDED.cost_cents,
         retail_price_cents = EXCLUDED.retail_price_cents,
         weight_oz = COALESCE(EXCLUDED.weight_oz, jds_products.weight_oz),
         active = TRUE, updated_at = NOW()
       RETURNING *`,
      [
        String(sku).toUpperCase(), name,
        description || null, image,
        oneCost != null ? Math.round(oneCost * 100) : null,
        retail,
        weight_oz != null ? Number(weight_oz) : null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

admin.get('/products', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM jds_products ORDER BY created_at DESC`);
    res.json({ products: rows });
  } catch (err) { next(err); }
});

admin.patch('/products/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const body = req.body ?? {};
    const sets = [];
    const params = [id];
    const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (typeof body.active === 'boolean') push('active', body.active);
    if (Number.isInteger(body.retail_price_cents) && body.retail_price_cents > 0) {
      push('retail_price_cents', body.retail_price_cents);
    }
    if (body.weight_oz != null && Number.isFinite(Number(body.weight_oz))) push('weight_oz', Number(body.weight_oz));
    if (body.description === null || typeof body.description === 'string') push('description', body.description || null);
    if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
    sets.push('updated_at = NOW()');
    const { rows } = await pool.query(
      `UPDATE jds_products SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

admin.get('/orders', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM jds_orders ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

admin.patch('/orders/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body?.status || '');
    if (!Number.isInteger(id) || !['paid', 'ordered', 'shipped', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'valid id + status required' });
    }
    const { rows } = await pool.query(
      `UPDATE jds_orders SET status = $2 WHERE id = $1 RETURNING *`, [id, status],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.use('/admin', admin);

export default router;
