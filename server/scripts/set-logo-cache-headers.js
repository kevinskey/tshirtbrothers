// One-shot: re-PUT the existing tsb-logo.png to Spaces with a long
// Cache-Control header so the DigitalOcean CDN edge caches it for a
// year. The original upload had no Cache-Control set (Lighthouse cache
// audit flagged it as "None"), which meant every repeat visit was
// pulling the 29 KiB logo from origin again.
//
// We also up-PUT the existing OG-image-sized asset on the same key so
// open-graph scrapers and the existing favicons keep working without
// any URL change. The bytes are identical — only the metadata moves.

import { uploadObject } from '../services/spaces.js';

const SOURCE_URL = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tsb-logo.png';
const KEY = 'tsb-logo.png';

async function main() {
  console.log('[logo] fetching');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[logo] ${(buf.length / 1024).toFixed(1)} KiB`);

  await uploadObject({
    key: KEY,
    body: buf,
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  console.log(`[logo] re-uploaded ${KEY} with Cache-Control: public, max-age=31536000, immutable`);
}

main().catch((err) => {
  console.error('[logo] failed:', err);
  process.exit(1);
});
