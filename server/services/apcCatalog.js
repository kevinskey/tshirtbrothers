// All Print Club catalog + fulfillment service.
//
// Browsing never touches 4over: apc_products / apc_variants are our cache,
// filled either by the demo seed below (until Doc's 4over API keys arrive)
// or by syncFourOverCatalog(). Retail = trade cost × (1 + markup_percent/100),
// markup editable in the admin (apc_settings) with re-pricing on change.

import pool from '../db.js';
import {
  isFourOverConfigured, getProducts, getProductBasePrices, submitOrder,
} from './fourover.js';

export const DEFAULT_MARKUP_PERCENT = 70;

export async function getApcSetting(key, fallback) {
  const { rows } = await pool.query('SELECT value FROM apc_settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function getMarkupPercent() {
  const raw = await getApcSetting('markup_percent', DEFAULT_MARKUP_PERCENT);
  const pct = Number(raw);
  return Number.isFinite(pct) && pct >= 0 ? pct : DEFAULT_MARKUP_PERCENT;
}

export function retailFromCost(costCents, markupPercent) {
  // Round up to a clean .99 under $100, whole dollars above — print buyers
  // compare against VistaPrint-style pricing, so avoid $43.17-style numbers.
  const raw = Math.ceil(costCents * (1 + markupPercent / 100));
  if (raw < 10000) return Math.ceil(raw / 100) * 100 - 1;
  return Math.ceil(raw / 100) * 100;
}

export function optionKeyFor(optionIds) {
  return [...optionIds].map(String).sort().join('|');
}

// ── Demo catalog ─────────────────────────────────────────────────────────
// Realistic products/options with plausible trade costs so the storefront,
// cart, checkout and admin are fully exercisable before the 4over keys
// arrive. The first successful real sync disables all source='demo' rows.

const cents = (dollars) => Math.round(dollars * 100);

const DEMO_PRODUCTS = [
  {
    code: 'apc-business-cards',
    name: 'Business Cards',
    category: 'Business Cards',
    description: 'Full-color business cards on premium card stock. Front and back printing included.',
    image_url: null,
    groups: [
      { group: 'Size', values: [{ id: 'size-35x2', name: '3.5" x 2"' }] },
      {
        group: 'Stock',
        values: [
          { id: 'stock-14pt', name: '14pt Gloss Coated' },
          { id: 'stock-16pt', name: '16pt Premium Matte' },
        ],
      },
      {
        group: 'Coating',
        values: [
          { id: 'coat-uv', name: 'High Gloss UV' },
          { id: 'coat-matte', name: 'Matte Finish' },
        ],
      },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-100', name: '100' },
          { id: 'qty-250', name: '250' },
          { id: 'qty-500', name: '500' },
          { id: 'qty-1000', name: '1,000' },
          { id: 'qty-2500', name: '2,500' },
        ],
      },
    ],
    cost(sel) {
      const base = { 'qty-100': 7.5, 'qty-250': 9.5, 'qty-500': 12.5, 'qty-1000': 18, 'qty-2500': 36 }[sel.Quantity.id];
      const stockMult = sel.Stock.id === 'stock-16pt' ? 1.25 : 1;
      return cents(base * stockMult);
    },
  },
  {
    code: 'apc-flyers',
    name: 'Flyers',
    category: 'Flyers & Brochures',
    description: 'Vibrant full-color flyers on 100lb gloss text, perfect for events and promotions.',
    image_url: null,
    groups: [
      {
        group: 'Size',
        values: [
          { id: 'size-55x85', name: '5.5" x 8.5"' },
          { id: 'size-85x11', name: '8.5" x 11"' },
        ],
      },
      { group: 'Stock', values: [{ id: 'stock-100lb', name: '100lb Gloss Text' }] },
      {
        group: 'Sides',
        values: [
          { id: 'sides-1', name: 'Front Only' },
          { id: 'sides-2', name: 'Front & Back' },
        ],
      },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-100', name: '100' },
          { id: 'qty-250', name: '250' },
          { id: 'qty-500', name: '500' },
          { id: 'qty-1000', name: '1,000' },
        ],
      },
    ],
    cost(sel) {
      const base = { 'qty-100': 22, 'qty-250': 32, 'qty-500': 45, 'qty-1000': 68 }[sel.Quantity.id];
      const sizeMult = sel.Size.id === 'size-85x11' ? 1.45 : 1;
      const sidesMult = sel.Sides.id === 'sides-2' ? 1.3 : 1;
      return cents(base * sizeMult * sidesMult);
    },
  },
  {
    code: 'apc-postcards',
    name: 'Postcards',
    category: 'Postcards',
    description: 'Thick 14pt postcards with UV or matte finish — mailers, promos, and announcements.',
    image_url: null,
    groups: [
      {
        group: 'Size',
        values: [
          { id: 'size-4x6', name: '4" x 6"' },
          { id: 'size-5x7', name: '5" x 7"' },
        ],
      },
      { group: 'Stock', values: [{ id: 'stock-14pt', name: '14pt Card Stock' }] },
      {
        group: 'Coating',
        values: [
          { id: 'coat-uv', name: 'High Gloss UV' },
          { id: 'coat-matte', name: 'Matte Finish' },
        ],
      },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-100', name: '100' },
          { id: 'qty-250', name: '250' },
          { id: 'qty-500', name: '500' },
          { id: 'qty-1000', name: '1,000' },
        ],
      },
    ],
    cost(sel) {
      const base = { 'qty-100': 14, 'qty-250': 19, 'qty-500': 26, 'qty-1000': 39 }[sel.Quantity.id];
      const sizeMult = sel.Size.id === 'size-5x7' ? 1.35 : 1;
      return cents(base * sizeMult);
    },
  },
  {
    code: 'apc-vinyl-banners',
    name: 'Vinyl Banners',
    category: 'Signs & Banners',
    description: 'Durable 13oz vinyl banners with hems and grommets, printed in brilliant full color.',
    image_url: null,
    groups: [
      {
        group: 'Size',
        values: [
          { id: 'size-2x4', name: "2' x 4'" },
          { id: 'size-3x6', name: "3' x 6'" },
          { id: 'size-4x8', name: "4' x 8'" },
        ],
      },
      { group: 'Material', values: [{ id: 'mat-13oz', name: '13oz Scrim Vinyl' }] },
      { group: 'Finishing', values: [{ id: 'fin-hg', name: 'Hems & Grommets' }] },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-1', name: '1' },
          { id: 'qty-2', name: '2' },
          { id: 'qty-5', name: '5' },
        ],
      },
    ],
    cost(sel) {
      const perBanner = { 'size-2x4': 19, 'size-3x6': 36, 'size-4x8': 58 }[sel.Size.id];
      const qty = { 'qty-1': 1, 'qty-2': 2, 'qty-5': 5 }[sel.Quantity.id];
      const qtyDiscount = qty >= 5 ? 0.88 : qty >= 2 ? 0.94 : 1;
      return cents(perBanner * qty * qtyDiscount);
    },
  },
  {
    code: 'apc-stickers',
    name: 'Stickers',
    category: 'Stickers & Labels',
    description: 'Weather-resistant vinyl stickers, square or circle, with a glossy finish.',
    image_url: null,
    groups: [
      {
        group: 'Size',
        values: [
          { id: 'size-3x3', name: '3" x 3"' },
          { id: 'size-4x4', name: '4" x 4"' },
        ],
      },
      {
        group: 'Shape',
        values: [
          { id: 'shape-square', name: 'Square' },
          { id: 'shape-circle', name: 'Circle' },
        ],
      },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-50', name: '50' },
          { id: 'qty-100', name: '100' },
          { id: 'qty-250', name: '250' },
          { id: 'qty-500', name: '500' },
        ],
      },
    ],
    cost(sel) {
      const base = { 'qty-50': 16, 'qty-100': 24, 'qty-250': 42, 'qty-500': 66 }[sel.Quantity.id];
      const sizeMult = sel.Size.id === 'size-4x4' ? 1.3 : 1;
      return cents(base * sizeMult);
    },
  },
  {
    code: 'apc-yard-signs',
    name: 'Yard Signs',
    category: 'Signs & Banners',
    description: '18" x 24" coroplast yard signs — campaigns, events, open houses. H-stakes not included.',
    image_url: null,
    groups: [
      { group: 'Size', values: [{ id: 'size-18x24', name: '18" x 24"' }] },
      { group: 'Material', values: [{ id: 'mat-coro', name: '4mm Coroplast' }] },
      {
        group: 'Sides',
        values: [
          { id: 'sides-1', name: 'Single Sided' },
          { id: 'sides-2', name: 'Double Sided' },
        ],
      },
      {
        group: 'Quantity',
        values: [
          { id: 'qty-1', name: '1' },
          { id: 'qty-5', name: '5' },
          { id: 'qty-10', name: '10' },
          { id: 'qty-25', name: '25' },
        ],
      },
    ],
    cost(sel) {
      const per = { 'qty-1': 11, 'qty-5': 8.6, 'qty-10': 7.4, 'qty-25': 6.2 }[sel.Quantity.id];
      const qty = { 'qty-1': 1, 'qty-5': 5, 'qty-10': 10, 'qty-25': 25 }[sel.Quantity.id];
      const sidesMult = sel.Sides.id === 'sides-2' ? 1.45 : 1;
      return cents(per * qty * sidesMult);
    },
  },
];

function* combinations(groups) {
  if (!groups.length) { yield {}; return; }
  const [head, ...rest] = groups;
  for (const value of head.values) {
    for (const tail of combinations(rest)) {
      yield { [head.group]: value, ...tail };
    }
  }
}

// Idempotent: inserts nothing once any apc_products exist (demo or synced).
export async function seedApcDemoCatalog() {
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM apc_products');
  if (count > 0) return;

  const markup = await getMarkupPercent();
  for (const [index, demo] of DEMO_PRODUCTS.entries()) {
    const { rows: [product] } = await pool.query(
      `INSERT INTO apc_products (code, name, category, description, image_url, option_groups, enabled, source, position)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'demo', $7)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [demo.code, demo.name, demo.category, demo.description, demo.image_url,
        JSON.stringify(demo.groups), index],
    );
    if (!product) continue;
    for (const sel of combinations(demo.groups)) {
      const ids = Object.values(sel).map((v) => v.id);
      const options = Object.fromEntries(Object.entries(sel).map(([g, v]) => [g, v.name]));
      const cost = demo.cost(sel);
      await pool.query(
        `INSERT INTO apc_variants (product_id, option_key, options, cost_cents, retail_cents)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, option_key) DO NOTHING`,
        [product.id, optionKeyFor(ids), JSON.stringify(options), cost, retailFromCost(cost, markup)],
      );
    }
  }
  console.log('[apc] demo catalog seeded');
}

// Re-price every variant after a markup change (admin settings PUT).
export async function repriceApcVariants() {
  const markup = await getMarkupPercent();
  // retailFromCost is JS-side rounding, so loop rather than one UPDATE.
  const { rows } = await pool.query('SELECT id, cost_cents FROM apc_variants');
  for (const row of rows) {
    await pool.query('UPDATE apc_variants SET retail_cents = $2 WHERE id = $1',
      [row.id, retailFromCost(row.cost_cents, markup)]);
  }
  return rows.length;
}

// ── Real 4over sync ──────────────────────────────────────────────────────
// Pulls the product feed and base prices into our tables. New products come
// in DISABLED so Doc publishes deliberately from the admin (mirrors the JDS
// bulk-publish discipline). Response field names must be validated on first
// run with real keys — everything is defensive here.

export async function syncFourOverCatalog() {
  if (!isFourOverConfigured()) {
    return { skipped: true, reason: '4over API keys not configured' };
  }
  const markup = await getMarkupPercent();
  let imported = 0;
  let offset = 0;

  for (;;) {
    const page = await getProducts({ max: 200, offset });
    const entities = page?.entities || page?.products || (Array.isArray(page) ? page : []);
    if (!entities.length) break;

    for (const p of entities) {
      const uuid = p.product_uuid || p.uuid || p.id;
      const code = p.product_code || p.sku || p.code || uuid;
      const name = p.product_description || p.name || code;
      if (!uuid || !code) continue;

      const { rows: [product] } = await pool.query(
        `INSERT INTO apc_products (code, fourover_uuid, name, category, source, enabled)
         VALUES ($1, $2, $3, $4, '4over', FALSE)
         ON CONFLICT (code) DO UPDATE
           SET fourover_uuid = EXCLUDED.fourover_uuid,
               name = EXCLUDED.name,
               category = EXCLUDED.category,
               source = '4over',
               updated_at = NOW()
         RETURNING id`,
        [code, uuid, name, p.category_name || p.category || 'Print Products'],
      );

      try {
        const prices = await getProductBasePrices(uuid);
        const priceRows = prices?.entities || (Array.isArray(prices) ? prices : []);
        for (const v of priceRows) {
          const cost = Math.round(parseFloat(v.product_baseprice ?? v.price ?? v.baseprice ?? 'NaN') * 100);
          if (!Number.isFinite(cost)) continue;
          const comboIds = [
            v.runsize_uuid, v.colorspec_uuid,
            ...(Array.isArray(v.option_uuids) ? v.option_uuids : []),
          ].filter(Boolean);
          if (!comboIds.length) continue;
          const options = {};
          if (v.runsize) options.Quantity = String(v.runsize);
          if (v.colorspec) options.Colors = String(v.colorspec);
          await pool.query(
            `INSERT INTO apc_variants (product_id, option_key, options, cost_cents, retail_cents, fourover_price_uuid)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (product_id, option_key) DO UPDATE
               SET cost_cents = EXCLUDED.cost_cents,
                   retail_cents = EXCLUDED.retail_cents,
                   fourover_price_uuid = EXCLUDED.fourover_price_uuid`,
            [product.id, optionKeyFor(comboIds), JSON.stringify(options),
              cost, retailFromCost(cost, markup), v.base_price_uuid || v.price_uuid || null],
          );
        }
      } catch (err) {
        console.error(`[apc] base prices failed for ${code}:`, err.message);
      }
      imported += 1;
    }
    offset += entities.length;
    if (!page?.totalResults || offset >= page.totalResults) break;
  }

  // Real catalog in → retire the demo rows from the storefront.
  if (imported > 0) {
    await pool.query("UPDATE apc_products SET enabled = FALSE, updated_at = NOW() WHERE source = 'demo'");
  }
  return { skipped: false, imported };
}

// ── Order submission ─────────────────────────────────────────────────────
// Called fire-and-forget from the Stripe webhook after an APC order flips
// to paid. Payment is never blocked on 4over: failures are recorded on the
// order for the admin, and Doc can place it manually on trade.4over.com.

export async function submitPaidOrderToFourOver(orderId) {
  const { rows: [order] } = await pool.query(
    "SELECT * FROM apc_orders WHERE id = $1 AND status = 'paid' AND fourover_order_id IS NULL",
    [orderId],
  );
  if (!order) return;

  if (!isFourOverConfigured()) {
    await pool.query(
      "UPDATE apc_orders SET fourover_status = 'awaiting_api_keys', updated_at = NOW() WHERE id = $1",
      [orderId],
    );
    return;
  }

  const { rows: items } = await pool.query(
    `SELECT i.*, p.fourover_uuid FROM apc_order_items i
     JOIN apc_products p ON p.code = i.product_code
     WHERE i.order_id = $1`,
    [orderId],
  );
  const addr = order.shipping_address || {};

  try {
    const result = await submitOrder({
      items: items.map((i) => ({
        product_uuid: i.fourover_uuid,
        option_key: i.option_key,
        options: i.options,
        quantity: i.qty,
        files: Array.isArray(i.artwork) ? i.artwork : [],
        reference: `APC-${order.id}-${i.id}`,
      })),
      shipping: {
        name: order.customer_name || '',
        email: order.customer_email || '',
        address1: addr.line1 || '',
        address2: addr.line2 || '',
        city: addr.city || '',
        state: addr.state || '',
        zip: addr.postal_code || '',
        country: addr.country || 'US',
      },
      reference: `APC-${order.id}`,
    });
    await pool.query(
      `UPDATE apc_orders SET fourover_order_id = $2, fourover_status = 'submitted',
         status = 'ordered', submit_error = NULL, updated_at = NOW() WHERE id = $1`,
      [orderId, String(result?.order_id || result?.id || result?.orderId || '')],
    );
  } catch (err) {
    console.error(`[apc] 4over submit failed for order ${orderId}:`, err.message);
    await pool.query(
      `UPDATE apc_orders SET fourover_status = 'submit_failed', submit_error = $2,
         updated_at = NOW() WHERE id = $1`,
      [orderId, err.message.slice(0, 500)],
    );
  }
}
