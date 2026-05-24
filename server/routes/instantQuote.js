import { Router } from 'express';
import Stripe from 'stripe';
import pool from '../db.js';
import { sendInstantQuoteToCustomer, sendInstantQuoteToAdmin } from '../services/email.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

/* ---------------------------------------------------------------------------
 * computeQuote — pure pricing function. Exported for unit tests so the
 * formula can be exercised without an Express + Postgres stack.
 *
 *   inputs = {
 *     quantity:           1+ integer (optional if `sizes` provided — derived from sum)
 *     sizes:              [{ size: 'S'|'M'|'L'|'XL'|'2XL'|..., quantity: int }, ...]
 *                         When provided, per-size upcharges (from settings.size_upcharges)
 *                         apply to each shirt's garment cost. When absent, the whole
 *                         `quantity` is treated as base size (no upcharge).
 *     garmentName:        e.g. 'T-shirt'
 *     qualityTier:        'Standard' | 'Premium' | 'Ultra'
 *     methodName:         'Screen Print' | 'DTF' | 'DTG' | 'Embroidery'
 *     numLocations:       1+ integer (Front/Back = 2, Front+Back+Sleeve = 3)
 *     colorsPerLocation:  1-6, only meaningful for Screen Print (charges_per_color)
 *     rush:               boolean
 *   }
 *   tables = { garments[], printMethods[], quantityTiers[], settings }
 * ------------------------------------------------------------------------- */
export function computeQuote(inputs, tables) {
  const {
    garmentName,
    qualityTier,
    methodName,
    numLocations,
    colorsPerLocation = 1,
    rush = false,
    // When the customer picked a specific catalog product, `pickedProduct`
    // carries { ss_id, name, your_price } and overrides the tier lookup:
    // garment_cost in the formula is set to your_price / markup so the
    // garment portion of the customer-facing total equals "Your Price"
    // exactly (= wholesale × 2 or the admin override).
    pickedProduct = null,
  } = inputs;

  // Normalize quantity input. `sizes` is the canonical form; `quantity`
  // alone is a shortcut meaning "all one base-priced size".
  let sizes;
  if (Array.isArray(inputs.sizes) && inputs.sizes.length > 0) {
    sizes = inputs.sizes
      .map((s) => ({ size: String(s.size || '').trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.quantity > 0);
    if (sizes.length === 0) {
      throw new Error('quantity must be a positive integer');
    }
  } else if (Number.isInteger(inputs.quantity) && inputs.quantity > 0) {
    sizes = [{ size: '', quantity: inputs.quantity }];
  } else {
    throw new Error('quantity must be a positive integer');
  }
  const quantity = sizes.reduce((n, s) => n + s.quantity, 0);

  if (!Number.isInteger(numLocations) || numLocations < 1) {
    throw new Error('numLocations must be a positive integer');
  }
  if (!Number.isInteger(colorsPerLocation) || colorsPerLocation < 1) {
    throw new Error('colorsPerLocation must be a positive integer');
  }

  // Lookup. If a specific product is picked, the tier lookup is skipped —
  // we synthesize a garment object whose base_cost = your_price / markup
  // (markup is reapplied below so the customer-facing garment portion of
  // the total equals "Your Price" exactly).
  const settingsForMarkup = tables.settings;
  if (!settingsForMarkup) throw new Error('Missing instant_quote_settings row');
  const markupForPicked = Number(settingsForMarkup.markup_multiplier);
  let garment;
  if (pickedProduct && pickedProduct.your_price != null) {
    const yp = Number(pickedProduct.your_price);
    if (!Number.isFinite(yp) || yp <= 0) {
      throw new Error('pickedProduct.your_price must be a positive number');
    }
    garment = { base_cost: yp / markupForPicked };
  } else {
    garment = tables.garments.find(
      (g) => g.name === garmentName && g.quality_tier === qualityTier && g.active !== false
    );
    if (!garment) throw new Error(`Unknown garment: ${garmentName} / ${qualityTier}`);
  }

  const method = tables.printMethods.find((m) => m.name === methodName && m.active !== false);
  if (!method) throw new Error(`Unknown print method: ${methodName}`);

  const tier = tables.quantityTiers.find(
    (t) => quantity >= t.min_qty && (t.max_qty === null || t.max_qty === undefined || quantity <= t.max_qty)
  );
  if (!tier) throw new Error(`No quantity tier matches quantity ${quantity}`);

  const settings = tables.settings;
  if (!settings) throw new Error('Missing instant_quote_settings row');

  // Coerce — Postgres returns NUMERIC as strings via node-postgres
  const garmentCost = Number(garment.base_cost);
  const perPiecePrint = Number(method.base_per_piece_cost);
  const setupFee = Number(method.setup_fee_per_color);
  const chargesPerColor = method.charges_per_color === true;
  const discountPct = Number(tier.discount_pct);
  const rushPct = Number(settings.rush_surcharge_pct);
  const markup = Number(settings.markup_multiplier);
  // Per-size upcharge table (e.g. {"2XL": 2, "3XL": 4, ...}). Sizes not
  // listed default to $0. Stored on settings to keep the admin edit UI
  // in one place.
  const sizeUpchargeTable = (settings.size_upcharges && typeof settings.size_upcharges === 'object')
    ? settings.size_upcharges
    : {};
  const upchargeFor = (sz) => Number(sizeUpchargeTable[sz] || 0);

  // base = Σ over sizes of (garment_cost + upcharge_size + per_piece_print × num_locations) × qty_s
  // Same shape as the old formula when there's no upcharge, but accommodates
  // 2XL+ being more expensive per shirt.
  let base = 0;
  let sizeUpchargeTotal = 0;
  for (const s of sizes) {
    const up = upchargeFor(s.size);
    sizeUpchargeTotal += up * s.quantity;
    base += (garmentCost + up + perPiecePrint * numLocations) * s.quantity;
  }

  // setup = setup_fee_per_color × colors × num_locations    (screen print)
  // setup = setup_fee × num_locations                         (embroidery — per-design fee)
  // setup = 0                                                 (DTF, DTG)
  let setup = 0;
  if (setupFee > 0) {
    setup = chargesPerColor
      ? setupFee * colorsPerLocation * numLocations
      : setupFee * numLocations;
  }

  // quantity_discount = base × tier_discount_pct
  const quantityDiscount = base * discountPct;

  // rush_surcharge = rush ? base × rush_surcharge_pct : 0
  const rushSurcharge = rush ? base * rushPct : 0;

  // total = (base - quantity_discount + setup + rush_surcharge) × markup
  const subtotal = base - quantityDiscount + setup + rushSurcharge;
  const total = subtotal * markup;
  const perShirt = total / quantity;

  const turnaroundDays = rush ? settings.rush_turnaround : settings.standard_turnaround;

  const r2 = (n) => Math.round(n * 100) / 100;

  return {
    per_shirt: r2(perShirt),
    total: r2(total),
    quantity,
    turnaround_days: turnaroundDays,
    breakdown: {
      garment_cost_per_piece: r2(garmentCost),
      print_cost_per_piece: r2(perPiecePrint),
      num_locations: numLocations,
      colors_per_location: colorsPerLocation,
      sizes: sizes.map((s) => ({ size: s.size, quantity: s.quantity, upcharge: r2(upchargeFor(s.size)) })),
      size_upcharge_total: r2(sizeUpchargeTotal),
      base: r2(base),
      setup: r2(setup),
      quantity_discount: r2(quantityDiscount),
      discount_pct: discountPct,
      rush_surcharge: r2(rushSurcharge),
      markup_multiplier: markup,
      subtotal: r2(subtotal),
    },
  };
}

/* ---------------------------------------------------------------------------
 * Pricing-table loader with a tiny in-memory cache. Live calculator hits this
 * on every keystroke; tables change rarely (admin edits) so a 60-second TTL
 * keeps Postgres quiet without making admin updates feel stale.
 * ------------------------------------------------------------------------- */
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60_000;

export async function loadPricingTables(force = false) {
  if (!force && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;

  const [garments, printMethods, quantityTiers, settingsRows] = await Promise.all([
    pool.query('SELECT * FROM instant_quote_garments WHERE active = true ORDER BY sort_order'),
    pool.query('SELECT * FROM instant_quote_print_methods WHERE active = true ORDER BY sort_order'),
    pool.query('SELECT * FROM instant_quote_quantity_tiers ORDER BY sort_order'),
    pool.query('SELECT * FROM instant_quote_settings WHERE id = 1'),
  ]);

  _cache = {
    garments: garments.rows,
    printMethods: printMethods.rows,
    quantityTiers: quantityTiers.rows,
    settings: settingsRows.rows[0],
  };
  _cacheAt = Date.now();
  return _cache;
}

export function invalidatePricingCache() {
  _cache = null;
  _cacheAt = 0;
}

/* ---------------------------------------------------------------------------
 * Resolve a picked product's "Your Price" from the catalog. Trusts the DB,
 * not the client — the client only sends ss_id, the server reads
 * custom_price ?? (base_price × 2). Returns null if the product isn't
 * found or has no usable price.
 * ------------------------------------------------------------------------- */
async function resolvePickedProductPrice(ss_id) {
  if (!ss_id) return null;
  const { rows } = await pool.query(
    'SELECT ss_id, name, base_price, custom_price FROM products WHERE ss_id = $1 LIMIT 1',
    [String(ss_id)]
  );
  if (!rows.length) return null;
  const p = rows[0];
  const yourPrice = p.custom_price != null && Number(p.custom_price) > 0
    ? Number(p.custom_price)
    : (Number(p.base_price) > 0 ? Number(p.base_price) * 2 : 0);
  if (!(yourPrice > 0)) return null;
  return { ss_id: p.ss_id, name: p.name, your_price: yourPrice };
}

/* ---------------------------------------------------------------------------
 * POST /api/quote/calculate
 * ------------------------------------------------------------------------- */
router.post('/calculate', async (req, res, next) => {
  try {
    const tables = await loadPricingTables();
    const inputs = { ...req.body };
    if (inputs.productSsId) {
      const picked = await resolvePickedProductPrice(inputs.productSsId);
      if (picked) inputs.pickedProduct = picked;
    }
    const result = computeQuote(inputs, tables);
    if (inputs.pickedProduct) result.picked_product = inputs.pickedProduct;
    res.json(result);
  } catch (err) {
    if (err.message.startsWith('Unknown') || err.message.startsWith('No quantity') || err.message.includes('must be')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * POST /api/quote/save — persist a calculated quote, email customer + admin.
 *
 * Accepts an `items` array (each entry is one line item: inputs + uploaded
 * designs). Recomputes every item server-side so the saved price matches
 * what the customer was shown and the client can't tamper. Header row goes
 * into `quotes`; one row per item goes into `quote_items` so the admin
 * editor sees them all.
 * ------------------------------------------------------------------------- */
router.post('/save', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { items, customer_name, customer_email, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }
    if (!customer_email || !/.+@.+\..+/.test(customer_email)) {
      return res.status(400).json({ error: 'customer_email is required' });
    }

    const tables = await loadPricingTables();

    // Compute each item server-side. Server is the source of truth for
    // catalog product price (custom_price ?? base_price × 2).
    const itemRows = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== 'object' || !item.inputs || typeof item.inputs !== 'object') {
        return res.status(400).json({ error: `items[${i}].inputs is required` });
      }
      const effectiveInputs = { ...item.inputs };
      let pickedProductMeta = null;
      if (effectiveInputs.productSsId) {
        const picked = await resolvePickedProductPrice(effectiveInputs.productSsId);
        if (picked) {
          effectiveInputs.pickedProduct = picked;
          pickedProductMeta = picked;
        }
      }
      let calc;
      try {
        calc = computeQuote(effectiveInputs, tables);
      } catch (err) {
        return res.status(400).json({ error: `items[${i}]: ${err.message}` });
      }
      itemRows.push({
        index: i,
        inputs: item.inputs,
        pickedProductMeta,
        calc,
        design_url: item.design_url || null,
        extra_design_urls: Array.isArray(item.extra_design_urls) ? item.extra_design_urls : [],
      });
    }

    const grandTotal = itemRows.reduce((s, r) => s + r.calc.total, 0);
    const grandQuantity = itemRows.reduce((s, r) => s + r.calc.quantity, 0);
    const perShirtAvg = grandQuantity > 0
      ? Math.round((grandTotal / grandQuantity) * 100) / 100
      : 0;

    // Header product_name on the legacy quotes row. Single-item keeps the
    // pre-refactor format so admin renderers that read it unchanged still
    // display something natural.
    let headerProductName;
    if (itemRows.length === 1) {
      const inp = itemRows[0].inputs;
      const picked = itemRows[0].pickedProductMeta;
      headerProductName = picked
        ? `${picked.name} — ${inp.methodName}`
        : `${inp.qualityTier} ${inp.garmentName} — ${inp.methodName}`;
    } else {
      headerProductName = `Multi-product quote (${itemRows.length} items)`;
    }

    // First item's design_url + extras populate the legacy header columns
    // so admin renderers that haven't been multi-item-ified still show
    // something useful. The full per-item designs live in quote_items.
    const firstItem = itemRows[0];

    // inputs_json stores the full multi-item payload so the email builder
    // and admin can rebuild a human-readable summary later.
    const inputsJson = {
      items: itemRows.map((r) => ({
        inputs: r.inputs,
        calc: r.calc,
        picked_product: r.pickedProductMeta || null,
        design_url: r.design_url,
        extra_design_urls: r.extra_design_urls,
      })),
      grand_total: grandTotal,
      grand_quantity: grandQuantity,
    };

    await client.query('BEGIN');

    const headerRes = await client.query(
      `INSERT INTO quotes
        (customer_name, customer_email, product_name, quantity,
         design_type, inputs_json, calculated_price,
         design_url, extra_design_urls,
         estimated_price, notes, status)
       VALUES ($1, $2, $3, $4, 'instant-quote', $5::jsonb, $6, $7, $8::jsonb, $9, $10, 'pending')
       RETURNING id, customer_name, customer_email, created_at`,
      [
        customer_name || null,
        customer_email,
        headerProductName,
        grandQuantity,
        JSON.stringify(inputsJson),
        grandTotal,
        firstItem.design_url || null,
        JSON.stringify(firstItem.extra_design_urls),
        grandTotal,
        notes || null,
      ],
    );
    const quote = headerRes.rows[0];

    for (const r of itemRows) {
      const inp = r.inputs;
      let productId = null;
      if (inp.productSsId) {
        const { rows } = await client.query(
          'SELECT id FROM products WHERE ss_id = $1 LIMIT 1',
          [String(inp.productSsId)],
        );
        productId = rows[0]?.id || null;
      }
      const itemProductName = r.pickedProductMeta
        ? r.pickedProductMeta.name
        : `${inp.qualityTier} ${inp.garmentName}`;
      const printAreas = [];
      if (inp.locations?.front) printAreas.push('front');
      if (inp.locations?.back) printAreas.push('back');
      if (inp.locations?.sleeve) printAreas.push('sleeve');

      await client.query(
        `INSERT INTO quote_items
          (quote_id, position, product_id, product_name, color, sizes, quantity,
           print_areas, design_url, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10, $11)`,
        [
          quote.id,
          r.index,
          productId,
          itemProductName,
          inp.color || null,
          JSON.stringify(Array.isArray(inp.sizes) ? inp.sizes : []),
          r.calc.quantity,
          JSON.stringify(printAreas),
          r.design_url || null,
          r.calc.per_shirt,
          r.calc.total,
        ],
      );
    }

    await client.query('COMMIT');

    // Fire emails — non-blocking from the customer's perspective; if either
    // fails we log but still return success since the row is persisted.
    Promise.allSettled([
      sendInstantQuoteToCustomer({ quote, items: itemRows, grandTotal, grandQuantity }),
      sendInstantQuoteToAdmin({ quote, items: itemRows, grandTotal, grandQuantity }),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[instant-quote save] email ${i === 0 ? 'customer' : 'admin'} failed:`, r.reason?.message || r.reason);
        }
      });
    });

    res.json({ id: quote.id, total: grandTotal, per_shirt: perShirtAvg, items: itemRows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/* ---------------------------------------------------------------------------
 * POST /api/quote/lock-in — create a Stripe Checkout Session for 50% deposit.
 *
 * The existing /webhook handler in routes/payments.js already processes
 * checkout.session.completed events with metadata.quoteId — it sets
 * status='accepted', records deposit_amount, and fires the customer
 * acceptance email. We reuse that pipeline by setting the same metadata
 * shape, so this endpoint only needs to create the session.
 *
 * Caller passes a saved quote_id (the id returned by /api/quote/save). We
 * look up calculated_price, halve it for the deposit, and return a Stripe
 * URL. The customer redirects to Stripe; the webhook does the rest.
 * ------------------------------------------------------------------------- */
router.post('/lock-in', async (req, res, next) => {
  try {
    const { quote_id } = req.body;
    if (!quote_id) return res.status(400).json({ error: 'quote_id is required' });

    const { rows } = await pool.query(
      `SELECT id, customer_email, customer_name, product_name, calculated_price, design_type
         FROM quotes WHERE id = $1`,
      [quote_id]
    );
    const quote = rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (quote.design_type !== 'instant-quote') {
      return res.status(400).json({ error: 'This endpoint only locks in instant-quote calculator orders' });
    }
    const total = Number(quote.calculated_price);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Quote has no calculated_price' });
    }

    const depositCents = Math.round(total * 100 * 0.5);
    const stripe = getStripe();
    const domain = process.env.DOMAIN || 'https://tshirtbrothers.com';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: quote.customer_email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: depositCents,
          product_data: {
            name: '50% Deposit — ' + (quote.product_name || 'Instant Quote'),
            description: `Quote #${quote.id} · Total $${total.toFixed(2)} · Balance ($${(total / 2).toFixed(2)}) due before pickup/ship`,
          },
        },
        quantity: 1,
      }],
      // metadata.quoteId triggers the existing webhook handler in
      // routes/payments.js: it marks the quote 'accepted', sets
      // deposit_amount, and emails the customer.
      metadata: {
        quoteId: String(quote.id),
        type: 'deposit',
        payment_type: 'instant-quote-deposit',
      },
      success_url: `${domain}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/instant-quote?quote=${quote.id}&cancelled=1`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) { next(err); }
});

/* GET the pricing tables (read-only) so the frontend can render the dropdowns. */
router.get('/options', async (_req, res, next) => {
  try {
    const t = await loadPricingTables();
    res.json({
      garments: t.garments.map((g) => ({
        id: g.id, name: g.name, quality_tier: g.quality_tier,
        base_cost: Number(g.base_cost), image_url: g.image_url,
      })),
      print_methods: t.printMethods.map((m) => ({
        id: m.id, name: m.name, charges_per_color: m.charges_per_color,
      })),
      quantity_tiers: t.quantityTiers.map((q) => ({
        id: q.id, min_qty: q.min_qty, max_qty: q.max_qty, discount_pct: Number(q.discount_pct),
      })),
      settings: {
        markup_multiplier: Number(t.settings.markup_multiplier),
        rush_surcharge_pct: Number(t.settings.rush_surcharge_pct),
        standard_turnaround: t.settings.standard_turnaround,
        rush_turnaround: t.settings.rush_turnaround,
        size_upcharges: t.settings.size_upcharges || {},
      },
    });
  } catch (err) { next(err); }
});

export default router;

/* ===========================================================================
 *  Admin sub-router — mounted at /api/admin/instant-quote-pricing
 *  Protected by the standard authenticate + adminOnly middleware. All four
 *  pricing tables are read & write through here so the shop owner can adjust
 *  prices without a developer call.
 * ========================================================================= */

export const adminRouter = Router();
adminRouter.use(authenticate, adminOnly);

adminRouter.get('/', async (_req, res, next) => {
  try {
    const tables = await loadPricingTables(true /* force fresh */);
    res.json({
      garments: tables.garments,
      print_methods: tables.printMethods,
      quantity_tiers: tables.quantityTiers,
      settings: tables.settings,
    });
  } catch (err) { next(err); }
});

/*
 * PATCH body shape:
 *   {
 *     garments?:        Array of { id?, name, quality_tier, base_cost, image_url, active, sort_order }
 *                       — rows with no id are inserted; rows with id are updated; ids missing
 *                       from the array are deleted (for that table) when `replace_garments: true`.
 *     print_methods?:   same shape (won't delete unless replace_print_methods)
 *     quantity_tiers?:  same shape (won't delete unless replace_quantity_tiers)
 *     settings?:        partial object, merges into singleton row.
 *   }
 *
 * Operations are wrapped in a single Postgres transaction so a partial-failure
 * leaves the tables consistent. After a successful commit the in-memory
 * pricing cache is invalidated so /api/quote/calculate sees changes within
 * one request.
 */
adminRouter.patch('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { garments, print_methods, quantity_tiers, settings, replace_garments, replace_print_methods, replace_quantity_tiers } = req.body;

    if (Array.isArray(garments)) {
      const keepIds = [];
      for (const g of garments) {
        if (typeof g.name !== 'string' || typeof g.quality_tier !== 'string' || g.base_cost == null) {
          throw new Error(`garment row missing required fields: ${JSON.stringify(g)}`);
        }
        if (g.id) {
          await client.query(
            `UPDATE instant_quote_garments
                SET name=$1, quality_tier=$2, base_cost=$3, image_url=$4, active=$5, sort_order=$6
              WHERE id=$7`,
            [g.name, g.quality_tier, g.base_cost, g.image_url || null, g.active !== false, g.sort_order || 0, g.id]
          );
          keepIds.push(g.id);
        } else {
          const r = await client.query(
            `INSERT INTO instant_quote_garments (name, quality_tier, base_cost, image_url, active, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (name, quality_tier) DO UPDATE
               SET base_cost=EXCLUDED.base_cost, image_url=EXCLUDED.image_url,
                   active=EXCLUDED.active, sort_order=EXCLUDED.sort_order
             RETURNING id`,
            [g.name, g.quality_tier, g.base_cost, g.image_url || null, g.active !== false, g.sort_order || 0]
          );
          keepIds.push(r.rows[0].id);
        }
      }
      if (replace_garments) {
        const ph = keepIds.length ? keepIds.map((_, i) => '$' + (i + 1)).join(',') : 'NULL';
        await client.query(`DELETE FROM instant_quote_garments WHERE id NOT IN (${ph})`, keepIds);
      }
    }

    if (Array.isArray(print_methods)) {
      const keepIds = [];
      for (const m of print_methods) {
        if (typeof m.name !== 'string' || m.base_per_piece_cost == null) {
          throw new Error(`print_method row missing required fields: ${JSON.stringify(m)}`);
        }
        if (m.id) {
          await client.query(
            `UPDATE instant_quote_print_methods
                SET name=$1, setup_fee_per_color=$2, base_per_piece_cost=$3, charges_per_color=$4, active=$5, sort_order=$6
              WHERE id=$7`,
            [m.name, m.setup_fee_per_color || 0, m.base_per_piece_cost, !!m.charges_per_color, m.active !== false, m.sort_order || 0, m.id]
          );
          keepIds.push(m.id);
        } else {
          const r = await client.query(
            `INSERT INTO instant_quote_print_methods (name, setup_fee_per_color, base_per_piece_cost, charges_per_color, active, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (name) DO UPDATE
               SET setup_fee_per_color=EXCLUDED.setup_fee_per_color,
                   base_per_piece_cost=EXCLUDED.base_per_piece_cost,
                   charges_per_color=EXCLUDED.charges_per_color,
                   active=EXCLUDED.active, sort_order=EXCLUDED.sort_order
             RETURNING id`,
            [m.name, m.setup_fee_per_color || 0, m.base_per_piece_cost, !!m.charges_per_color, m.active !== false, m.sort_order || 0]
          );
          keepIds.push(r.rows[0].id);
        }
      }
      if (replace_print_methods) {
        const ph = keepIds.length ? keepIds.map((_, i) => '$' + (i + 1)).join(',') : 'NULL';
        await client.query(`DELETE FROM instant_quote_print_methods WHERE id NOT IN (${ph})`, keepIds);
      }
    }

    if (Array.isArray(quantity_tiers)) {
      const keepIds = [];
      for (const q of quantity_tiers) {
        if (q.min_qty == null || q.discount_pct == null) {
          throw new Error(`quantity_tier row missing required fields: ${JSON.stringify(q)}`);
        }
        if (q.id) {
          await client.query(
            `UPDATE instant_quote_quantity_tiers
                SET min_qty=$1, max_qty=$2, discount_pct=$3, sort_order=$4
              WHERE id=$5`,
            [q.min_qty, q.max_qty == null ? null : q.max_qty, q.discount_pct, q.sort_order || 0, q.id]
          );
          keepIds.push(q.id);
        } else {
          const r = await client.query(
            `INSERT INTO instant_quote_quantity_tiers (min_qty, max_qty, discount_pct, sort_order)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [q.min_qty, q.max_qty == null ? null : q.max_qty, q.discount_pct, q.sort_order || 0]
          );
          keepIds.push(r.rows[0].id);
        }
      }
      if (replace_quantity_tiers) {
        const ph = keepIds.length ? keepIds.map((_, i) => '$' + (i + 1)).join(',') : 'NULL';
        await client.query(`DELETE FROM instant_quote_quantity_tiers WHERE id NOT IN (${ph})`, keepIds);
      }
    }

    if (settings && typeof settings === 'object') {
      const allowed = ['markup_multiplier', 'rush_surcharge_pct', 'rush_threshold_days', 'standard_turnaround', 'rush_turnaround', 'size_upcharges'];
      const updates = [];
      const vals = [];
      for (const k of allowed) {
        if (settings[k] !== undefined) {
          if (k === 'size_upcharges') {
            // JSONB column — serialize and cast so the driver doesn't
            // stringify the object as "[object Object]".
            vals.push(JSON.stringify(settings[k] || {}));
            updates.push(`${k}=$${vals.length}::jsonb`);
          } else {
            vals.push(settings[k]);
            updates.push(`${k}=$${vals.length}`);
          }
        }
      }
      if (updates.length) {
        updates.push(`updated_at=NOW()`);
        await client.query(`UPDATE instant_quote_settings SET ${updates.join(',')} WHERE id=1`, vals);
      }
    }

    await client.query('COMMIT');
    invalidatePricingCache();
    const fresh = await loadPricingTables(true);
    res.json({
      ok: true,
      garments: fresh.garments,
      print_methods: fresh.printMethods,
      quantity_tiers: fresh.quantityTiers,
      settings: fresh.settings,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.message?.includes('missing required fields')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  } finally {
    client.release();
  }
});
