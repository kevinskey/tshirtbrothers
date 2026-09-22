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

swap('title', /<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`);
swap('description', /<meta name="description" content="[^"]*" \/>/,
  `<meta name="description" content="${DESC}" />`);
swap('keywords', /<meta name="keywords" content="[^"]*" \/>/,
  '<meta name="keywords" content="personalized gifts, custom gifts, engraved tumblers, custom drinkware, awards, trophies, leatherette, corporate gifts, Fairburn GA" />');
swap('author', /<meta name="author" content="[^"]*" \/>/,
  '<meta name="author" content="Custom Gift Club" />');
swap('canonical', /<link rel="canonical" href="[^"]*" \/>/,
  '<link rel="canonical" href="https://customgiftclub.com" />');

// ── Open Graph / Twitter ─────────────────────────────────────────────────
swap('og:title', /<meta property="og:title" content="[^"]*" \/>/,
  `<meta property="og:title" content="${TITLE}" />`);
swap('og:description', /<meta property="og:description" content="[^"]*" \/>/,
  `<meta property="og:description" content="${DESC}" />`);
swap('og:image', /<meta property="og:image" content="[^"]*" \/>/,
  '<meta property="og:image" content="https://res.cloudinary.com/business-products/image/upload/q_auto/v1669757586/products/images/large/LTM952--2228b537.png" />');
swap('og:url', /<meta property="og:url" content="[^"]*" \/>/,
  '<meta property="og:url" content="https://customgiftclub.com" />');
swap('og:site_name', /<meta property="og:site_name" content="[^"]*" \/>/,
  '<meta property="og:site_name" content="Custom Gift Club" />');
swap('twitter:title', /<meta name="twitter:title" content="[^"]*" \/>/,
  `<meta name="twitter:title" content="${TITLE}" />`);
swap('twitter:description', /<meta name="twitter:description" content="[^"]*" \/>/,
  `<meta name="twitter:description" content="${DESC}" />`);
swap('twitter:image', /<meta name="twitter:image" content="[^"]*" \/>/,
  '<meta name="twitter:image" content="https://res.cloudinary.com/business-products/image/upload/q_auto/v1669757586/products/images/large/LTM952--2228b537.png" />');

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
swap('json-ld',
  /<!-- Local Business Schema -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  `<script type="application/ld+json">\n    ${JSON.stringify(cgcSchema, null, 2).replace(/\n/g, '\n    ')}\n    </script>`);

// ── Noscript SEO fallback in the body ────────────────────────────────────
// (index.html has TWO noscript blocks — the first is the font-loading
// fallback in <head>; match the SEO one by its TSB h1.)
swap('noscript',
  /<noscript>\s*<h1>TShirt Brothers[\s\S]*?<\/noscript>/,
  `<noscript>
      <h1>Custom Gift Club — Personalized Gifts, Drinkware, Awards &amp; More</h1>
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
