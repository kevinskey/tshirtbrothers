// All Print Club (allprintclub.com) — sister-brand storefront API.
//
//   GET  /config                  categories + shipping config (public)
//   GET  /products                published catalog w/ search + category (public)
//   GET  /products/:code          product + option groups + variants (public)
//   POST /price                   exact price for an option combination (public)
//   POST /checkout                Stripe Checkout; pending apc_orders first (public)
//   GET  /my-orders               buyer order history (authenticate)
//   /admin/*                      catalog publish, markup, sync, orders (admin JWT)
//
// Pricing is per-RUN (quantity is an option), retail only — cost_cents never
// leaves the server. The Stripe webhook flip + 4over auto-submit live in
// routes/payments.js (metadata.apc_order_id) and services/apcCatalog.js.

import { Router } from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  getApcSetting, getMarkupPercent, optionKeyFor, repriceApcVariants, syncFourOverCatalog,
} from '../services/apcCatalog.js';
import { isFourOverConfigured } from '../services/fourover.js';

const router = Router();

const PRODUCT_COLS = 'id, code, name, category, description, image_url, option_groups, position';

async function flatShippingCents() {
  const raw = await getApcSetting('flat_shipping_cents', 999);
  const v = parseInt(raw, 10);
  return Number.isFinite(v) && v >= 0 ? v : 999;
}

// ── Public catalog ───────────────────────────────────────────────────────

router.get('/config', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, COUNT(*)::int AS count FROM apc_products
       WHERE enabled GROUP BY category ORDER BY MIN(position)`,
    );
    res.json({
      categories: rows.map((r) => ({ name: r.category, count: r.count })),
      flat_shipping_cents: await flatShippingCents(),
    });
  } catch (err) { next(err); }
});

router.get('/products', async (req, res, next) => {
  try {
    const where = ['p.enabled'];
    const params = [];
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`p.category = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).trim()}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLS.split(', ').map((c) => `p.${c}`).join(', ')},
              (SELECT MIN(v.retail_cents) FROM apc_variants v WHERE v.product_id = p.id) AS from_cents
       FROM apc_products p
       WHERE ${where.join(' AND ')}
       ORDER BY p.position, p.name
       LIMIT 200`,
      params,
    );
    res.json({ products: rows });
  } catch (err) { next(err); }
});

router.get('/products/:code', async (req, res, next) => {
  try {
    const { rows: [product] } = await pool.query(
      `SELECT ${PRODUCT_COLS} FROM apc_products WHERE code = $1 AND enabled`,
      [req.params.code],
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { rows: variants } = await pool.query(
      `SELECT option_key, options, retail_cents FROM apc_variants
       WHERE product_id = $1 ORDER BY retail_cents LIMIT 2000`,
      [product.id],
    );
    res.json({ product, variants });
  } catch (err) { next(err); }
});

// Body: { code, optionIds: [...] } → the matching variant's retail price.
router.post('/price', async (req, res, next) => {
  try {
    const { code, optionIds } = req.body || {};
    if (!code || !Array.isArray(optionIds) || !optionIds.length) {
      return res.status(400).json({ error: 'code and optionIds required' });
    }
    const { rows: [variant] } = await pool.query(
      `SELECT v.option_key, v.options, v.retail_cents
       FROM apc_variants v JOIN apc_products p ON p.id = v.product_id
       WHERE p.code = $1 AND p.enabled AND v.option_key = $2`,
      [code, optionKeyFor(optionIds)],
    );
    if (!variant) return res.status(404).json({ error: 'No price for that combination' });
    res.json({ option_key: variant.option_key, options: variant.options, retail_cents: variant.retail_cents });
  } catch (err) { next(err); }
});

// ── Checkout ─────────────────────────────────────────────────────────────
// Mirrors routes/cgc.js: resolve every price server-side, write the pending
// order inside a transaction, then create the Stripe session carrying
// metadata.apc_order_id for the webhook in routes/payments.js.

router.post('/checkout', async (req, res, next) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Cart is empty' });

    const resolved = [];
    for (const raw of rawItems) {
      const code = String(raw?.code || '');
      const qty = Math.max(1, Math.min(parseInt(raw?.qty, 10) || 1, 50));
      const { rows: [variant] } = await pool.query(
        `SELECT p.code, p.name, v.option_key, v.options, v.retail_cents
         FROM apc_variants v JOIN apc_products p ON p.id = v.product_id
         WHERE p.code = $1 AND p.enabled AND v.option_key = $2`,
        [code, String(raw?.option_key || '')],
      );
      if (!variant) return res.status(400).json({ error: `Unavailable item: ${code}` });

      const artwork = Array.isArray(raw?.artwork)
        ? raw.artwork
          .filter((f) => f && typeof f.url === 'string' && /^https:\/\//.test(f.url))
          .slice(0, 4)
          .map((f) => ({ side: f.side === 'back' ? 'back' : 'front', url: f.url.slice(0, 500) }))
        : [];
      resolved.push({
        ...variant,
        qty,
        artwork,
        note: typeof raw?.note === 'string' ? raw.note.slice(0, 500) : null,
      });
    }

    const subtotal = resolved.reduce((sum, i) => sum + i.retail_cents * i.qty, 0);
    const shipping = await flatShippingCents();

    const client = await pool.connect();
    let orderId;
    try {
      await client.query('BEGIN');
      const { rows: [order] } = await client.query(
        `INSERT INTO apc_orders (status, customer_email, subtotal_cents, total_cents)
         VALUES ('pending', $1, $2, $2) RETURNING id`,
        [req.body?.buyer_email || null, subtotal],
      );
      orderId = order.id;
      for (const item of resolved) {
        await client.query(
          `INSERT INTO apc_order_items
             (order_id, product_code, product_name, option_key, options, qty, unit_price_cents, artwork, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [orderId, item.code, item.name, item.option_key, JSON.stringify(item.options),
            item.qty, item.retail_cents, JSON.stringify(item.artwork), item.note],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(503).json({ error: 'Payments not configured' });
    const stripe = new Stripe(key);

    const domain = process.env.APC_DOMAIN || process.env.DOMAIN || 'https://tshirtbrothers.com';
    const base = process.env.APC_DOMAIN ? domain : `${domain}/print-club`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      line_items: resolved.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: Object.entries(item.options).map(([g, v]) => `${g}: ${v}`).join(' · ').slice(0, 300) || undefined,
          },
          unit_amount: item.retail_cents,
        },
        quantity: item.qty,
      })),
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shipping, currency: 'usd' },
            display_name: 'Ground shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 9 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            display_name: 'Free local pickup (Fairburn, GA)',
          },
        },
      ],
      customer_email: req.body?.buyer_email || undefined,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cart`,
      metadata: { apc_order_id: String(orderId) },
    });

    await pool.query('UPDATE apc_orders SET stripe_session_id = $2 WHERE id = $1', [orderId, session.id]);
    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) { next(err); }
});

// ── Buyer order history ──────────────────────────────────────────────────

router.get('/my-orders', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.total_cents, o.shipping_cents, o.created_at,
              COALESCE(json_agg(json_build_object(
                'product_name', i.product_name, 'options', i.options, 'qty', i.qty,
                'unit_price_cents', i.unit_price_cents
              ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM apc_orders o
       LEFT JOIN apc_order_items i ON i.order_id = o.id
       WHERE o.customer_email = $1 AND o.status <> 'pending'
       GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50`,
      [req.user.email],
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

// ── Admin ────────────────────────────────────────────────────────────────

const admin = Router();
admin.use(authenticate, adminOnly);

admin.get('/products', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.code, p.name, p.category, p.enabled, p.source, p.position,
              (SELECT COUNT(*)::int FROM apc_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT MIN(v.retail_cents) FROM apc_variants v WHERE v.product_id = p.id) AS from_cents
       FROM apc_products p ORDER BY p.position, p.name`,
    );
    res.json({ products: rows, fourover_configured: isFourOverConfigured() });
  } catch (err) { next(err); }
});

admin.patch('/products/:id', async (req, res, next) => {
  try {
    const sets = [];
    const params = [parseInt(req.params.id, 10)];
    for (const [col, val] of [
      ['enabled', typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined],
      ['category', typeof req.body?.category === 'string' ? req.body.category.slice(0, 80) : undefined],
      ['position', Number.isInteger(req.body?.position) ? req.body.position : undefined],
      ['image_url', typeof req.body?.image_url === 'string' ? req.body.image_url.slice(0, 500) : undefined],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    const { rows: [product] } = await pool.query(
      `UPDATE apc_products SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING id, code, enabled`,
      params,
    );
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ product });
  } catch (err) { next(err); }
});

admin.get('/settings', async (req, res, next) => {
  try {
    res.json({
      markup_percent: await getMarkupPercent(),
      flat_shipping_cents: await flatShippingCents(),
      fourover_configured: isFourOverConfigured(),
    });
  } catch (err) { next(err); }
});

admin.put('/settings', async (req, res, next) => {
  try {
    const updates = [];
    const markup = Number(req.body?.markup_percent);
    if (Number.isFinite(markup) && markup >= 0 && markup <= 500) {
      updates.push(pool.query(
        `INSERT INTO apc_settings (key, value) VALUES ('markup_percent', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(markup)],
      ));
    }
    const ship = Number(req.body?.flat_shipping_cents);
    if (Number.isInteger(ship) && ship >= 0 && ship <= 100000) {
      updates.push(pool.query(
        `INSERT INTO apc_settings (key, value) VALUES ('flat_shipping_cents', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(ship)],
      ));
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    await Promise.all(updates);
    const repriced = Number.isFinite(markup) ? await repriceApcVariants() : 0;
    res.json({ ok: true, repriced });
  } catch (err) { next(err); }
});

admin.post('/sync', async (req, res, next) => {
  try {
    const result = await syncFourOverCatalog();
    res.json(result);
  } catch (err) { next(err); }
});

admin.get('/orders', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, COALESCE(json_agg(json_build_object(
          'product_name', i.product_name, 'options', i.options, 'qty', i.qty,
          'unit_price_cents', i.unit_price_cents, 'artwork', i.artwork, 'note', i.note
        ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM apc_orders o
       LEFT JOIN apc_order_items i ON i.order_id = o.id
       WHERE o.status <> 'pending'
       GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`,
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

router.use('/admin', admin);

export default router;
