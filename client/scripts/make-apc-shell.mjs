// Generate dist/index-apc.html — the HTML shell the allprintclub.com nginx
// vhost serves instead of dist/index.html. Same hashed assets and inlined
// CSS as the TSB shell (it's a transform of the built file, so it can never
// drift from the bundle), but with All Print Club title/meta/structured
// data, an APC favicon, and WITHOUT TSB's analytics tags (GA, Clarity,
// Umami are all TSB properties; give APC its own IDs before adding
// analytics here). Mirrors make-cgc-shell.mjs.
//
// Runs right after `vite build`, BEFORE prerender (which may rewrite
// dist/index.html for the TSB homepage).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distIndex = fileURLToPath(new URL('../dist/index.html', import.meta.url));
let html = readFileSync(distIndex, 'utf8');

const failures = [];
function swap(label, pattern, replacement, { required = true } = {}) {
  const next = html.replace(pattern, replacement);
  if (next === html && required) failures.push(label);
  html = next;
}

// ── Strip TSB analytics (their GA property / Clarity project / Umami id) ─
swap('google-analytics',
  /\s*<!-- Google Analytics -->[\s\S]*?<\/script>\s*<script>[\s\S]*?gtag\('config'[\s\S]*?<\/script>/, '');
swap('clarity',
  /\s*<!-- Microsoft Clarity[\s\S]*?<\/script>/, '');
swap('umami',
  /\s*<!-- Umami[\s\S]*?<script defer src="\/stats-script\.js"[^>]*><\/script>/, '');

// ── Favicon ──────────────────────────────────────────────────────────────
swap('favicon',
  /<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>/,
  '<link rel="icon" type="image/svg+xml" href="/apc-icon.svg" />\n    <link rel="apple-touch-icon" href="/apc-icon.svg" />');

// ── Core SEO tags ────────────────────────────────────────────────────────
const TITLE = 'All Print Club | Business Cards, Flyers, Signs & More';
const DESC = 'Trade-quality commercial printing at club prices. Business cards, '
  + 'flyers, postcards, banners, stickers and more — printed fast and shipped nationwide by All Print Club.';

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('description', /<meta name="description" content="[^"]*" \/>/,
  `<meta name="description" content="${DESC}" />`);
swap('keywords', /<meta name="keywords" content="[^"]*" \/>/,
  '<meta name="keywords" content="business cards, flyers, postcards, banners, yard signs, stickers, commercial printing, cheap printing, print shop, Fairburn GA" />');
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="All Print Club" />');
swap('canonical', /<link rel="canonical" href="[^"]*" \/>/,
  '<link rel="canonical" href="https://allprintclub.com" />');

// ── Open Graph / Twitter ─────────────────────────────────────────────────
swap('og:title', /<meta property="og:title" content="[^"]*" \/>/,
  `<meta property="og:title" content="${TITLE}" />`);
swap('og:description', /<meta property="og:description" content="[^"]*" \/>/,
  `<meta property="og:description" content="${DESC}" />`);
swap('og:image', /<meta property="og:image" content="[^"]*" \/>/,
  '<meta property="og:image" content="https://allprintclub.com/apc-icon.svg" />');
swap('og:url', /<meta property="og:url" content="[^"]*" \/>/,
  '<meta property="og:url" content="https://allprintclub.com" />');
swap('og:site_name', /<meta property="og:site_name" content="[^"]*" \/>/,
  '<meta property="og:site_name" content="All Print Club" />');
swap('twitter:title', /<meta name="twitter:title" content="[^"]*" \/>/,
  `<meta name="twitter:title" content="${TITLE}" />`);
swap('twitter:description', /<meta name="twitter:description" content="[^"]*" \/>/,
  `<meta name="twitter:description" content="${DESC}" />`);
swap('twitter:image', /<meta name="twitter:image" content="[^"]*" \/>/,
  '<meta name="twitter:image" content="https://allprintclub.com/apc-icon.svg" />');

// ── Structured data: replace TSB's LocalBusiness with an APC Store ───────
const apcSchema = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'All Print Club',
  url: 'https://allprintclub.com',
  description: DESC,
  telephone: '+14706221392',
  email: 'info@tshirtbrothers.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '6010 Renaissance Parkway',
    addressLocality: 'Fairburn',
    addressRegion: 'GA',
    postalCode: '30213',
    addressCountry: 'US',
  },
  parentOrganization: { '@type': 'Organization', name: 'T-Shirt Brothers', url: 'https://tshirtbrothers.com' },
};
swap('json-ld',
  /<!-- Local Business Schema -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  `<script type="application/ld+json">\n    ${JSON.stringify(apcSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB h1.)
swap('noscript',
  /<noscript>\s*<h1>TShirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <h1>All Print Club — Business Cards, Flyers, Signs &amp; More</h1>
      <p>Trade-quality commercial printing at club prices. Business cards, flyers, postcards, banners, yard signs, and stickers, shipped nationwide.</p>
      <p>A sister company of T-Shirt Brothers.</p>
      <p>Contact: (470) 622-1392 | info@tshirtbrothers.com | 6010 Renaissance Parkway, Fairburn, GA 30213</p>
    </noscript>`);

if (failures.length) {
  console.error(`[apc-shell] FAILED — markers not found in dist/index.html: ${failures.join(', ')}`);
  console.error('[apc-shell] index.html head has drifted; update scripts/make-apc-shell.mjs to match.');
  process.exit(1);
}

writeFileSync(fileURLToPath(new URL('../dist/index-apc.html', import.meta.url)), html);
console.log('[apc-shell] wrote dist/index-apc.html');
