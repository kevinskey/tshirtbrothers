// Build-time prerender for SEO. Reads the list of public URLs from the
// production sitemap, spins up `vite preview` against the freshly-built
// dist/, drives Puppeteer through each URL, and writes the rendered
// HTML back into dist/<route>/index.html.
//
// Why: every route in the SPA was serving the same <div id="root">
// shell with the same generic <title>, so Google was deduplicating all
// 37 public URLs into one entry. After this script runs, every URL has
// its own real <title>, <meta description>, <h1>, and main content
// baked into static HTML.
//
// API requests during prerender are proxied to the live production
// API so blog posts and the hero carousel render with real data. No
// API key needed — the public endpoints are open.

import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLIENT_DIR = join(__dirname, '..');
const DIST = join(CLIENT_DIR, 'dist');

const SITEMAP_URL = 'https://tshirtbrothers.com/api/sitemap.xml';
const API_ORIGIN  = 'https://tshirtbrothers.com';

// Routes the SPA owns but we never want crawled or prerendered.
const SKIP_PREFIXES = [
  '/admin',
  '/auth',
  '/account',
  '/favorites',
  '/payment',
  '/mockup',
  '/invoice/view',
];

/**
 * Routes declared by the sitemap source in THIS checkout.
 *
 * Why this is needed on top of the production sitemap: the route list
 * came only from the DEPLOYED sitemap, so a brand-new page could never
 * be prerendered by the deploy that introduced it. The sequence is
 * pull → build (prerender fetches the OLD server's sitemap, which has
 * an hour-long cache) → restart. A new URL was therefore missing from
 * that response, got skipped, and shipped as a client-rendered-only
 * route until somebody happened to deploy again — exactly the pages
 * most in need of crawlable HTML, invisible for an unpredictable
 * window. Four new landing pages on 2026-10-23 would have hit this.
 *
 * Parsed by regex rather than imported: server/routes/sitemap.js pulls
 * in the DB pool at module load, which the client build has no business
 * doing. Best-effort — the production sitemap remains the primary
 * source, and this only ever ADDS routes.
 */
function localRoutes() {
  try {
    const src = readFileSync(join(CLIENT_DIR, '..', 'server', 'routes', 'sitemap.js'), 'utf8');
    const paths = new Set();

    const staticBlock = src.match(/const STATIC_PAGES = \[([\s\S]*?)\n\];/);
    if (staticBlock) {
      for (const m of staticBlock[1].matchAll(/path:\s*'([^']+)'/g)) paths.add(m[1]);
    }
    const listOf = (name) => {
      const block = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
      return block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    };
    for (const slug of listOf('VERTICAL_SLUGS')) paths.add(`/shirts-for/${slug}`);
    for (const slug of listOf('CITY_SLUGS')) paths.add(`/custom-shirts/${slug}`);

    return [...paths];
  } catch (err) {
    console.warn(`[prerender] could not read local sitemap routes: ${err.message}`);
    return [];
  }
}

async function fetchRoutes() {
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  const paths = new Set();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      const u = new URL(match[1]);
      let p = u.pathname;
      // Strip shop category querystrings — those filter the catalog and
      // don't need separate prerendered files.
      if (u.search) continue;
      // Skip routes that have no SEO value or are authenticated-only.
      if (SKIP_PREFIXES.some((pre) => p.startsWith(pre))) continue;
      paths.add(p);
    } catch { /* skip malformed */ }
  }

  // Union in routes this checkout knows about but the live sitemap
  // hasn't caught up to yet. Blog posts and group stores still come
  // only from production — they live in the DB, not in the source.
  const fromProd = paths.size;
  for (const p of localRoutes()) {
    if (SKIP_PREFIXES.some((pre) => p.startsWith(pre))) continue;
    paths.add(p);
  }
  const added = paths.size - fromProd;
  if (added > 0) {
    console.log(`[prerender] ${added} route(s) new in this checkout, not yet in the live sitemap`);
  }

  return [...paths].sort();
}

function pathToFile(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  return join(DIST, routePath.replace(/^\//, ''), 'index.html');
}

async function main() {
  const routes = await fetchRoutes();
  console.log(`[prerender] ${routes.length} routes to render`);

  // strictPort:false — anything already sitting on the preferred port (a
  // stray `vite preview`, a concurrent manual build) must not fail the
  // deploy; vite walks up to the next free port and reports it.
  const server = await preview({
    root: CLIENT_DIR,
    preview: { port: 4173, strictPort: false, host: '127.0.0.1' },
  });
  const addr = server.httpServer.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 4173}`;
  console.log(`[prerender] previewing at ${base}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // A route that fails to prerender still WORKS: the SPA renders it client
  // side, it just ships without server-rendered HTML for crawlers. So a slow
  // page must never abort the deploy — this script runs at the END of
  // `npm run build`, and deploy.sh chains the pm2 restart AFTER that, so
  // exiting 1 here left the droplet with a freshly rebuilt client and a
  // server still running the old code, with nothing saying so.
  //
  // That is 2026-08-21: /blog, one blog post and /brands hit the 30s
  // navigation timeout on the droplet (all 36 passed locally), the build
  // exited 1, and a payments change sat unloaded until someone restarted pm2
  // by hand.
  let okCount = 0;

  async function renderRoute(route, { timeout, waitUntil, settleMs }) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    // Proxy /api/* calls to production so data-dependent pages (blog
    // posts, homepage hero) render real content instead of loading
    // skeletons.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/') && url.startsWith(base)) {
        const upstream = url.replace(base, API_ORIGIN);
        fetch(upstream, {
          method: req.method(),
          headers: req.headers(),
          body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData(),
        })
          .then(async (r) => {
            const buf = Buffer.from(await r.arrayBuffer());
            req.respond({
              status: r.status,
              headers: Object.fromEntries(r.headers.entries()),
              body: buf,
            });
          })
          .catch(() => req.abort());
        return;
      }
      req.continue();
    });

    try {
      await page.goto(`${base}${route}`, { waitUntil, timeout });
      // Give React Helmet a tick to flush the title + meta after the
      // last data-dependent render.
      await new Promise((r) => setTimeout(r, settleMs));

      const html = await page.content();
      const outPath = pathToFile(route);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, html, 'utf8');
      console.log(`  \u2713 ${route}`);
      return true;
    } catch (err) {
      console.error(`  \u2717 ${route}: ${err.message}`);
      return false;
    } finally {
      await page.close();
    }
  }

  const failedFirstPass = [];
  for (const route of routes) {
    if (await renderRoute(route, { timeout: 30_000, waitUntil: 'networkidle0', settleMs: 250 })) okCount++;
    else failedFirstPass.push(route);
  }

  // Second pass for the stragglers. networkidle0 never settles on a page
  // holding a connection open (analytics beacons, a slow feed), and that is
  // what these timeouts actually are — not a broken page. domcontentloaded
  // plus a longer settle captures the meta tags and body copy that make
  // prerendering worth doing at all.
  const stillFailed = [];
  if (failedFirstPass.length > 0) {
    console.log(`[prerender] retrying ${failedFirstPass.length} route(s) with a longer timeout`);
    for (const route of failedFirstPass) {
      if (await renderRoute(route, { timeout: 60_000, waitUntil: 'domcontentloaded', settleMs: 1500 })) okCount++;
      else stillFailed.push(route);
    }
  }
  const failCount = stillFailed.length;

  await browser.close();
  await server.httpServer.close();

  console.log(`[prerender] done — ${okCount} ok, ${failCount} failed`);

  // Fail the build only when something is genuinely broken rather than slow:
  // nothing rendered at all, or more than a fifth of the site did not. A
  // handful of stragglers is a warning, not a reason to leave production
  // half-deployed.
  const tolerance = Math.max(3, Math.ceil(routes.length * 0.2));
  if (okCount === 0 || failCount > tolerance) {
    console.error(
      `[prerender] FAILING the build: ${failCount} of ${routes.length} routes could not be rendered `
      + `(tolerance ${tolerance}). This looks like a real breakage, not slow pages.`,
    );
    process.exit(1);
  }
  if (failCount > 0) {
    console.warn(
      `[prerender] WARNING: ${stillFailed.join(', ')} shipped without prerendered HTML. `
      + 'They still work as client-rendered routes; crawlers just see less. Not blocking the deploy.',
    );
  }
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
