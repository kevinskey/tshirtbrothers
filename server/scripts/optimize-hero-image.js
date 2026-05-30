// One-shot: pull the current hero PNG, resize to 2× display width, encode
// WebP and AVIF, then upload both back to Spaces under a v3 prefix. Frees
// up ~2 MB on every homepage load by replacing a 2,188 KiB 1536×1024 PNG
// with ~80 KiB at the size the page actually renders.
//
// Run from server dir: `node scripts/optimize-hero-image.js`
//
// After it succeeds the file logs the canonical CDN URLs to use in
// HeroSection.tsx.

import sharp from 'sharp';
import { uploadObject } from '../services/spaces.js';

const SOURCE_URL =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/tshirt-ad.png';

async function main() {
  console.log('[hero] fetching source PNG');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const inputBuf = Buffer.from(await res.arrayBuffer());
  console.log(`[hero] source ${(inputBuf.length / 1024).toFixed(0)} KiB`);

  // Display is 721×481, so 2× = 1442×961. Round to 1440×960 for clean
  // numbers. Keep aspect ratio — sharp's `withoutEnlargement` keeps us
  // from upscaling small sources.
  const resized = sharp(inputBuf).resize(1440, 960, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const webpBuf = await resized.clone().webp({ quality: 82, effort: 6 }).toBuffer();
  const avifBuf = await resized.clone().avif({ quality: 60, effort: 6 }).toBuffer();
  console.log(`[hero] webp ${(webpBuf.length / 1024).toFixed(0)} KiB`);
  console.log(`[hero] avif ${(avifBuf.length / 1024).toFixed(0)} KiB`);

  const webpKey = 'hero-slides/v3/tshirt-ad.webp';
  const avifKey = 'hero-slides/v3/tshirt-ad.avif';

  await uploadObject({
    key: webpKey,
    body: webpBuf,
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  console.log(`[hero] uploaded ${webpKey}`);

  await uploadObject({
    key: avifKey,
    body: avifBuf,
    contentType: 'image/avif',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  console.log(`[hero] uploaded ${avifKey}`);

  console.log('\nUse these URLs in HeroSection.tsx:');
  console.log(`  webp: https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/${webpKey}`);
  console.log(`  avif: https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/${avifKey}`);
}

main().catch((err) => {
  console.error('[hero] failed:', err);
  process.exit(1);
});
