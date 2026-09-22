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
import { authenticate, adminOnly } from '../middleware/auth.js';
import { CGC_CATEGORIES } from '../lib/cgcCategories.js';
import { CGC_RECIPIENTS, CGC_OCCASIONS, CGC_BUDGETS, findOption } from '../lib/cgcMerchandising.js';
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
// Rows live in cgc_holiday_products (managed from the CGC admin page at
// /admin/holiday) joined with live jds_products data. The public shape
// never exposes cost_cents or the launch-worksheet numbers. `available`
// is true only when the product is published AND every variant SKU is
// still active — an unpublished product renders as "launching soon".
// A selling_price_cents set in the admin overrides the catalog retail
// for every variant (the launch price is one price, not per color).
// Variants come from two catalogs: a JDS SKU (jds_products, priced by
// catalog retail unless the launch selling price overrides it) or a TSB
// Studio mockup referenced as "MOCKUP:<id>" (mockups table — the preview
// composite is the photo, and the launch selling price IS the price,
// since mockups have no catalog retail). A mockup variant with no
// selling price set stays unpriced and blocks `available`.
const MOCKUP_TOKEN = /^MOCKUP:(\d+)$/;

function shapeHolidayRow(row, bySku, { admin = false } = {}) {
  const configVariants = Array.isArray(row.variants) ? row.variants : [];
  const variants = configVariants.map((v) => {
    const live = bySku.get(v.sku);
    if (!live) return admin ? { sku: v.sku, label: v.label, missing: true } : null;
    const isMockup = MOCKUP_TOKEN.test(v.sku);
    return {
      sku: v.sku,
      label: v.label,
      name: live.name,
      image_url: live.image_url,
      retail_price_cents: isMockup
        ? (row.selling_price_cents ?? null)
        : (row.selling_price_cents ?? live.retail_price_cents),
      active: live.active,
      ...(admin ? {
        cost_cents: live.cost_cents ?? null,
        catalog_retail_cents: isMockup ? null : live.retail_price_cents,
        missing: false,
      } : {}),
    };
  }).filter(Boolean);
  const prices = variants
    .filter((v) => !v.missing && v.retail_price_cents != null)
    .map((v) => v.retail_price_cents);
  const shaped = {
    slug: row.slug,
    title: row.title,
    intro: row.intro,
    featured: row.featured,
    designs: Array.isArray(row.designs) ? row.designs : [],
    fields: Array.isArray(row.fields) ? row.fields : [],
    limits: row.limits_note,
    production_note: row.production_note,
    variants,
    // Admin-uploaded image wins; otherwise the first variant's catalog photo.
    image_url: row.image_url || (variants.find((v) => !v.missing)?.image_url ?? null),
    from_cents: prices.length ? Math.min(...prices) : null,
    available: row.published
      && variants.length === configVariants.length
      && variants.every((v) => !v.missing && v.active && v.retail_price_cents != null),
  };
  if (admin) {
    Object.assign(shaped, {
      id: row.id,
      published: row.published,
      position: row.position,
      engraving_minutes: row.engraving_minutes,
      packaging_cost_cents: row.packaging_cost_cents,
      selling_price_cents: row.selling_price_cents,
      sample_approved: row.sample_approved,
      custom_image_url: row.image_url || null,
    });
  }
  return shaped;
}

async function holidayRows(where = '', params = []) {
  const { rows } = await pool.query(
    `SELECT * FROM cgc_holiday_products ${where}
      ORDER BY featured DESC, position ASC, id ASC`,
    params,
  );
  const skus = [...new Set(rows.flatMap((r) => (Array.isArray(r.variants) ? r.variants : []).map((v) => v.sku)))];
  const jdsSkus = skus.filter((s) => !MOCKUP_TOKEN.test(s));
  const mockupIds = skus.map((s) => MOCKUP_TOKEN.exec(s)?.[1]).filter(Boolean).map(Number);
  const [jds, mockups] = await Promise.all([
    jdsSkus.length
      ? pool.query(`SELECT ${PRODUCT_COLS}, cost_cents, active FROM jds_products WHERE sku = ANY($1)`, [jdsSkus])
      : { rows: [] },
    mockupIds.length
      ? pool.query('SELECT id, name, product_name, preview_image_url FROM mockups WHERE id = ANY($1)', [mockupIds])
      : { rows: [] },
  ]);
  const bySku = new Map(jds.rows.map((r) => [r.sku, r]));
  for (const m of mockups.rows) {
    bySku.set(`MOCKUP:${m.id}`, {
      name: m.name || m.product_name || `Mockup #${m.id}`,
      image_url: m.preview_image_url,
      active: true,
    });
  }
  return { rows, bySku };
}

router.get('/holiday', async (_req, res, next) => {
  try {
    const { rows, bySku } = await holidayRows();
    res.json({ products: rows.map((r) => shapeHolidayRow(r, bySku)) });
  } catch (err) { next(err); }
});

router.get('/holiday/:slug', async (req, res, next) => {
  try {
    const { rows, bySku } = await holidayRows('WHERE slug = $1', [String(req.params.slug)]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: shapeHolidayRow(rows[0], bySku) });
  } catch (err) { next(err); }
});

// ── Holiday admin (CGC page at /admin/holiday, TSB admin JWT) ────────────
// The admin shape includes what the public one hides: JDS account cost
// per variant, the launch-worksheet numbers, publish/featured state.

const HOLIDAY_JSON_LIMITS = { variants: 30, designs: 8, fields: 8 };

function sanitizeHolidayJson(key, value) {
  if (!Array.isArray(value)) return null;
  const items = value.slice(0, HOLIDAY_JSON_LIMITS[key]);
  const str = (v, max) => String(v ?? '').slice(0, max);
  if (key === 'variants') {
    return items
      .map((v) => ({ sku: str(v.sku, 60).toUpperCase().trim(), label: str(v.label, 60).trim() }))
      .filter((v) => v.sku && v.label);
  }
  if (key === 'designs') {
    return items
      .map((d) => ({
        key: str(d.key, 60).trim() || str(d.label, 60).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: str(d.label, 80).trim(),
        desc: str(d.desc, 200).trim(),
      }))
      .filter((d) => d.label);
  }
  return items
    .map((f) => ({
      key: str(f.key, 60).trim() || str(f.label, 60).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: str(f.label, 80).trim(),
      max: Math.min(Math.max(parseInt(String(f.max ?? '30'), 10) || 30, 1), 120),
      required: Boolean(f.required),
      help: str(f.help, 200).trim(),
    }))
    .filter((f) => f.label);
}

const holidayAdmin = Router();
holidayAdmin.use(authenticate, adminOnly);

holidayAdmin.get('/', async (_req, res, next) => {
  try {
    const { rows, bySku } = await holidayRows();
    res.json({ products: rows.map((r) => shapeHolidayRow(r, bySku, { admin: true })) });
  } catch (err) { next(err); }
});

// SKU lookup for the variant picker. Accepts a JDS SKU (validated
// against the published catalog) or "mockup:<id>" — a TSB Studio mockup
// whose preview composite becomes the product photo. Mockup variants
// have no catalog price: the holiday product's Selling price field
// prices them, and publishing is blocked until it's set.
holidayAdmin.get('/sku/:sku', async (req, res, next) => {
  try {
    const token = String(req.params.sku).toUpperCase().trim();
    const mockupMatch = MOCKUP_TOKEN.exec(token);
    if (mockupMatch) {
      const { rows } = await pool.query(
        'SELECT id, name, product_name, preview_image_url FROM mockups WHERE id = $1',
        [Number(mockupMatch[1])],
      );
      if (!rows[0]) return res.status(404).json({ error: `Mockup #${mockupMatch[1]} not found — check the id in TSB admin → Mockups` });
      const m = rows[0];
      return res.json({
        product: {
          sku: token,
          name: m.name || m.product_name || `Mockup #${m.id}`,
          image_url: m.preview_image_url,
          cost_cents: null,
          retail_price_cents: null,
          active: true,
          source: 'mockup',
        },
      });
    }
    const { rows } = await pool.query(
      `SELECT sku, name, image_url, cost_cents, retail_price_cents, active
         FROM jds_products WHERE sku = $1`,
      [token],
    );
    if (!rows[0]) return res.status(404).json({ error: 'SKU not found in the published catalog — publish it via TSB admin → Blanks (JDS), or use mockup:<id> for a Studio mockup' });
    res.json({ product: { ...rows[0], source: 'jds' } });
  } catch (err) { next(err); }
});

const HOLIDAY_TEXT_FIELDS = {
  title: 120, intro: 400, limits_note: 400, production_note: 400,
};

function holidayPatchFromBody(b) {
  const patch = {};
  for (const [key, max] of Object.entries(HOLIDAY_TEXT_FIELDS)) {
    if (key in b) {
      const v = String(b[key] ?? '').slice(0, max).trim();
      patch[key] = key === 'production_note' ? (v || null) : v;
    }
  }
  for (const key of ['published', 'featured', 'sample_approved']) {
    if (key in b) patch[key] = Boolean(b[key]);
  }
  if ('position' in b) patch.position = parseInt(String(b.position), 10) || 0;
  for (const key of ['packaging_cost_cents', 'selling_price_cents']) {
    if (key in b) {
      const n = parseInt(String(b[key]), 10);
      patch[key] = Number.isInteger(n) && n >= 0 ? n : null;
    }
  }
  if ('engraving_minutes' in b) {
    const n = parseFloat(String(b.engraving_minutes));
    patch.engraving_minutes = Number.isFinite(n) && n >= 0 ? n : null;
  }
  if ('image_url' in b) {
    const url = String(b.image_url || '');
    patch.image_url = /^https:\/\//.test(url) ? url.slice(0, 500) : null;
  }
  for (const key of ['variants', 'designs', 'fields']) {
    if (key in b) {
      const clean = sanitizeHolidayJson(key, b[key]);
      if (clean) patch[key] = JSON.stringify(clean);
    }
  }
  return patch;
}

holidayAdmin.post('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const title = String(b.title ?? '').slice(0, 120).trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const slug = String(b.slug ?? title).slice(0, 80).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    const patch = holidayPatchFromBody(b);
    // New products always start unpublished — publishing is a deliberate
    // launch step, never a side effect of creation.
    delete patch.published;
    const { rows: [{ max }] } = await pool.query('SELECT COALESCE(MAX(position), 0) AS max FROM cgc_holiday_products');
    const cols = ['slug', 'title', 'position'];
    const vals = [slug, title, patch.position || (Number(max) + 1)];
    delete patch.title; delete patch.position;
    for (const [k, v] of Object.entries(patch)) { cols.push(k); vals.push(v); }
    const { rows } = await pool.query(
      `INSERT INTO cgc_holiday_products (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (slug) DO NOTHING RETURNING *`,
      vals,
    );
    if (!rows[0]) return res.status(409).json({ error: `A product with slug "${slug}" already exists` });
    res.json({ product: rows[0] });
  } catch (err) { next(err); }
});

holidayAdmin.patch('/:id', async (req, res, next) => {
  try {
    const patch = holidayPatchFromBody(req.body ?? {});
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 1}`);
    const { rows } = await pool.query(
      `UPDATE cgc_holiday_products SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${sets.length + 1} RETURNING *`,
      [...Object.values(patch), req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ product: rows[0] });
  } catch (err) { next(err); }
});

holidayAdmin.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM cgc_holiday_products WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.use('/admin/holiday', holidayAdmin);

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
    const jdsSkus = skus.filter((s) => !MOCKUP_TOKEN.test(s));
    const { rows: products } = jdsSkus.length
      ? await pool.query(
        `SELECT sku, name, description, image_url, retail_price_cents, weight_oz
           FROM jds_products WHERE sku = ANY($1) AND active`,
        [jdsSkus],
      )
      : { rows: [] };
    const bySku = new Map(products.map((p) => [p.sku, p]));

    // A published holiday product's launch selling price overrides the
    // catalog retail for its SKUs — the PDP already shows that price, so
    // checkout must charge it too.
    const { rows: pricedHoliday } = await pool.query(
      `SELECT variants, selling_price_cents FROM cgc_holiday_products
        WHERE published AND selling_price_cents IS NOT NULL`,
    );
    for (const hp of pricedHoliday) {
      for (const v of (Array.isArray(hp.variants) ? hp.variants : [])) {
        const existing = bySku.get(v.sku);
        if (existing) existing.retail_price_cents = hp.selling_price_cents;
      }
    }

    // Mockup-backed holiday items (sku "MOCKUP:<id>"): sellable only while
    // some PUBLISHED holiday product lists that mockup as a variant with a
    // selling price set — that launch price is the price, server-side.
    const mockupTokens = skus.filter((s) => MOCKUP_TOKEN.test(s));
    for (const token of mockupTokens) {
      const { rows: holders } = await pool.query(
        `SELECT selling_price_cents FROM cgc_holiday_products
          WHERE published AND selling_price_cents IS NOT NULL
            AND variants @> $1::jsonb LIMIT 1`,
        [JSON.stringify([{ sku: token }])],
      );
      if (!holders[0]) continue; // falls through to "not available" below
      const id = Number(MOCKUP_TOKEN.exec(token)[1]);
      const { rows: [m] } = await pool.query(
        'SELECT id, name, product_name, preview_image_url FROM mockups WHERE id = $1',
        [id],
      );
      if (!m) continue;
      bySku.set(token, {
        sku: token,
        name: m.name || m.product_name || `Custom gift #${m.id}`,
        description: null,
        image_url: m.preview_image_url,
        retail_price_cents: holders[0].selling_price_cents,
        weight_oz: null,
      });
    }

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
