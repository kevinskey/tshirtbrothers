// Server-rendered Open Graph tags for public store pages.
//
// Store pages (/stores/:slug) are a client-rendered SPA, so link-preview
// crawlers (iMessage, Facebook, Slack, WhatsApp, …) that don't run JavaScript
// only ever saw the generic TShirt Brothers OG tags baked into index.html —
// every store link previewed as "Custom T-Shirt Printing - No Minimums".
//
// nginx proxies /stores/ document requests to this handler. It reads the built
// index.html and rewrites the <title> + OG/Twitter meta with the store's own
// name, description, and image before serving. Real browsers get the same HTML
// and the SPA boots normally over it; only the <head> differs.
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/lib/storeOg.js → ../../client/dist/index.html (nginx's docroot).
const INDEX_HTML = join(__dirname, '..', '..', 'client', 'dist', 'index.html');

const DEFAULT_IMAGE =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rewrite the content="" of a single meta tag identified by its
// property="…" or name="…" key. Leaves the html untouched if the tag isn't
// present, so a change to index.html can't throw here.
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(re, `$1${esc(value)}$2`);
}

export async function storeOgHandler(req, res, next) {
  try {
    const slug = String(req.params.slug || '');
    let html = await readFile(INDEX_HTML, 'utf8');

    const { rows } = await pool.query(
      `SELECT id, name, brand_json FROM stores WHERE slug = $1 AND status = 'active'`,
      [slug],
    );
    const store = rows[0];

    // Unknown/inactive store: serve the SPA unchanged — it renders its own 404.
    if (store) {
      const brand = store.brand_json || {};
      const name = store.name || 'TShirt Brothers Store';
      const description =
        (typeof brand.description === 'string' && brand.description.trim()) ||
        (typeof brand.tagline === 'string' && brand.tagline.trim()) ||
        `Official merchandise for ${name}. Designed and screenprinted by TShirt Brothers in Fairburn, GA.`;

      // Prefer the store's own hero/logo; otherwise the newest live product's
      // mockup (matches what the storefront shows), then the TSB default.
      let image = brand.hero_url || brand.logo_url || null;
      if (!image) {
        const { rows: pr } = await pool.query(
          `SELECT cover_image
             FROM store_products
            WHERE store_id = $1 AND is_active = true
              AND (opens_at IS NULL OR opens_at <= NOW())
              AND (closes_at IS NULL OR closes_at > NOW())
              AND cover_image IS NOT NULL
            ORDER BY published_at DESC
            LIMIT 1`,
          [store.id],
        );
        image = pr[0]?.cover_image || DEFAULT_IMAGE;
      }

      const url = `https://tshirtbrothers.com/stores/${slug}`;
      const title = `${name} · TShirt Brothers`;

      html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
      html = setMeta(html, 'name', 'description', description);
      html = setMeta(html, 'property', 'og:title', name);
      html = setMeta(html, 'property', 'og:description', description);
      html = setMeta(html, 'property', 'og:image', image);
      html = setMeta(html, 'property', 'og:url', url);
      html = setMeta(html, 'name', 'twitter:title', name);
      html = setMeta(html, 'name', 'twitter:description', description);
      html = setMeta(html, 'name', 'twitter:image', image);
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    // Short cache: store brand/products change rarely, but a fresh product or
    // renamed store should surface in previews within a few minutes.
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (err) {
    next(err);
  }
}
