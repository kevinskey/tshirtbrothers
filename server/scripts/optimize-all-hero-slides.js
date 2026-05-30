// Batch: read every hero_slides row pointing at the v2 PNG directory,
// download each PNG, resize+encode WebP and AVIF at v3, upload both with
// a 1-year immutable Cache-Control, and rewrite the DB row to point at
// the new WebP. AVIF lives alongside it so a future <picture> upgrade
// in HeroSection can prefer it.
//
// Run from server dir: `node scripts/optimize-all-hero-slides.js`
//
// Idempotent: rows already on v3 are skipped. Failures on one row don't
// stop the batch.

import sharp from 'sharp';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';

const V2_PREFIX = 'hero-slides/v2/';
const V3_PREFIX = 'hero-slides/v3/';
const CDN_BASE = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/';

async function processRow(row) {
  const { id, image_url, label } = row;
  if (!image_url.includes(V2_PREFIX) || !image_url.endsWith('.png')) {
    console.log(`[skip] #${id} ${label}: not a v2 PNG`);
    return;
  }
  const filename = image_url.split('/').pop().replace(/\.png$/, '');
  console.log(`\n[#${id} ${label}] fetching ${image_url}`);
  const res = await fetch(image_url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  source ${(buf.length / 1024).toFixed(0)} KiB`);

  const resized = sharp(buf).resize(1440, 960, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  const webpBuf = await resized.clone().webp({ quality: 82, effort: 6 }).toBuffer();
  const avifBuf = await resized.clone().avif({ quality: 60, effort: 6 }).toBuffer();
  console.log(`  webp ${(webpBuf.length / 1024).toFixed(0)} KiB · avif ${(avifBuf.length / 1024).toFixed(0)} KiB`);

  const webpKey = `${V3_PREFIX}${filename}.webp`;
  const avifKey = `${V3_PREFIX}${filename}.avif`;
  await uploadObject({
    key: webpKey,
    body: webpBuf,
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  await uploadObject({
    key: avifKey,
    body: avifBuf,
    contentType: 'image/avif',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const newUrl = `${CDN_BASE}${webpKey}`;
  await pool.query(
    'UPDATE hero_slides SET image_url = $1, updated_at = NOW() WHERE id = $2',
    [newUrl, id],
  );
  console.log(`  ✓ DB row updated → ${newUrl}`);
}

async function main() {
  const { rows } = await pool.query(
    "SELECT id, image_url, label FROM hero_slides WHERE image_url LIKE $1 ORDER BY id",
    [`%${V2_PREFIX}%`],
  );
  console.log(`[batch] ${rows.length} slide(s) to migrate from v2 → v3\n`);
  for (const row of rows) {
    try {
      await processRow(row);
    } catch (err) {
      console.error(`  ✗ #${row.id} failed:`, err.message || err);
    }
  }
  await pool.end();
  console.log('\n[batch] done');
}

main().catch((err) => {
  console.error('[batch] fatal:', err);
  process.exit(1);
});
