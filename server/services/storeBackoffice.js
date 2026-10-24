// Store back office — the shared implementation behind both admin surfaces.
//
// Every store TSB builds gets these tools, so nothing here may branch on a
// particular store. Everything keys on store_id and reads from data.
//
// Two callers, one implementation:
//   /api/group-store-admin/:slug/...   the store's own owner (storeAdminSession)
//   /api/admin/group-stores/:id/...    TSB staff (authenticate + adminOnly)
// Both resolve to a store_id and call in here, so the two surfaces can't
// drift in behaviour the way the coupon list and the checkout did.
//
// Callers are responsible for authn/authz. These functions assume the
// store_id has already been authorized, but they still scope every query by
// it so a bad id can only ever touch its own rows.

import pool from '../db.js';

export class BackofficeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new BackofficeError(400, msg);

// Slugs are used in URLs and are unique per store.
export function normalizeSlug(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function asInt(value, field, { min = null, max = null, allowNull = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (allowNull) return null;
    throw bad(`${field} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad(`${field} must be a whole number`);
  if (min !== null && n < min) throw bad(`${field} must be at least ${min}`);
  if (max !== null && n > max) throw bad(`${field} must be at most ${max}`);
  return n;
}

// ── Storefront content ───────────────────────────────────────────────────
// `key` names a slot the storefront asks for ('hero', 'promo_bar', 'about').
// `body` is whatever that slot's component expects, so adding a slot needs
// no migration — but it does mean the storefront must tolerate a missing or
// half-filled body, since an owner can save one at any time.

export async function listContent(storeId, { key = null, includeInactive = false } = {}) {
  const params = [storeId];
  let where = 'store_id = $1';
  if (key) {
    params.push(key);
    where += ` AND key = $${params.length}`;
  }
  if (!includeInactive) where += ' AND active';

  const { rows } = await pool.query(
    `SELECT id, key, body, sort_order, active, updated_by, updated_at
       FROM store_content
      WHERE ${where}
      ORDER BY key, sort_order, id`,
    params,
  );
  return rows;
}

export async function upsertContent(storeId, payload, actorEmail) {
  const key = String(payload?.key ?? '').trim();
  if (!key) throw bad('key is required');
  if (key.length > 64) throw bad('key must be 64 characters or fewer');

  const body = payload?.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw bad('body must be an object');
  }
  const sortOrder = asInt(payload?.sort_order ?? 0, 'sort_order', { min: 0 });
  const active = payload?.active === undefined ? true : Boolean(payload.active);

  // The unique index is (store_id, key, sort_order) — a slot can hold an
  // ordered list of blocks, e.g. a hero carousel.
  const { rows } = await pool.query(
    `INSERT INTO store_content (store_id, key, body, sort_order, active, updated_by)
          VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (store_id, key, sort_order)
       DO UPDATE SET body = EXCLUDED.body,
                     active = EXCLUDED.active,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()
       RETURNING id, key, body, sort_order, active, updated_by, updated_at`,
    [storeId, key, JSON.stringify(body), sortOrder, active, actorEmail ?? null],
  );
  return rows[0];
}

export async function deleteContent(storeId, contentId) {
  const id = asInt(contentId, 'content id');
  const { rowCount } = await pool.query(
    `DELETE FROM store_content WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  if (!rowCount) throw new BackofficeError(404, 'Content block not found');
  return { deleted: true };
}

// ── Categories ───────────────────────────────────────────────────────────

export async function listCategories(storeId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.description, c.image_url,
            c.sort_order, c.active,
            COUNT(pc.store_product_id)::int AS product_count
       FROM store_categories c
       LEFT JOIN store_product_categories pc ON pc.store_category_id = c.id
      WHERE c.store_id = $1 ${includeInactive ? '' : 'AND c.active'}
      GROUP BY c.id
      ORDER BY c.sort_order, c.name`,
    [storeId],
  );
  return rows;
}

export async function upsertCategory(storeId, payload) {
  const name = String(payload?.name ?? '').trim();
  if (!name) throw bad('name is required');
  if (name.length > 120) throw bad('name must be 120 characters or fewer');

  const slug = normalizeSlug(payload?.slug || name);
  if (!slug) throw bad('slug could not be derived from name');

  const sortOrder = asInt(payload?.sort_order ?? 0, 'sort_order', { min: 0 });
  const active = payload?.active === undefined ? true : Boolean(payload.active);
  const description = payload?.description ?? null;
  const imageUrl = payload?.image_url ?? null;

  if (payload?.id) {
    const id = asInt(payload.id, 'id');
    const { rows } = await pool.query(
      `UPDATE store_categories
          SET name = $1, slug = $2, description = $3, image_url = $4,
              sort_order = $5, active = $6, updated_at = NOW()
        WHERE id = $7 AND store_id = $8
        RETURNING id, name, slug, description, image_url, sort_order, active`,
      [name, slug, description, imageUrl, sortOrder, active, id, storeId],
    );
    if (!rows[0]) throw new BackofficeError(404, 'Category not found');
    return rows[0];
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO store_categories
         (store_id, name, slug, description, image_url, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, slug, description, image_url, sort_order, active`,
      [storeId, name, slug, description, imageUrl, sortOrder, active],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new BackofficeError(409, `A category with slug "${slug}" already exists`);
    throw err;
  }
}

export async function deleteCategory(storeId, categoryId) {
  const id = asInt(categoryId, 'category id');
  // store_product_categories cascades, so products survive and simply lose
  // the grouping.
  const { rowCount } = await pool.query(
    `DELETE FROM store_categories WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  if (!rowCount) throw new BackofficeError(404, 'Category not found');
  return { deleted: true };
}

// Replaces a product's category membership wholesale — the UI edits this as
// a set of checkboxes, so a diff would be more code for the same result.
export async function setProductCategories(storeId, productId, categoryIds) {
  const pid = asInt(productId, 'product id');
  if (!Array.isArray(categoryIds)) throw bad('category_ids must be an array');
  const ids = categoryIds.map((c, i) => asInt(c, `category_ids[${i}]`));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const owns = await client.query(
      `SELECT 1 FROM store_products WHERE id = $1 AND store_id = $2`,
      [pid, storeId],
    );
    if (!owns.rows[0]) throw new BackofficeError(404, 'Product not found');

    if (ids.length) {
      // Reject ids belonging to another store before writing anything —
      // otherwise a store could file its product under a rival's category.
      const valid = await client.query(
        `SELECT id FROM store_categories WHERE store_id = $1 AND id = ANY($2::int[])`,
        [storeId, ids],
      );
      if (valid.rows.length !== ids.length) {
        throw new BackofficeError(404, 'One or more categories not found for this store');
      }
    }

    await client.query(
      `DELETE FROM store_product_categories WHERE store_product_id = $1`,
      [pid],
    );
    for (const [i, cid] of ids.entries()) {
      await client.query(
        `INSERT INTO store_product_categories (store_product_id, store_category_id, sort_order)
              VALUES ($1, $2, $3)`,
        [pid, cid, i],
      );
    }

    await client.query('COMMIT');
    return { store_product_id: pid, category_ids: ids };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Product merchandising ────────────────────────────────────────────────
// Deliberately NOT the same field list as the TSB staff PATCH: a store may
// set how its products present and what they cost a shopper, but not the
// blank cost or the S&S SKU, which drive TSB's margin and fulfilment.

// The back office must list hidden products too — the public storefront
// endpoint only returns live ones, so an owner who hid something would have
// no way to find it again and turn it back on.
export async function listProducts(storeId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.title, p.slug, p.description, p.cover_image,
            p.retail_price_cents, p.compare_at_cents, p.gallery_json,
            p.variants_json, p.campaign_ref, p.sort_order, p.is_active,
            p.opens_at, p.closes_at, p.published_at,
            COALESCE(
              ARRAY_REMOVE(ARRAY_AGG(c.slug ORDER BY pc.sort_order), NULL),
              '{}'
            ) AS category_slugs
       FROM store_products p
       LEFT JOIN store_product_categories pc ON pc.store_product_id = p.id
       LEFT JOIN store_categories c ON c.id = pc.store_category_id AND c.active
      WHERE p.store_id = $1
      GROUP BY p.id
      ORDER BY p.sort_order, p.published_at DESC, p.id
      LIMIT 500`,
    [storeId],
  );
  return rows;
}

const MERCH_FIELDS = {
  title: (v) => {
    const s = String(v ?? '').trim();
    if (!s) throw bad('title cannot be empty');
    return s.slice(0, 255);
  },
  description: (v) => (v === null ? null : String(v)),
  cover_image: (v) => (v === null ? null : String(v)),
  retail_price_cents: (v) => asInt(v, 'retail_price_cents', { min: 1 }),
  compare_at_cents: (v) => asInt(v, 'compare_at_cents', { min: 0, allowNull: true }),
  sort_order: (v) => asInt(v, 'sort_order', { min: 0 }),
  is_active: (v) => Boolean(v),
  gallery_json: (v) => {
    if (!Array.isArray(v)) throw bad('gallery_json must be an array of image URLs');
    if (v.length > 12) throw bad('gallery_json is limited to 12 images');
    return JSON.stringify(v.map(String));
  },
};

export async function updateProductMerch(storeId, productId, payload) {
  const pid = asInt(productId, 'product id');

  const sets = [];
  const params = [];
  for (const [field, coerce] of Object.entries(MERCH_FIELDS)) {
    if (!(field in (payload ?? {}))) continue;
    params.push(coerce(payload[field]));
    sets.push(`${field} = $${params.length}${field === 'gallery_json' ? '::jsonb' : ''}`);
  }
  if (!sets.length) throw bad('No editable fields supplied');

  // compare_at is the struck-through "was" price; below retail it reads as
  // a price increase, which is almost always a typo rather than intent.
  if (payload.compare_at_cents != null && payload.retail_price_cents != null
      && Number(payload.compare_at_cents) <= Number(payload.retail_price_cents)) {
    throw bad('compare_at_cents must be greater than retail_price_cents');
  }

  params.push(pid, storeId);
  const { rows } = await pool.query(
    `UPDATE store_products
        SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND store_id = $${params.length}
      RETURNING id, title, slug, description, cover_image, retail_price_cents,
                compare_at_cents, sort_order, is_active, gallery_json`,
    params,
  );
  if (!rows[0]) throw new BackofficeError(404, 'Product not found');
  return rows[0];
}

// Bulk reorder from a drag-and-drop list. One statement so a long list
// can't half-apply.
export async function reorderProducts(storeId, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw bad('product_ids must be a non-empty array');
  }
  const ids = orderedIds.map((v, i) => asInt(v, `product_ids[${i}]`));

  const { rowCount } = await pool.query(
    `UPDATE store_products AS sp
        SET sort_order = ord.idx
       FROM unnest($1::int[]) WITH ORDINALITY AS ord(id, idx)
      WHERE sp.id = ord.id AND sp.store_id = $2`,
    [ids, storeId],
  );
  return { reordered: rowCount };
}

// ── Promotions ───────────────────────────────────────────────────────────
// A store's own promo codes. These exist because Stripe's
// `allow_promotion_codes: true` is account-wide: it offers EVERY promo code
// on the TSB account at EVERY store's checkout. Codes live here instead, are
// validated server-side against one store_id, and reach Stripe as a
// single-use coupon minted for that one session.

const DISCOUNT_TYPES = ['percent', 'amount', 'free_shipping'];

function normalizeCode(raw) {
  return String(raw ?? '').trim().toUpperCase().slice(0, 64);
}

function asTimestamp(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad(`${field} is not a valid date`);
  return d.toISOString();
}

export async function listPromotions(storeId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.headline, p.subtext, p.discount_type, p.discount_value,
            p.min_order_cents, p.max_uses, p.max_uses_per_email, p.times_used,
            p.active, p.starts_at, p.expires_at, p.created_by, p.created_at,
            COALESCE(SUM(r.amount_off_cents), 0)::int AS total_discount_cents
       FROM store_promotions p
       LEFT JOIN store_promotion_redemptions r ON r.promotion_id = p.id
      WHERE p.store_id = $1 ${includeInactive ? '' : 'AND p.active'}
      GROUP BY p.id
      ORDER BY p.active DESC, p.created_at DESC`,
    [storeId],
  );
  return rows;
}

export async function upsertPromotion(storeId, payload, actorEmail) {
  const code = normalizeCode(payload?.code);
  if (!code) throw bad('code is required');
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    throw bad('code may only contain letters, digits, hyphens and underscores');
  }

  const discountType = String(payload?.discount_type ?? '').trim();
  if (!DISCOUNT_TYPES.includes(discountType)) {
    throw bad(`discount_type must be one of ${DISCOUNT_TYPES.join(', ')}`);
  }

  // percent is 0-100; amount is cents. free_shipping ignores the value, so
  // it is stored as 0 rather than whatever the form happened to submit.
  let discountValue = 0;
  if (discountType === 'percent') {
    discountValue = asInt(payload?.discount_value, 'discount_value', { min: 1, max: 100 });
  } else if (discountType === 'amount') {
    discountValue = asInt(payload?.discount_value, 'discount_value', { min: 1 });
  }

  const minOrder = asInt(payload?.min_order_cents ?? 0, 'min_order_cents', { min: 0 });
  const maxUses = asInt(payload?.max_uses, 'max_uses', { min: 1, allowNull: true });
  const maxPerEmail = asInt(payload?.max_uses_per_email, 'max_uses_per_email', { min: 1, allowNull: true });
  const active = payload?.active === undefined ? true : Boolean(payload.active);
  const startsAt = asTimestamp(payload?.starts_at, 'starts_at');
  const expiresAt = asTimestamp(payload?.expires_at, 'expires_at');
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    throw bad('expires_at must be after starts_at');
  }
  // A fixed-amount code worth more than the minimum order can take an order
  // to zero, which Stripe rejects at checkout rather than at save time.
  if (discountType === 'amount' && minOrder > 0 && discountValue >= minOrder) {
    throw bad('discount_value must be less than min_order_cents');
  }

  const cols = [
    payload?.headline ?? null, payload?.subtext ?? null, discountType, discountValue,
    minOrder, maxUses, maxPerEmail, active, startsAt, expiresAt,
  ];

  try {
    if (payload?.id) {
      const id = asInt(payload.id, 'id');
      const { rows } = await pool.query(
        `UPDATE store_promotions
            SET code = $1, headline = $2, subtext = $3, discount_type = $4,
                discount_value = $5, min_order_cents = $6, max_uses = $7,
                max_uses_per_email = $8, active = $9, starts_at = $10,
                expires_at = $11, updated_at = NOW()
          WHERE id = $12 AND store_id = $13
          RETURNING id, code, headline, subtext, discount_type, discount_value,
                    min_order_cents, max_uses, max_uses_per_email, times_used,
                    active, starts_at, expires_at`,
        [code, ...cols, id, storeId],
      );
      if (!rows[0]) throw new BackofficeError(404, 'Promotion not found');
      return rows[0];
    }

    const { rows } = await pool.query(
      `INSERT INTO store_promotions
         (store_id, code, headline, subtext, discount_type, discount_value,
          min_order_cents, max_uses, max_uses_per_email, active, starts_at,
          expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, code, headline, subtext, discount_type, discount_value,
                 min_order_cents, max_uses, max_uses_per_email, times_used,
                 active, starts_at, expires_at`,
      [storeId, code, ...cols, actorEmail ?? null],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new BackofficeError(409, `Code "${code}" already exists for this store`);
    throw err;
  }
}

export async function deletePromotion(storeId, promotionId) {
  const id = asInt(promotionId, 'promotion id');
  // Redemptions cascade with the promo. That loses the audit trail, so a
  // code that has been used is deactivated instead of deleted.
  const { rows } = await pool.query(
    `SELECT times_used FROM store_promotions WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  if (!rows[0]) throw new BackofficeError(404, 'Promotion not found');

  if (rows[0].times_used > 0) {
    await pool.query(
      `UPDATE store_promotions SET active = FALSE, updated_at = NOW()
        WHERE id = $1 AND store_id = $2`,
      [id, storeId],
    );
    return { deleted: false, deactivated: true };
  }

  await pool.query(`DELETE FROM store_promotions WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return { deleted: true };
}

/**
 * What a promo takes off a given subtotal, in cents. Pure, so the money
 * arithmetic is testable without a database.
 *
 * Capped at subtotal − 1: Stripe rejects a card session that totals zero,
 * and "100% off" codes are a real thing stores set up.
 */
export function discountCentsFor(promo, subtotalCents) {
  let amountOff = 0;
  if (promo.discount_type === 'percent') {
    amountOff = Math.round(subtotalCents * (Number(promo.discount_value) / 100));
  } else if (promo.discount_type === 'amount') {
    amountOff = Math.round(Number(promo.discount_value));
  }
  return Math.max(0, Math.min(amountOff, Math.max(0, subtotalCents - 1)));
}

/**
 * Price a store's shipping rules against one order. Pure — the DB-reading
 * buildShippingOptions below is a thin wrapper so this can be tested.
 */
export function priceShippingRules(rules, { subtotalCents = 0, itemCount = 1, freeShipping = false } = {}) {
  const priced = [];
  for (const rule of rules) {
    let cents;
    switch (rule.rule_type) {
      case 'flat':     cents = rule.amount_cents; break;
      case 'per_item': cents = rule.amount_cents * Math.max(1, itemCount); break;
      case 'pickup':   cents = 0; break;
      case 'free_over':
        // Below the threshold this rule still ships, it just isn't free —
        // dropping it entirely would leave a small order with no option at
        // all when free_over is the store's only rule.
        cents = subtotalCents >= (rule.threshold_cents ?? 0) ? 0 : rule.amount_cents;
        break;
      default: continue;
    }
    priced.push({ cents, label: rule.label });
  }
  if (!priced.length) return [];

  if (freeShipping) {
    const cheapest = priced.reduce((min, o) => (o.cents < min.cents ? o : min), priced[0]);
    if (cheapest.cents > 0) {
      cheapest.cents = 0;
      cheapest.label = `${cheapest.label} — free with your code`;
    }
  }
  return priced;
}

/**
 * Check a shopper-typed code against one store's promos.
 *
 * Returns { promotion_id, code, discount_type, amount_off_cents,
 *           free_shipping, headline } — amount_off_cents is already capped
 * at the subtotal, so the caller can hand it straight to Stripe.
 *
 * Throws BackofficeError(404/400) with a shopper-readable message. The
 * caller decides whether to surface it or just drop the code.
 */
export async function validatePromotion(storeId, rawCode, { subtotalCents = 0, buyerEmail = null } = {}) {
  const code = normalizeCode(rawCode);
  if (!code) throw bad('Enter a promo code');

  const { rows } = await pool.query(
    `SELECT id, code, headline, discount_type, discount_value, min_order_cents,
            max_uses, max_uses_per_email, times_used, active, starts_at, expires_at
       FROM store_promotions
      WHERE store_id = $1 AND lower(code) = lower($2)`,
    [storeId, code],
  );
  const promo = rows[0];
  // Same message for "no such code" and "switched off" — telling a shopper
  // a code exists but is disabled invites guessing at the next one.
  if (!promo || !promo.active) throw new BackofficeError(404, `"${code}" is not a valid code for this store`);

  const now = new Date();
  if (promo.starts_at && now < new Date(promo.starts_at)) {
    throw bad(`"${code}" is not active yet`);
  }
  if (promo.expires_at && now >= new Date(promo.expires_at)) {
    throw bad(`"${code}" has expired`);
  }
  if (promo.max_uses != null && promo.times_used >= promo.max_uses) {
    throw bad(`"${code}" has been fully redeemed`);
  }
  if (promo.min_order_cents > 0 && subtotalCents < promo.min_order_cents) {
    const dollars = (promo.min_order_cents / 100).toFixed(2);
    throw bad(`"${code}" needs an order of $${dollars} or more`);
  }
  if (promo.max_uses_per_email != null && buyerEmail) {
    const { rows: used } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM store_promotion_redemptions
        WHERE promotion_id = $1 AND lower(buyer_email) = lower($2)`,
      [promo.id, buyerEmail],
    );
    if (used[0].n >= promo.max_uses_per_email) {
      throw bad(`"${code}" has already been used on this email address`);
    }
  }

  const amountOff = discountCentsFor(promo, subtotalCents);

  return {
    promotion_id: promo.id,
    code: promo.code,
    headline: promo.headline,
    discount_type: promo.discount_type,
    amount_off_cents: amountOff,
    free_shipping: promo.discount_type === 'free_shipping',
  };
}

/**
 * Log a redemption and bump the counter. Takes an optional pg client so the
 * caller can run it inside the order-capture transaction — the counter and
 * the order must land together or max_uses drifts.
 */
export async function recordRedemption(
  { promotionId, storeOrderId = null, buyerEmail = null, amountOffCents = 0 },
  client = pool,
) {
  const id = asInt(promotionId, 'promotion id');
  await client.query(
    `INSERT INTO store_promotion_redemptions
       (promotion_id, store_order_id, buyer_email, amount_off_cents)
     VALUES ($1, $2, $3, $4)`,
    [id, storeOrderId, buyerEmail, Math.max(0, Math.round(amountOffCents))],
  );
  await client.query(
    `UPDATE store_promotions SET times_used = times_used + 1, updated_at = NOW()
      WHERE id = $1`,
    [id],
  );
}

// ── Shipping rules ───────────────────────────────────────────────────────
// What the SHOPPER is charged. TSB is merchant of record and buys the real
// label later through EasyPost, so these are the store's pricing policy,
// not carrier rates. A store with no rules keeps the weight-tier defaults.

const SHIPPING_TYPES = ['flat', 'per_item', 'free_over', 'pickup'];

export async function listShippingRules(storeId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, label, rule_type, amount_cents, threshold_cents, sort_order, active
       FROM store_shipping_rules
      WHERE store_id = $1 ${includeInactive ? '' : 'AND active'}
      ORDER BY sort_order, id`,
    [storeId],
  );
  return rows;
}

export async function upsertShippingRule(storeId, payload) {
  const label = String(payload?.label ?? '').trim();
  if (!label) throw bad('label is required');
  if (label.length > 120) throw bad('label must be 120 characters or fewer');

  const ruleType = String(payload?.rule_type ?? '').trim();
  if (!SHIPPING_TYPES.includes(ruleType)) {
    throw bad(`rule_type must be one of ${SHIPPING_TYPES.join(', ')}`);
  }

  // pickup is always free; a threshold only means something for free_over.
  const amountCents = ruleType === 'pickup'
    ? 0
    : asInt(payload?.amount_cents ?? 0, 'amount_cents', { min: 0 });
  let thresholdCents = null;
  if (ruleType === 'free_over') {
    thresholdCents = asInt(payload?.threshold_cents, 'threshold_cents', { min: 1 });
  }

  const sortOrder = asInt(payload?.sort_order ?? 0, 'sort_order', { min: 0 });
  const active = payload?.active === undefined ? true : Boolean(payload.active);

  if (payload?.id) {
    const id = asInt(payload.id, 'id');
    const { rows } = await pool.query(
      `UPDATE store_shipping_rules
          SET label = $1, rule_type = $2, amount_cents = $3, threshold_cents = $4,
              sort_order = $5, active = $6, updated_at = NOW()
        WHERE id = $7 AND store_id = $8
        RETURNING id, label, rule_type, amount_cents, threshold_cents, sort_order, active`,
      [label, ruleType, amountCents, thresholdCents, sortOrder, active, id, storeId],
    );
    if (!rows[0]) throw new BackofficeError(404, 'Shipping rule not found');
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO store_shipping_rules
       (store_id, label, rule_type, amount_cents, threshold_cents, sort_order, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, label, rule_type, amount_cents, threshold_cents, sort_order, active`,
    [storeId, label, ruleType, amountCents, thresholdCents, sortOrder, active],
  );
  return rows[0];
}

export async function deleteShippingRule(storeId, ruleId) {
  const id = asInt(ruleId, 'shipping rule id');
  const { rowCount } = await pool.query(
    `DELETE FROM store_shipping_rules WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  if (!rowCount) throw new BackofficeError(404, 'Shipping rule not found');
  return { deleted: true };
}

/**
 * Turn a store's rules into Stripe shipping_options.
 *
 * Returns null when the store has configured none, which means "use the
 * weight-tier defaults" — the caller owns that fallback so a store that has
 * never opened this screen behaves exactly as it did before.
 *
 * `freeShipping` comes from a free_shipping promo and zeroes the cheapest
 * option only: a code that says "free shipping" should not also hand the
 * shopper free overnight air.
 */
export async function buildShippingOptions(
  storeId, { subtotalCents = 0, itemCount = 1, freeShipping = false } = {},
) {
  const rules = await listShippingRules(storeId);
  if (!rules.length) return null;

  const priced = priceShippingRules(rules, { subtotalCents, itemCount, freeShipping });
  if (!priced.length) return null;

  return priced.map((o) => ({
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: o.cents, currency: 'usd' },
      display_name: o.label.slice(0, 100),
    },
  }));
}

// ── Branding ─────────────────────────────────────────────────────────────
// The look of a store's shop: colour, logo, hero image, tagline, footer
// line. These live in stores.brand_json, which until now only a TSB staffer
// could write — so a store could edit its words but not its appearance.
//
// brand_json holds more than branding: `demo` marks a showroom store
// unsellable, and business stores keep `business_address` / `website_url`
// in there. An owner must not be able to set those, and must not wipe them
// by saving. So the write is an allowlisted MERGE, never a replace.

export const BRANDING_FIELDS = [
  'primary_color', 'logo_url', 'hero_url', 'tagline', 'footer_note',
];

// #rgb or #rrggbb. Anything else is rejected rather than coerced: a bad
// colour string lands in a style attribute on every page of the shop.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanImageUrl(value, field) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let url;
  try {
    url = new URL(s);
  } catch {
    throw bad(`${field} must be a full URL starting with https://`);
  }
  // http(s) only — a javascript: or data: URL here would be rendered into
  // an <img src> on a public page.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw bad(`${field} must be an http or https URL`);
  }
  if (s.length > 1000) throw bad(`${field} is too long`);
  return s;
}

function cleanText(value, field, max) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw bad(`${field} must be ${max} characters or fewer`);
  return s;
}

/**
 * Validate an owner's branding edit and return ONLY the keys they may set.
 * Pure — the merge against the stored brand_json happens in the route.
 *
 * Absent keys are left alone; an explicitly null/empty key clears that
 * field, which is how an owner removes a logo.
 */
export function sanitizeBranding(payload) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;

  if ('primary_color' in payload) {
    const raw = payload.primary_color;
    const s = String(raw ?? '').trim();
    if (!s) {
      out.primary_color = null;
    } else {
      if (!HEX_COLOR.test(s)) throw bad('primary_color must be a hex colour like #1f2a44');
      out.primary_color = s.toLowerCase();
    }
  }
  if ('logo_url' in payload)    out.logo_url    = cleanImageUrl(payload.logo_url, 'logo_url');
  if ('hero_url' in payload)    out.hero_url    = cleanImageUrl(payload.hero_url, 'hero_url');
  if ('tagline' in payload)     out.tagline     = cleanText(payload.tagline, 'tagline', 200);
  if ('footer_note' in payload) out.footer_note = cleanText(payload.footer_note, 'footer_note', 500);

  return out;
}

export async function getBranding(storeId) {
  const { rows } = await pool.query(
    `SELECT name, brand_json FROM stores WHERE id = $1`, [storeId],
  );
  if (!rows[0]) throw new BackofficeError(404, 'Store not found');
  const brand = rows[0].brand_json ?? {};
  return {
    name: rows[0].name,
    branding: Object.fromEntries(BRANDING_FIELDS.map((f) => [f, brand[f] ?? null])),
  };
}

/**
 * Merge an owner's branding edit into brand_json.
 *
 * jsonb || jsonb in one statement, so a concurrent staff edit to an
 * unrelated key can't be lost to a read-modify-write race. Keys set to null
 * are stripped rather than stored as JSON null, which keeps the storefront's
 * `brand.logo_url || fallback` checks working.
 */
export async function updateBranding(storeId, payload) {
  const patch = sanitizeBranding(payload);
  if (!Object.keys(patch).length) throw bad('No branding fields supplied');

  const toSet = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null));
  const toClear = Object.keys(patch).filter((k) => patch[k] === null);

  const { rows } = await pool.query(
    `UPDATE stores
        SET brand_json = (COALESCE(brand_json, '{}'::jsonb) || $2::jsonb) - $3::text[]
      WHERE id = $1
      RETURNING brand_json`,
    [storeId, JSON.stringify(toSet), toClear],
  );
  if (!rows[0]) throw new BackofficeError(404, 'Store not found');

  const brand = rows[0].brand_json ?? {};
  return Object.fromEntries(BRANDING_FIELDS.map((f) => [f, brand[f] ?? null]));
}
