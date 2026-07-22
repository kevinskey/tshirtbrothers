// Dynamic sitemap.xml. Single source of truth for every public URL the
// site exposes — static marketing pages, shop category filters, city +
// vertical landing pages, and the blog posts table. Replaces the
// previous hand-maintained client/public/sitemap.xml, which drifted
// (was missing /local-businesses and had no <lastmod> dates).
//
// Mounted at /api/sitemap.xml and proxied from /sitemap.xml in nginx
// so the canonical URL the search engines already know keeps working
// without a robots.txt change.

import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const DOMAIN = process.env.DOMAIN || 'https://tshirtbrothers.com';

// Static page list. <changefreq> and <priority> are advisory — Google
// largely ignores them now, but Bing and other crawlers still honor
// them. <lastmod> falls back to "today" because we genuinely don't
// know when a static page was last meaningfully changed.
const STATIC_PAGES = [
  { path: '/',                  priority: '1.0', changefreq: 'weekly',  isHomepage: true },
  { path: '/es',                priority: '0.9', changefreq: 'weekly',  isHomepage: true },
  { path: '/shop',              priority: '0.9', changefreq: 'daily'  },
  { path: '/services',          priority: '0.8', changefreq: 'monthly'},
  { path: '/about',             priority: '0.7', changefreq: 'monthly'},
  { path: '/faq',               priority: '0.7', changefreq: 'monthly'},
  { path: '/design',            priority: '0.8', changefreq: 'weekly' },
  { path: '/quote',             priority: '0.8', changefreq: 'monthly'},
  { path: '/blog',              priority: '0.8', changefreq: 'weekly' },
  { path: '/brands',            priority: '0.7', changefreq: 'weekly' },
  { path: '/local-businesses',  priority: '0.7', changefreq: 'monthly'},
];

const SHOP_CATEGORIES = ['T-Shirts', 'Fleece', 'Headwear', 'Polos', 'Outerwear'];

// Mirror of client/src/data/cityLandings.ts and verticalLandings.ts.
// Duplicated here on purpose: pulling those TS files into Node would
// pin the route generator to the client's TS toolchain. If a slug
// changes there, also change it here.
const CITY_SLUGS = [
  'atlanta', 'fairburn', 'tyrone', 'peachtree-city',
  'fayetteville', 'newnan', 'college-park', 'union-city',
];
const VERTICAL_SLUGS = [
  'churches', 'family-reunions', 'teams', 'schools',
  'businesses', 'greek-life', 'fundraisers', 'birthdays',
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({ loc, lastmod, changefreq, priority, alternates }) {
  const lines = [`  <url>`];
  lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  if (alternates) {
    for (const a of alternates) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${xmlEscape(a.href)}" />`);
    }
  }
  lines.push(`  </url>`);
  return lines.join('\n');
}

async function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);

  // Pull published blog posts with their last edit date for accurate
  // <lastmod>. Ordering doesn't matter for sitemap semantics but
  // keeping it deterministic helps when diffing the output by hand.
  const { rows: posts } = await pool.query(
    `SELECT slug, COALESCE(updated_at, published_at, created_at)::date AS lastmod
       FROM blog_posts
       WHERE status = 'published'
       ORDER BY slug`,
  );

  const entries = [];

  for (const page of STATIC_PAGES) {
    const loc = `${DOMAIN}${page.path}`;
    entries.push(urlEntry({
      loc,
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority,
      alternates: page.isHomepage ? [
        { hreflang: 'en',         href: `${DOMAIN}/` },
        { hreflang: 'es',         href: `${DOMAIN}/es` },
        { hreflang: 'x-default',  href: `${DOMAIN}/` },
      ] : null,
    }));
  }

  for (const category of SHOP_CATEGORIES) {
    entries.push(urlEntry({
      loc: `${DOMAIN}/shop?category=${encodeURIComponent(category)}`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    }));
  }

  for (const slug of VERTICAL_SLUGS) {
    entries.push(urlEntry({
      loc: `${DOMAIN}/shirts-for/${slug}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    }));
  }

  for (const slug of CITY_SLUGS) {
    entries.push(urlEntry({
      loc: `${DOMAIN}/custom-shirts/${slug}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    }));
  }

  for (const post of posts) {
    entries.push(urlEntry({
      loc: `${DOMAIN}/blog/${post.slug}`,
      lastmod: post.lastmod instanceof Date
        ? post.lastmod.toISOString().slice(0, 10)
        : String(post.lastmod),
      changefreq: 'monthly',
      priority: '0.6',
    }));
  }

  // Group storefronts — every active group store gets its own URL so
  // the prerenderer bakes per-store Open Graph tags into static HTML.
  // Without this a link preview to /stores/<slug> shows the generic
  // TSB share card.
  try {
    const { rows: groupStores } = await pool.query(
      `SELECT slug, GREATEST(
                created_at,
                (SELECT MAX(created_at) FROM store_products sp WHERE sp.store_id = stores.id),
                (SELECT MAX(created_at) FROM store_orders   so WHERE so.store_id = stores.id)
              )::date AS lastmod
         FROM stores
        WHERE store_type = 'group' AND status = 'active'
        ORDER BY slug`,
    );
    // Directory page (only if we have at least one active store)
    if (groupStores.length > 0) {
      entries.push(urlEntry({
        loc: `${DOMAIN}/stores`,
        lastmod: today,
        changefreq: 'weekly',
        priority: '0.7',
      }));
    }
    for (const s of groupStores) {
      entries.push(urlEntry({
        loc: `${DOMAIN}/stores/${s.slug}`,
        lastmod: s.lastmod instanceof Date
          ? s.lastmod.toISOString().slice(0, 10)
          : String(s.lastmod ?? today),
        changefreq: 'weekly',
        priority: '0.8',
      }));
    }
  } catch (err) {
    console.error('[sitemap] group stores enumeration failed:', err.message);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
>
${entries.join('\n')}
</urlset>
`;
}

// In-memory cache so the DB lookup happens at most once per hour even
// if a crawler hammers the endpoint. Cheap to bust by restarting pm2
// (e.g. after publishing a new blog post if you don't want to wait).
let cached = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000;

router.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (!cached || now - cachedAt > CACHE_MS) {
      cached = await buildSitemap();
      cachedAt = now;
    }
    res
      .set('Content-Type', 'application/xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=3600')
      .send(cached);
  } catch (err) {
    next(err);
  }
});

export default router;
