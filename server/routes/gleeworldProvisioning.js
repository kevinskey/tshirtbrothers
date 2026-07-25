// GleeWorld → TSB provisioning API.
//
// GleeWorld calls this from a Supabase edge function when a tenant admin
// clicks "Enable Fundraising Store" in Workspace Settings. Auth is the
// shared service key; endpoints never surface to browsers.
//
// The endpoint is idempotent: if a store already exists for the given
// slug it's returned as-is instead of erroring. This makes retries safe
// (network hiccup on GleeWorld side, edge-function timeout, etc.) and
// lets a tenant that manually stood up a store on the TSB side "adopt"
// it later without conflict.

import { Router } from 'express';
import pool from '../db.js';
import { gleeworldServiceKey } from '../middleware/gleeworldService.js';

const router = Router();
router.use(gleeworldServiceKey);

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://tshirtbrothers.com';

function storefrontUrl(store) {
  if (store.subdomain) return `https://${store.subdomain}.tshirtbrothers.com`;
  return `${PUBLIC_ORIGIN}/stores/${store.slug}`;
}

function adminUrl(store) {
  const base = store.subdomain
    ? `https://${store.subdomain}.tshirtbrothers.com`
    : `${PUBLIC_ORIGIN}/stores/${store.slug}`;
  return `${base}/admin`;
}

// ── POST /api/gleeworld/provision-store ──────────────────────────────────
// Body:
//   {
//     slug,                 // required — will be BOTH the TSB store slug
//                           //   AND the value written to
//                           //   stores.gleeworld_tenant_slug
//     name,                 // required — display name
//     owner_email,          // required — main contact for the store
//     subdomain?,           // optional — pretty subdomain (2–63 chars)
//     brand_json?,          // optional — { logo_url, primary_color, ... }
//     is_fundraiser?,       // optional bool
//     fundraiser_json?,     // optional — { contribution_type, contribution_value, ... }
//     initial_admin_email?, // optional — first store_admin (owner role)
//     initial_admin_name?,  // optional
//   }
//
// Response 200 (existing) or 201 (created):
//   {
//     id, slug, subdomain, name, is_fundraiser, status,
//     gleeworld_tenant_slug, created_at,
//     storefront_url, admin_url,
//     created: boolean
//   }
router.post('/provision-store', async (req, res, next) => {
  try {
    const {
      slug, name, owner_email, subdomain,
      brand_json, is_fundraiser, fundraiser_json,
      initial_admin_email, initial_admin_name,
    } = req.body ?? {};

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'slug (string) is required' });
    }
    if (!/^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) {
      return res.status(400).json({ error: 'slug must be 2–80 lowercase letters/digits/hyphens' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name (string) is required' });
    }
    if (!owner_email || typeof owner_email !== 'string') {
      return res.status(400).json({ error: 'owner_email (string) is required' });
    }
    if (subdomain && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      return res.status(400).json({ error: 'subdomain must be 2–63 lowercase letters/digits/hyphens' });
    }

    // Idempotency: if a row already exists for this slug, return it.
    // A slug collision with a franchise/non-group store IS an error —
    // we don't want to convert someone else's store to a group store
    // just because GleeWorld happened to pick a matching slug.
    const existing = await pool.query(
      `SELECT id, slug, subdomain, name, store_type, is_fundraiser, status,
              gleeworld_tenant_slug, created_at
         FROM stores WHERE slug = $1`,
      [slug],
    );
    if (existing.rows[0]) {
      const store = existing.rows[0];
      if (store.store_type !== 'group') {
        return res.status(409).json({
          error: `slug "${slug}" already used by a non-group store`,
        });
      }
      return res.status(200).json({
        ...store,
        storefront_url: storefrontUrl(store),
        admin_url: adminUrl(store),
        created: false,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storeIns = await client.query(
        `INSERT INTO stores
           (slug, name, owner_email, store_type, status, brand_json,
            fulfillment_mode, pickup_location_json,
            is_fundraiser, fundraiser_json,
            subdomain, gleeworld_tenant_slug)
         VALUES ($1, $2, $3, 'group', 'active', $4,
                 'ship_only', '{}'::jsonb,
                 $5, $6,
                 $7, $8)
         RETURNING id, slug, subdomain, name, store_type, is_fundraiser,
                   status, gleeworld_tenant_slug, created_at`,
        [
          slug, name, owner_email,
          brand_json ?? {},
          !!is_fundraiser,
          fundraiser_json ?? {},
          subdomain ? subdomain.toLowerCase() : null,
          slug, // gleeworld_tenant_slug === TSB slug by convention
        ],
      );
      const store = storeIns.rows[0];

      // Every group store needs a default agreement so publishing
      // products doesn't blow up on the NOT NULL active_agreement_id.
      const feeConfig = is_fundraiser && fundraiser_json?.contribution_type
        ? {
            contribution_type: fundraiser_json.contribution_type,
            contribution_value: fundraiser_json.contribution_value,
          }
        : { contribution_type: 'percent', contribution_value: 0 };

      await client.query(
        `INSERT INTO store_agreements
           (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
         VALUES ($1, 'store', $2, $3, $4)`,
        [
          store.id,
          feeConfig,
          { cadence: 'per_campaign_close', method: 'ach' },
          owner_email,
        ],
      );

      // Seed the initial owner admin. Defaults to the owner_email if
      // no explicit initial_admin_email is provided — GleeWorld usually
      // sends the tenant super-admin as both.
      const adminEmail = initial_admin_email || owner_email;
      await client.query(
        `INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
         VALUES ($1, $2, $3, 'owner', $4)
         ON CONFLICT (store_id, email) DO NOTHING`,
        [store.id, adminEmail, initial_admin_name ?? null, owner_email],
      );

      await client.query('COMMIT');
      res.status(201).json({
        ...store,
        storefront_url: storefrontUrl(store),
        admin_url: adminUrl(store),
        created: true,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        // Race with a concurrent request — re-select and return
        // whatever landed.
        const raced = await pool.query(
          `SELECT id, slug, subdomain, name, store_type, is_fundraiser,
                  status, gleeworld_tenant_slug, created_at
             FROM stores WHERE slug = $1`,
          [slug],
        );
        if (raced.rows[0]) {
          return res.status(200).json({
            ...raced.rows[0],
            storefront_url: storefrontUrl(raced.rows[0]),
            admin_url: adminUrl(raced.rows[0]),
            created: false,
          });
        }
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ── GET /api/gleeworld/stores/:slug ──────────────────────────────────────
// Convenience read for GleeWorld to check whether a tenant has a store
// and what its current status/URLs are. Same shape as provision-store.
router.get('/stores/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, subdomain, name, store_type, is_fundraiser,
              status, gleeworld_tenant_slug, created_at
         FROM stores WHERE slug = $1`,
      [req.params.slug],
    );
    const store = rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (store.store_type !== 'group') {
      return res.status(404).json({ error: 'Store is not a group store' });
    }
    res.json({
      ...store,
      storefront_url: storefrontUrl(store),
      admin_url: adminUrl(store),
    });
  } catch (err) { next(err); }
});

// ── GET /api/gleeworld/stores/:slug/design-drafts ────────────────────────
// Lists design drafts for a store (all statuses). Used by the GleeWorld
// Fundraising card to show tenants what they've submitted + what TSB
// has done with it.
router.get('/stores/:slug/design-drafts', async (req, res, next) => {
  try {
    const storeRow = await pool.query(
      `SELECT id FROM stores WHERE slug = $1 AND store_type = 'group'`,
      [req.params.slug],
    );
    if (!storeRow.rows[0]) return res.status(404).json({ error: 'Store not found' });
    const { rows } = await pool.query(
      `SELECT id, name, image_url, notes, status, review_notes,
              reviewed_at, reviewed_by_email, approved_product_id,
              submitted_by_email, created_at, updated_at
         FROM store_design_drafts
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [storeRow.rows[0].id],
    );
    res.json({ drafts: rows });
  } catch (err) { next(err); }
});

export default router;
