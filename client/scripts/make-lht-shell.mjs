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

// Insert markup immediately after </title> in the head.
//
// Why this exists: index.html used to hard-code TSB's canonical,
// description and og:/twitter: tags, and this script swapped each one
// for the brand's version. Those static tags were removed from
// index.html on 2026-10-23 — every TSB page renders <Seo> (Helmet),
// so the shell copies were duplicating them (two canonicals, two
// descriptions, two of every OG tag on all 68 prerendered pages).
//
// The sister-brand shells still need them STATICALLY, though: unlike
// the TSB routes, dist/index-lht.html is not prerendered, and the
// Facebook/X/iMessage scrapers that build link previews do not run
// JavaScript — they would see no OG tags at all. So we inject rather
// than swap.
function inject(label, markup) {
  const marker = '</title>';
  if (!html.includes(marker)) { failures.push(label); return; }
  html = html.replace(marker, `${marker}\n${markup}`);
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

const IMAGE = 'https://livehardtruth.com/lht/campaign.jpg';

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="Live Hard Truth" />');

// Brand description, canonical, Open Graph and Twitter tags. Injected
// (see inject() above) because index.html no longer carries TSB copies
// of these to overwrite.
inject('brand-seo', `    <meta name="description" content="${DESC}" />
    <link rel="canonical" href="https://livehardtruth.com" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESC}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:url" content="https://livehardtruth.com" />
    <meta property="og:site_name" content="Live Hard Truth" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESC}" />
    <meta name="twitter:image" content="${IMAGE}" />`);

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
// Matches the TSB structured-data block and its preceding comment. TSB
// now emits an @graph of Organization + WebSite + LocalBusiness, so the
// old '<!-- Local Business Schema -->' marker is gone; anchor on the
// ld+json script itself (it is the only one in the shell).
swap('json-ld',
  /(?:<!--[^>]*?Structured data[\s\S]*?-->\s*)?<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  `<script type="application/ld+json">\n    ${JSON.stringify(lhtSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB branding line.)
// No <h1> here: this block is inlined into the shell, so a heading
// would compete with each page's real <h1>. Mirrors the TSB fix.
swap('noscript',
  /<noscript>\s*<p><strong>T-Shirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <p><strong>Live Hard Truth — Streetwear Worn Loud</strong></p>
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
