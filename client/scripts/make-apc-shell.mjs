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
// the TSB routes, this shell is not prerendered, and the Facebook/X/
// iMessage scrapers that build link previews do not run JavaScript —
// they would see no OG tags at all. So we inject rather than swap.
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
  '<link rel="icon" type="image/svg+xml" href="/apc-icon.svg" />\n    <link rel="apple-touch-icon" href="/apc-icon.svg" />');

// ── Core SEO tags ────────────────────────────────────────────────────────
const TITLE = 'All Print Club | Business Cards, Flyers, Signs & More';
const DESC = 'Trade-quality commercial printing at club prices. Business cards, '
  + 'flyers, postcards, banners, stickers and more — printed fast and shipped nationwide by All Print Club.';

const IMAGE = 'https://allprintclub.com/apc-icon.svg';

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="All Print Club" />');

// Brand description, canonical, Open Graph and Twitter tags. Injected
// (see inject() above) because index.html no longer carries TSB copies
// of these to overwrite.
inject('brand-seo', `    <meta name="description" content="${DESC}" />
    <link rel="canonical" href="https://allprintclub.com" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESC}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:url" content="https://allprintclub.com" />
    <meta property="og:site_name" content="All Print Club" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESC}" />
    <meta name="twitter:image" content="${IMAGE}" />`);

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
  parentOrganization: { '@type': 'Organization', name: 'TShirt Brothers', url: 'https://tshirtbrothers.com' },
};
// Matches the TSB structured-data block and its preceding comment.
// TSB now emits an @graph of Organization + WebSite + LocalBusiness, so
// the old '<!-- Local Business Schema -->' marker is gone; anchor on the
// ld+json script itself (it is the only one in the shell).
swap('json-ld',
  /(?:<!--[^>]*?Structured data[\s\S]*?-->\s*)?<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  `<script type="application/ld+json">\n    ${JSON.stringify(apcSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB branding line.)
// No <h1> here: this block is inlined into the shell, so a heading
// would compete with each page's real <h1>. Mirrors the TSB fix.
swap('noscript',
  /<noscript>\s*<p><strong>TShirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <p><strong>All Print Club — Business Cards, Flyers, Signs &amp; More</strong></p>
      <p>Trade-quality commercial printing at club prices. Business cards, flyers, postcards, banners, yard signs, and stickers, shipped nationwide.</p>
      <p>A sister company of TShirt Brothers.</p>
      <p>Contact: (470) 622-1392 | info@tshirtbrothers.com | 6010 Renaissance Parkway, Fairburn, GA 30213</p>
    </noscript>`);

if (failures.length) {
  console.error(`[apc-shell] FAILED — markers not found in dist/index.html: ${failures.join(', ')}`);
  console.error('[apc-shell] index.html head has drifted; update scripts/make-apc-shell.mjs to match.');
  process.exit(1);
}

writeFileSync(fileURLToPath(new URL('../dist/index-apc.html', import.meta.url)), html);
console.log('[apc-shell] wrote dist/index-apc.html');
