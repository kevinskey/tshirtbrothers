import { Router } from 'express';
import pool from '../db.js';
import { sendInstantQuoteToCustomer, sendInstantQuoteToAdmin } from '../services/email.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

/* ---------------------------------------------------------------------------
 * computeQuote — pure pricing function. Exported for unit tests so the
 * formula can be exercised without an Express + Postgres stack.
 *
 *   inputs = {
 *     quantity:           1+ integer
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
    quantity,
    garmentName,
    qualityTier,
    methodName,
    numLocations,
    colorsPerLocation = 1,
    rush = false,
  } = inputs;

  // Input validation
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }
  if (!Number.isInteger(numLocations) || numLocations < 1) {
    throw new Error('numLocations must be a positive integer');
  }
  if (!Number.isInteger(colorsPerLocation) || colorsPerLocation < 1) {
    throw new Error('colorsPerLocation must be a positive integer');
  }

  // Lookup
  const garment = tables.garments.find(
    (g) => g.name === garmentName && g.quality_tier === qualityTier && g.active !== false
  );
  if (!garment) throw new Error(`Unknown garment: ${garmentName} / ${qualityTier}`);

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

  // base = (garment_cost + per_piece_print_cost × num_locations) × quantity
  const base = (garmentCost + perPiecePrint * numLocations) * quantity;

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
    turnaround_days: turnaroundDays,
    breakdown: {
      garment_cost_per_piece: r2(garmentCost),
      print_cost_per_piece: r2(perPiecePrint),
      num_locations: numLocations,
      colors_per_location: colorsPerLocation,
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
 * POST /api/quote/calculate
 * ------------------------------------------------------------------------- */
router.post('/calculate', async (req, res, next) => {
  try {
    const tables = await loadPricingTables();
    const result = computeQuote(req.body, tables);
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
 * Recomputes server-side from the same inputs to make sure the saved price
 * matches what the customer was shown (and to defeat any client tampering).
 * ------------------------------------------------------------------------- */
router.post('/save', async (req, res, next) => {
  try {
    const { inputs, customer_name, customer_email, notes } = req.body;
    if (!inputs || typeof inputs !== 'object') {
      return res.status(400).json({ error: 'inputs object is required' });
    }
    if (!customer_email || !/.+@.+\..+/.test(customer_email)) {
      return res.status(400).json({ error: 'customer_email is required' });
    }

    // Recompute server-side
    const tables = await loadPricingTables();
    let calc;
    try {
      calc = computeQuote(inputs, tables);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Stash the full input set + price snapshot. inputs_json column was
    // added by migration instant_quote_save_columns.sql.
    const productName = `${inputs.qualityTier} ${inputs.garmentName} — ${inputs.methodName}`;
    const result = await pool.query(
      `INSERT INTO quotes
        (customer_name, customer_email, product_name, quantity,
         design_type, inputs_json, calculated_price,
         estimated_price, notes, status)
       VALUES ($1, $2, $3, $4, 'instant-quote', $5::jsonb, $6, $7, $8, 'pending')
       RETURNING id, customer_name, customer_email, created_at`,
      [
        customer_name || null,
        customer_email,
        productName,
        inputs.quantity,
        JSON.stringify(inputs),
        calc.total,
        calc.total,
        notes || null,
      ]
    );
    const quote = result.rows[0];

    // Fire emails — non-blocking from the customer's perspective; if either
    // fails we log but still return success since the row is persisted.
    Promise.allSettled([
      sendInstantQuoteToCustomer({ quote, inputs, calc }),
      sendInstantQuoteToAdmin({ quote, inputs, calc }),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[instant-quote save] email ${i === 0 ? 'customer' : 'admin'} failed:`, r.reason?.message || r.reason);
        }
      });
    });

    res.json({ id: quote.id, total: calc.total, per_shirt: calc.per_shirt });
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
      const allowed = ['markup_multiplier', 'rush_surcharge_pct', 'rush_threshold_days', 'standard_turnaround', 'rush_turnaround'];
      const updates = [];
      const vals = [];
      for (const k of allowed) {
        if (settings[k] !== undefined) {
          vals.push(settings[k]);
          updates.push(`${k}=$${vals.length}`);
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
