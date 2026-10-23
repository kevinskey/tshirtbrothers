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
