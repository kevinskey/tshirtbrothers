// Generate dist/index-lht.html — the HTML shell the livehardtruth.com nginx
// vhost serves instead of dist/index.html. Same hashed assets and inlined
// CSS as the TSB shell (it's a transform of the built file, so it can never
// drift from the bundle), but with Live Hard Truth title/meta/structured
// data, the LHT favicon, and WITHOUT TSB's analytics tags (GA, Clarity,
// Umami are all TSB properties; give LHT its own IDs before adding
// analytics here). Mirrors make-cgc-shell.mjs / make-apc-shell.mjs.
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
  '<link rel="icon" type="image/png" href="/lht-icon.png" />\n    <link rel="apple-touch-icon" href="/lht-icon.png" />');

// ── Core SEO tags ────────────────────────────────────────────────────────
const TITLE = 'Live Hard Truth — Streetwear Worn Loud';
const DESC = 'Live Hard Truth luxury streetwear. Shop the Fall 2026 heavyweight '
  + 'hoodie and jogger collection in eleven colors, take the Truth Session, and wear the truth.';

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('description', /<meta name="description" content="[^"]*" \/>/,
  `<meta name="description" content="${DESC}" />`);
swap('keywords', /<meta name="keywords" content="[^"]*" \/>/,
  '<meta name="keywords" content="streetwear, hoodie and jogger set, heavyweight hoodie, matching sets, Live Hard Truth, truth session, motivational apparel" />');
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="Live Hard Truth" />');
swap('canonical', /<link rel="canonical" href="[^"]*" \/>/,
  '<link rel="canonical" href="https://livehardtruth.com" />');

// ── Open Graph / Twitter ─────────────────────────────────────────────────
swap('og:title', /<meta property="og:title" content="[^"]*" \/>/,
  `<meta property="og:title" content="${TITLE}" />`);
swap('og:description', /<meta property="og:description" content="[^"]*" \/>/,
  `<meta property="og:description" content="${DESC}" />`);
swap('og:image', /<meta property="og:image" content="[^"]*" \/>/,
  '<meta property="og:image" content="https://livehardtruth.com/lht/campaign.jpg" />');
swap('og:url', /<meta property="og:url" content="[^"]*" \/>/,
  '<meta property="og:url" content="https://livehardtruth.com" />');
swap('og:site_name', /<meta property="og:site_name" content="[^"]*" \/>/,
  '<meta property="og:site_name" content="Live Hard Truth" />');
swap('twitter:title', /<meta name="twitter:title" content="[^"]*" \/>/,
  `<meta name="twitter:title" content="${TITLE}" />`);
swap('twitter:description', /<meta name="twitter:description" content="[^"]*" \/>/,
  `<meta name="twitter:description" content="${DESC}" />`);
swap('twitter:image', /<meta name="twitter:image" content="[^"]*" \/>/,
  '<meta name="twitter:image" content="https://livehardtruth.com/lht/campaign.jpg" />');

// ── Structured data: replace TSB's LocalBusiness with an LHT Store ───────
const lhtSchema = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'Live Hard Truth',
  url: 'https://livehardtruth.com',
  description: DESC,
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
  `<script type="application/ld+json">\n    ${JSON.stringify(lhtSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB h1.)
swap('noscript',
  /<noscript>\s*<h1>TShirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <h1>Live Hard Truth — Streetwear Worn Loud</h1>
      <p>The Fall 2026 heavyweight hoodie and jogger collection in eleven colors, plus the Hard Truth hat, mug and journal.</p>
      <p>Fulfilled by T-Shirt Brothers, Fairburn, GA.</p>
      <p>Contact: info@tshirtbrothers.com | 6010 Renaissance Parkway, Fairburn, GA 30213</p>
    </noscript>`);

if (failures.length) {
  console.error(`[lht-shell] FAILED — markers not found in dist/index.html: ${failures.join(', ')}`);
  console.error('[lht-shell] index.html head has drifted; update scripts/make-lht-shell.mjs to match.');
  process.exit(1);
}

writeFileSync(fileURLToPath(new URL('../dist/index-lht.html', import.meta.url)), html);
console.log('[lht-shell] wrote dist/index-lht.html');
