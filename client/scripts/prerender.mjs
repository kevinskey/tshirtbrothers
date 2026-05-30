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
  return [...paths].sort();
}

function pathToFile(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  return join(DIST, routePath.replace(/^\//, ''), 'index.html');
}

async function main() {
  const routes = await fetchRoutes();
  console.log(`[prerender] ${routes.length} routes to render`);

  const server = await preview({
    root: CLIENT_DIR,
    preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  });
  const base = `http://127.0.0.1:4173`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let okCount = 0;
  let failCount = 0;

  for (const route of routes) {
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
      await page.goto(`${base}${route}`, {
        waitUntil: 'networkidle0',
        timeout: 30_000,
      });
      // Give React Helmet a tick to flush the title + meta after the
      // last data-dependent render.
      await new Promise((r) => setTimeout(r, 250));

      const html = await page.content();
      const outPath = pathToFile(route);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, html, 'utf8');
      okCount++;
      console.log(`  ✓ ${route}`);
    } catch (err) {
      failCount++;
      console.error(`  ✗ ${route}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await server.httpServer.close();

  console.log(`[prerender] done — ${okCount} ok, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
