// Custom Gift Club — sister-brand storefront API over the JDS retail
// catalog (jds_products, same table the TSB /gifts store sells from).
// Brand-specific presentation lives here; the JDS supplier integration
// stays in services/jds.js and the publish pipeline in routes/jdsStore.js.
//
// Public:
//   GET  /config              — categories, gift-finder options, fees
//   GET  /products            — search/filter/sort over the full catalog
//   GET  /products/:sku       — product detail
//   GET  /gift-finder         — recipient/occasion/budget → filtered set
//   POST /checkout            — multi-item cart → Stripe Checkout session
//   POST /business-inquiry    — business gifting lead → prospects board
// Authenticated:
//   GET  /my-orders           — CGC orders matching the signed-in email

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { CGC_CATEGORIES } from '../lib/cgcCategories.js';
import { CGC_RECIPIENTS, CGC_OCCASIONS, CGC_BUDGETS, findOption } from '../lib/cgcMerchandising.js';
import { HOLIDAY_LAUNCH, findHolidayProduct } from '../lib/cgcHoliday.js';
import { parcelOunces, shippingChoicesForOunces } from '../lib/shippingRates.js';

const router = Router();

// Flat per-item charge when a customer adds personalization (engraving /
// sublimation of their text or artwork). Configurable per deployment.
const PERSONALIZATION_FEE_CENTS =
  parseInt(process.env.CGC_PERSONALIZATION_FEE_CENTS || '', 10) || 1000;

const PRODUCT_COLS =
  `id, sku, name, description, image_url, retail_price_cents, cgc_category, weight_oz`;

// ── Config ───────────────────────────────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({
    categories: CGC_CATEGORIES,
    recipients: CGC_RECIPIENTS.map(({ key, label }) => ({ key, label })),
    occasions: CGC_OCCASIONS.map(({ key, label }) => ({ key, label })),
    budgets: CGC_BUDGETS.map(({ key, label }) => ({ key, label })),
    personalization_fee_cents: PERSONALIZATION_FEE_CENTS,
  });
});

// ── Product listing ──────────────────────────────────────────────────────
// ?search= whitespace-separated terms are ANDed; a term may contain |
// alternation (used by curated gift-finder mappings). ?category= exact
// collection. ?min_cents/?max_cents price bounds. ?sort=name|price_asc|
// price_desc|newest. ?page/?limit (default 24, max 96). Returns facet
// counts for the category rail alongside the page.
function buildCatalogQuery(query) {
  const conditions = ['active'];
  const params = [];
  const push = (sql, val) => { params.push(val); conditions.push(sql.replace('?', `$${params.length}`)); };

  const search = String(query.search ?? '').trim();
  for (const term of search.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const alts = term.split('|').map((t) => t.trim()).filter(Boolean).slice(0, 12);
    if (!alts.length) continue;
    const ors = [];
    for (const alt of alts) {
      params.push(`%${alt}%`);
      ors.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    conditions.push(`(${ors.join(' OR ')})`);
  }

  const category = String(query.category ?? '').trim();
  if (category && CGC_CATEGORIES.includes(category)) push('cgc_category = ?', category);

  const min = parseInt(String(query.min_cents ?? ''), 10);
  if (Number.isInteger(min) && min > 0) push('retail_price_cents >= ?', min);
  const max = parseInt(String(query.max_cents ?? ''), 10);
  if (Number.isInteger(max) && max > 0) push('retail_price_cents <= ?', max);

  return { where: conditions.join(' AND '), params };
}

const SORTS = {
  name: 'name ASC',
  price_asc: 'retail_price_cents ASC, name ASC',
  price_desc: 'retail_price_cents DESC, name ASC',
  newest: 'created_at DESC, name ASC',
};

router.get('/products', async (req, res, next) => {
  try {
    const { where, params } = buildCatalogQuery(req.query);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(96, Math.max(1, parseInt(String(req.query.limit ?? '24'), 10) || 24));
    const orderBy = SORTS[String(req.query.sort ?? 'name')] || SORTS.name;

    const facetSql = `SELECT cgc_category, COUNT(*)::int AS n FROM jds_products WHERE ${where} GROUP BY cgc_category`;
    const [facets, count] = await Promise.all([
      pool.query(facetSql, params),
      pool.query(`SELECT COUNT(*) FROM jds_products WHERE ${where}`, params),
    ]);

    const pageParams = [...params, limit, (page - 1) * limit];
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLS} FROM jds_products WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams,
    );

    const total = parseInt(count.rows[0].count, 10);
    res.json({
      products: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      categories: Object.fromEntries(facets.rows.map((r) => [r.cgc_category ?? 'Uncategorized', r.n])),
    });
  } catch (err) { next(err); }
});

router.get('/products/:sku', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PRODUCT_COLS} FROM jds_products WHERE sku = $1 AND active`,
      [String(req.params.sku).toUpperCase()],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });

    const { rows: related } = await pool.query(
      `SELECT ${PRODUCT_COLS} FROM jds_products
        WHERE active AND cgc_category = $1 AND sku <> $2
        ORDER BY abs(retail_price_cents - $3) ASC LIMIT 8`,
      [rows[0].cgc_category, rows[0].sku, rows[0].retail_price_cents],
    );
    res.json({ product: rows[0], related });
  } catch (err) { next(err); }
});

// ── Holiday Gifts launch collection ──────────────────────────────────────
// Curated four-product launch set (lib/cgcHoliday.js) joined with live
// jds_products rows. Never exposes cost_cents. `available` is true only
// when the product is published AND every variant is still active — an
// unpublished product renders as "launching soon", not buyable.
async function holidayWithLiveData() {
  const skus = HOLIDAY_LAUNCH.flatMap((p) => p.variants.map((v) => v.sku));
  const { rows } = await pool.query(
    `SELECT ${PRODUCT_COLS}, active FROM jds_products WHERE sku = ANY($1)`,
    [skus],
  );
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  return HOLIDAY_LAUNCH.map((p) => {
    const variants = p.variants.map((v) => {
      const row = bySku.get(v.sku);
      return row ? {
        sku: v.sku,
        label: v.label,
        name: row.name,
        image_url: row.image_url,
        retail_price_cents: row.retail_price_cents,
        active: row.active,
      } : null;
    }).filter(Boolean);
    const prices = variants.map((v) => v.retail_price_cents);
    return {
      slug: p.slug,
      title: p.title,
      intro: p.intro,
      designs: p.designs,
      fields: p.fields,
      limits: p.limits,
      production_note: p.production_note,
      variants,
      image_url: variants[0]?.image_url ?? null,
      from_cents: prices.length ? Math.min(...prices) : null,
      available: p.published
        && variants.length === p.variants.length
        && variants.every((v) => v.active),
    };
  });
}

router.get('/holiday', async (_req, res, next) => {
  try {
    res.json({ products: await holidayWithLiveData() });
  } catch (err) { next(err); }
});

router.get('/holiday/:slug', async (req, res, next) => {
  try {
    if (!findHolidayProduct(req.params.slug)) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const products = await holidayWithLiveData();
    const product = products.find((p) => p.slug === req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
});

// ── Gift finder ──────────────────────────────────────────────────────────
// ?recipient=&occasion=&budget= (all optional, each a curated key).
// Resolves to the same filters /products uses and returns the first page
// plus the resolved query so the client can land on a shoppable URL.
router.get('/gift-finder', async (req, res, next) => {
  try {
    const recipient = findOption(CGC_RECIPIENTS, String(req.query.recipient ?? ''));
    const occasion = findOption(CGC_OCCASIONS, String(req.query.occasion ?? ''));
    const budget = findOption(CGC_BUDGETS, String(req.query.budget ?? ''));

    const searchTerms = [];
    let category = '';
    for (const opt of [recipient, occasion]) {
      if (!opt) continue;
      if (opt.search) searchTerms.push(opt.search);
      if (opt.category) category = opt.category;
    }

    const budgetOnly = {
      search: '',
      category: '',
      min_cents: budget?.minCents ?? '',
      max_cents: budget?.maxCents ?? '',
    };

    // Curated combos can over-constrain (a niche recipient × a strict
    // occasion × a budget band easily intersects to nothing), so try
    // progressively looser filter sets and STOP at the first non-empty
    // one. Crucially, `resolved` in the response is the filter set that
    // actually produced the products — the shop page re-queries with it,
    // so returning the strict combo alongside relaxed products would put
    // the buyer right back on an empty page.
    const attempts = [
      { ...budgetOnly, search: searchTerms.join(' '), category },
      ...searchTerms.map((term) => ({ ...budgetOnly, search: term, category })),
      ...(category ? [{ ...budgetOnly, category }] : []),
      budgetOnly,
    ].map((a, i) => ({ ...a, strict: i === 0 }))
      // Dedupe identical filter sets (e.g. a single-term combo repeats).
      .filter((a, i, arr) => arr.findIndex(
        (b) => b.search === a.search && b.category === a.category,
      ) === i);

    let products = [];
    let resolved = attempts[0];
    let relaxed = false;
    for (const attempt of attempts) {
      const { where, params } = buildCatalogQuery(attempt);
      const { rows } = await pool.query(
        `SELECT ${PRODUCT_COLS} FROM jds_products WHERE ${where}
          ORDER BY retail_price_cents DESC LIMIT 24`,
        params,
      );
      if (rows.length) {
        products = rows;
        resolved = attempt;
        relaxed = !attempt.strict;
        break;
      }
    }

    const { strict: _strict, ...resolvedOut } = resolved;
    res.json({ products, resolved: resolvedOut, relaxed });
  } catch (err) { next(err); }
});

// ── Checkout ─────────────────────────────────────────────────────────────
// Body: { items: [{ sku, qty, personalization? }], buyer_email?,
//         success_url?, cancel_url? }
// Prices ALWAYS come from jds_products + the server-side personalization
// fee — client-submitted totals are ignored. A pending cgc_orders row is
// created first so the Stripe webhook only has to flip status and attach
// customer details (metadata.cgc_order_id).
router.post('/checkout', async (req, res, next) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    if (!rawItems.length) return res.status(400).json({ error: 'items is required' });

    const skus = [...new Set(rawItems.map((i) => String(i?.sku || '').toUpperCase()).filter(Boolean))];
    const { rows: products } = await pool.query(
      `SELECT sku, name, description, image_url, retail_price_cents, weight_oz
         FROM jds_products WHERE sku = ANY($1) AND active`,
      [skus],
    );
    const bySku = new Map(products.map((p) => [p.sku, p]));

    const lines = [];
    for (const item of rawItems) {
      const sku = String(item?.sku || '').toUpperCase();
      const product = bySku.get(sku);
      if (!product) return res.status(400).json({ error: `Product ${sku || '(missing sku)'} is not available` });
      const qty = Math.min(Math.max(parseInt(String(item?.qty ?? '1'), 10) || 1, 1), 100);

      let personalization = null;
      if (item?.personalization && typeof item.personalization === 'object') {
        const p = item.personalization;
        const linesOfText = (Array.isArray(p.lines) ? p.lines : [])
          .map((l) => String(l).slice(0, 120)).filter(Boolean).slice(0, 4);
        const font = String(p.font || '').slice(0, 60);
        const notes = String(p.notes || '').slice(0, 500);
        const artUrl = /^https:\/\//.test(String(p.artUrl || '')) ? String(p.artUrl).slice(0, 500) : '';
        // Holiday launch products add a chosen engraving layout and an
        // optional (NOT engraved) gift message packed with the order.
        const design = String(p.design || '').slice(0, 60);
        const giftMessage = String(p.gift_message ?? p.giftMessage ?? '').slice(0, 300);
        if (linesOfText.length || notes || artUrl || design || giftMessage) {
          personalization = {
            lines: linesOfText,
            font,
            notes,
            artUrl,
            ...(design ? { design } : {}),
            ...(giftMessage ? { gift_message: giftMessage } : {}),
          };
        }
      }

      lines.push({
        product,
        qty,
        personalization,
        personalizationCents: personalization ? PERSONALIZATION_FEE_CENTS : 0,
      });
    }

    const subtotal = lines.reduce(
      (sum, l) => sum + (l.product.retail_price_cents + l.personalizationCents) * l.qty, 0,
    );

    const totalOz = parcelOunces(lines.map((l) => ({
      weightOz: Number(l.product.weight_oz) || 16,
      qty: l.qty,
    })));
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

    const client = await pool.connect();
    let orderId;
    try {
      await client.query('BEGIN');
      const { rows: [order] } = await client.query(
        `INSERT INTO cgc_orders (status, customer_email, subtotal_cents, total_cents)
         VALUES ('pending', $1, $2, $2) RETURNING id`,
        [req.body?.buyer_email || null, subtotal],
      );
      orderId = order.id;
      for (const l of lines) {
        await client.query(
          `INSERT INTO cgc_order_items
             (order_id, sku, product_name, qty, unit_price_cents, personalization_cents, personalization)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, l.product.sku, l.product.name, l.qty,
           l.product.retail_price_cents, l.personalizationCents,
           l.personalization ? JSON.stringify(l.personalization) : null],
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
    const domain = process.env.CGC_DOMAIN || process.env.DOMAIN || 'https://tshirtbrothers.com';
    const base = process.env.CGC_DOMAIN ? domain : `${domain}/gift-club`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: shippingOptions,
      line_items: lines.map((l) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: l.personalization ? `${l.product.name} (personalized)` : l.product.name,
            ...(l.personalization?.lines?.length
              ? {
                description: `${l.personalization.design ? `${l.personalization.design} — ` : ''}Personalization: ${l.personalization.lines.join(' / ')}`.slice(0, 300),
              }
              : l.product.description
                ? { description: String(l.product.description).slice(0, 300) }
                : {}),
            ...(l.product.image_url ? { images: [l.product.image_url] } : {}),
          },
          unit_amount: l.product.retail_price_cents + l.personalizationCents,
        },
        quantity: l.qty,
      })),
      mode: 'payment',
      customer_email: req.body?.buyer_email || undefined,
      success_url: req.body?.success_url
        ? `${req.body.success_url}${String(req.body.success_url).includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
        : `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.body?.cancel_url || `${base}/cart`,
      metadata: { cgc_order_id: String(orderId) },
    });

    await pool.query(
      `UPDATE cgc_orders SET stripe_session_id = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, session.id],
    );

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) { next(err); }
});

// ── Business gifting inquiry ─────────────────────────────────────────────
// Lands on the same Sales Prospects board the TSB Pro intake uses.
const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later.' },
});

router.post('/business-inquiry', inquiryLimiter, async (req, res, next) => {
  try {
    const trim = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const b = req.body ?? {};
    const businessName = trim(b.business_name, 255);
    const email = trim(b.email, 255);
    if (!businessName || !email) {
      return res.status(400).json({ error: 'business_name and email are required' });
    }
    const noteLines = ['Custom Gift Club business gifting inquiry'];
    const needs = trim(b.needs, 2000);
    const quantity = trim(b.quantity, 120);
    const budgetPerGift = trim(b.budget_per_gift, 120);
    const deliveryDate = trim(b.delivery_date, 40);
    const logoUrl = /^https:\/\//.test(String(b.logo_url || '')) ? String(b.logo_url).slice(0, 500) : '';
    if (quantity) noteLines.push(`Quantity: ${quantity}`);
    if (budgetPerGift) noteLines.push(`Budget per gift: ${budgetPerGift}`);
    if (deliveryDate) noteLines.push(`Requested delivery date: ${deliveryDate}`);
    if (logoUrl) noteLines.push(`Logo: ${logoUrl}`);
    if (needs) noteLines.push(`Needs: ${needs}`);

    await pool.query(
      `INSERT INTO prospects
         (tier, name, category, phone, product_angle, notes, status, contact_name, contact_email)
       VALUES ('A', $1, $2, $3, 'Custom Gift Club business gifting', $4, 'new', $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         outreach_notes = COALESCE(prospects.outreach_notes || E'\n\n', '')
                          || 'Inbound CGC business inquiry ' || to_char(NOW(), 'YYYY-MM-DD')
                          || ' — ' || EXCLUDED.contact_email,
         contact_name  = COALESCE(prospects.contact_name, EXCLUDED.contact_name),
         contact_email = COALESCE(prospects.contact_email, EXCLUDED.contact_email),
         updated_at = NOW()`,
      [businessName, trim(b.business_type, 120) || null, trim(b.phone, 40) || null,
       noteLines.join('\n'), trim(b.contact_name, 160) || null, email],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Account: my orders ───────────────────────────────────────────────────
router.get('/my-orders', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.total_cents, o.shipping_cents, o.created_at,
              COALESCE(json_agg(json_build_object(
                'sku', i.sku, 'name', i.product_name, 'qty', i.qty,
                'unit_price_cents', i.unit_price_cents,
                'personalization_cents', i.personalization_cents,
                'personalization', i.personalization
              ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
         FROM cgc_orders o
         LEFT JOIN cgc_order_items i ON i.order_id = o.id
        WHERE o.customer_email = $1 AND o.status <> 'pending'
        GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50`,
      [req.user.email],
    );
    res.json({ orders: rows });
  } catch (err) { next(err); }
});

export default router;
