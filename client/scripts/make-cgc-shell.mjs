// Generate dist/index-cgc.html — the HTML shell the customgiftclub.com
// nginx vhost serves instead of dist/index.html. Same hashed assets and
// inlined CSS as the TSB shell (it's a transform of the built file, so it
// can never drift from the bundle), but with Custom Gift Club title/meta/
// structured data, a CGC favicon, and WITHOUT TSB's analytics tags (GA,
// Clarity, Umami are all TSB properties; give CGC its own IDs before
// adding analytics here).
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

// ── Favicon: the gift-mark crop of Doc's supplied logo ───────────────────
swap('favicon',
  /<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>/,
  '<link rel="icon" type="image/png" href="/cgc-icon.png" />\n    <link rel="apple-touch-icon" href="/cgc-icon.png" />');

// ── Core SEO tags ────────────────────────────────────────────────────────
const TITLE = 'Custom Gift Club | Personalized Gifts, Drinkware, Awards & More';
const DESC = 'Turn names, memories, and milestones into gifts worth keeping. '
  + 'Personalized drinkware, awards, leatherette, and more — engraved and shipped by Custom Gift Club.';

const IMAGE = 'https://res.cloudinary.com/business-products/image/upload/q_auto/v1669757586/products/images/large/LTM952--2228b537.png';

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="Custom Gift Club" />');

// Brand description, canonical, Open Graph and Twitter tags. Injected
// (see inject() above) because index.html no longer carries TSB copies
// of these to overwrite.
inject('brand-seo', `    <meta name="description" content="${DESC}" />
    <link rel="canonical" href="https://customgiftclub.com" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESC}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:url" content="https://customgiftclub.com" />
    <meta property="og:site_name" content="Custom Gift Club" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESC}" />
    <meta name="twitter:image" content="${IMAGE}" />`);

// ── Structured data: replace TSB's LocalBusiness with a CGC Store ────────
const cgcSchema = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'Custom Gift Club',
  url: 'https://customgiftclub.com',
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
// Matches the TSB structured-data block and its preceding comment.
// TSB now emits an @graph of Organization + WebSite + LocalBusiness, so
// the old '<!-- Local Business Schema -->' marker is gone; anchor on the
// ld+json script itself (it is the only one in the shell).
swap('json-ld',
  /(?:<!--[^>]*?Structured data[\s\S]*?-->\s*)?<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  `<script type="application/ld+json">\n    ${JSON.stringify(cgcSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB branding line.)
// No <h1> here: this block is inlined into the shell, so a heading
// would compete with each page's real <h1>. Mirrors the TSB fix.
swap('noscript',
  /<noscript>\s*<p><strong>T-Shirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <p><strong>Custom Gift Club — Personalized Gifts, Drinkware, Awards &amp; More</strong></p>
      <p>Turn names, memories, and milestones into gifts worth keeping. Personalized drinkware, awards and trophies, leatherette, hats and patches, blanks and supplies.</p>
      <p>A sister company of T-Shirt Brothers.</p>
      <p>Contact: (470) 622-1392 | info@tshirtbrothers.com | 6010 Renaissance Parkway, Fairburn, GA 30213</p>
    </noscript>`);

if (failures.length) {
  console.error(`[cgc-shell] FAILED — markers not found in dist/index.html: ${failures.join(', ')}`);
  console.error('[cgc-shell] index.html head has drifted; update scripts/make-cgc-shell.mjs to match.');
  process.exit(1);
}

writeFileSync(fileURLToPath(new URL('../dist/index-cgc.html', import.meta.url)), html);
console.log('[cgc-shell] wrote dist/index-cgc.html');
