// Bulk-load the SanMar catalog from the SFTP product-data feed.
//
// This is the preferred way to populate sanmar_products. The SOAP path
// (scripts/sync-sanmar.js) needs one slow call per brand and returns fewer
// fields; the feed is the whole catalog (~435k SKUs) in a 17MB download and
// includes MSRP/MAP pricing, which SOAP does not return. Keep SOAP for live
// inventory (services/sanmar.js getInventory) and targeted style lookups.
//
// Usage:
//   node scripts/load-sanmar-feed.js            # download + load
//   node scripts/load-sanmar-feed.js --keep     # keep the download around
//   node scripts/load-sanmar-feed.js --file X   # load an already-downloaded csv
//
// Requirements, both of which are easy to get wrong:
//   * sshpass must be installed (apt-get install sshpass). SanMar only
//     offers password auth on the SFTP account.
//   * SanMar's server is ProFTPD mod_sftp 0.9.9 and offers ONLY the ssh-rsa
//     host key type, which OpenSSH 8.8+ disables by default. Without the
//     explicit HostKeyAlgorithms/PubkeyAcceptedAlgorithms below the
//     connection dies at key exchange with "no matching host key type".
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DECORATED_ONLY_BRANDS, EXCLUDED_BRANDS } from '../services/sanmar.js';

const REMOTE_PATH = 'SanMarPDD/SanMar_EPDD_csv.zip';
const CSV_NAME = 'SanMar_EPDD.csv';

// Style-level images arrive as bare filenames and resolve under this base
// (verified against live CDN responses). Note that SanMar answers 200 with a
// ~12KB "image not available" placeholder for unknown filenames rather than
// 404ing, so a 200 here is not proof an image exists.
const IMAGE_BASE = 'https://cdnm.sanmar.com/catalog/images/';

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }
}

function sqlList(values) {
  return [...values].map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

// psql invocation sharing the app's DB env. Password goes through the
// environment, never argv.
function psql(args, { input, inheritStdio = false } = {}) {
  const { DB_HOST, DB_PORT, DB_USER, DB_NAME, DB_PASSWORD } = process.env;
  const result = spawnSync(
    'psql',
    [
      '-h', DB_HOST,
      '-p', DB_PORT || '5432',
      '-U', DB_USER,
      '-d', DB_NAME,
      '-v', 'ON_ERROR_STOP=1',
      '--no-psqlrc',
      ...args,
    ],
    {
      env: { ...process.env, PGPASSWORD: DB_PASSWORD },
      input,
      encoding: 'utf8',
      stdio: inheritStdio ? 'inherit' : 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout || ''}`);
  }
  return (result.stdout || '').trim();
}

async function download(workDir) {
  requireEnv(
    'SANMAR_SFTP_HOST',
    'SANMAR_SFTP_PORT',
    'SANMAR_SFTP_USER',
    'SANMAR_SFTP_PASSWORD'
  );
  const { SANMAR_SFTP_HOST, SANMAR_SFTP_PORT, SANMAR_SFTP_USER } = process.env;

  console.log(`[sanmar-feed] downloading ${REMOTE_PATH}…`);
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn(
      'sshpass',
      [
        '-e',
        'sftp',
        '-P', SANMAR_SFTP_PORT,
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=30',
        '-o', 'HostKeyAlgorithms=+ssh-rsa',
        '-o', 'PubkeyAcceptedAlgorithms=+ssh-rsa',
        `${SANMAR_SFTP_USER}@${SANMAR_SFTP_HOST}`,
      ],
      {
        cwd: workDir,
        env: { ...process.env, SSHPASS: process.env.SANMAR_SFTP_PASSWORD },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.end(`get ${REMOTE_PATH}\nbye\n`);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`sftp exited ${code}: ${stderr.trim()}`))
    );
  });

  const zipPath = path.join(workDir, path.basename(REMOTE_PATH));
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(
    `[sanmar-feed] downloaded ${mb}MB in ${Math.round((Date.now() - started) / 1000)}s`
  );

  const unzip = spawnSync('unzip', ['-o', '-q', zipPath], { cwd: workDir, encoding: 'utf8' });
  if (unzip.status !== 0) {
    throw new Error(`unzip failed: ${unzip.stderr || unzip.stdout}`);
  }
  const csvPath = path.join(workDir, CSV_NAME);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`expected ${CSV_NAME} in the archive; got: ${fs.readdirSync(workDir)}`);
  }
  return csvPath;
}

// Bare filename -> absolute URL; pass through anything already absolute.
function imageUrl(column) {
  return `CASE
      WHEN NULLIF(btrim(s.${column}), '') IS NULL THEN NULL
      WHEN s.${column} LIKE 'http%' THEN btrim(s.${column})
      ELSE '${IMAGE_BASE}' || btrim(s.${column})
    END`;
}

// HTML-entity decoding and whitespace collapsing live in
// sanmar_decode_entities() (see migrations/sanmar_feed_v2.sql) -- the feed
// mixes named, numeric and Windows-1252 entity conventions, which is more
// than a replace() chain should own.
function decodeEntities(column) {
  return `sanmar_decode_entities(s.${column})`;
}

function buildUpsertSql() {
  const n = (col, type) => `NULLIF(btrim(s.${col}), '')::${type}`;
  const t = (col) => `NULLIF(btrim(s.${col}), '')`;

  return `
-- The feed lists a SKU once per category it belongs to, so collapse to one
-- row per unique_key first: ON CONFLICT cannot fire twice for the same key
-- in a single statement.
WITH eligible AS (
  SELECT *
  FROM sanmar_feed_staging
  WHERE NULLIF(btrim(unique_key), '') IS NOT NULL
    AND btrim(unique_key) ~ '^[0-9]+$'
    AND NULLIF(btrim(style), '') IS NOT NULL
    AND NULLIF(btrim(mill), '') IS NOT NULL
    AND btrim(mill) NOT IN (${sqlList(EXCLUDED_BRANDS)})
),
-- Keep every category a SKU appears under, not just the row we happen to
-- retain below.
taxonomy AS (
  SELECT
    btrim(unique_key) AS k,
    array_agg(DISTINCT btrim(category_name))
      FILTER (WHERE NULLIF(btrim(category_name), '') IS NOT NULL) AS categories,
    array_agg(DISTINCT btrim(subcategory_name))
      FILTER (WHERE NULLIF(btrim(subcategory_name), '') IS NOT NULL) AS subcategories
  FROM eligible
  GROUP BY 1
),
-- Ordering by category_name as well makes the retained row deterministic,
-- so reloading the same feed doesn't shuffle which category is primary.
deduped AS (
  SELECT DISTINCT ON (btrim(unique_key)) *
  FROM eligible
  ORDER BY btrim(unique_key), btrim(category_name), btrim(subcategory_name)
)
INSERT INTO sanmar_products (
  unique_key, inventory_key, style, brand_name, product_title,
  product_description, category, subcategory, categories, subcategories,
  color, size, size_index,
  available_sizes, case_size, piece_weight, product_status,
  piece_price, dozen_price, case_price, price_code,
  msrp, map_price, suggested_price, gtin, pms_color, mainframe_color,
  companion_styles, feed_qty, images, decorated_only, visible, source, synced_at
)
SELECT
  ${n('unique_key', 'bigint')},
  ${n('inventory_key', 'bigint')},
  ${t('style')},
  ${t('mill')},
  ${decodeEntities('product_title')},
  ${decodeEntities('product_description')},
  ${t('category_name')},
  ${t('subcategory_name')},
  x.categories,
  x.subcategories,
  ${t('color_name')},
  ${t('size')},
  ${n('size_index', 'int')},
  ${t('available_sizes')},
  ${n('case_size', 'int')},
  ${n('piece_weight', 'numeric')},
  ${t('product_status')},
  ${n('piece_price', 'numeric')},
  ${n('dozens_price', 'numeric')},
  ${n('case_price', 'numeric')},
  ${t('price_group')},
  ${n('msrp', 'numeric')},
  ${n('map_pricing', 'numeric')},
  ${n('suggested_price', 'numeric')},
  ${t('gtin')},
  ${t('pms_color')},
  ${t('sanmar_mainframe_color')},
  ${t('companion_styles')},
  ${n('qty', 'int')},
  -- Verified-absolute URLs at the top level. The color-specific filenames
  -- go under "raw": their CDN base varies by product (some resolve under
  -- imglib/mresjpg, others nowhere), so storing them unresolved beats
  -- prefixing a base that silently returns a placeholder image.
  jsonb_strip_nulls(jsonb_build_object(
    'product',             ${imageUrl('product_image')},
    'thumbnail',           ${imageUrl('thumbnail_image')},
    'colorSwatch',         ${imageUrl('color_swatch_image')},
    'brandLogo',           ${imageUrl('brand_logo_image')},
    'specSheet',           ${imageUrl('spec_sheet')},
    'frontModel',          ${t('front_model_image_url')},
    'decorationSpecSheet', ${t('decoration_spec_sheet')},
    'image3d',             ${t('image_3d_url')},
    'video',               ${t('video_url')}
  )) || jsonb_build_object('raw', jsonb_strip_nulls(jsonb_build_object(
    'colorSquare',            ${t('color_square_image')},
    'colorProduct',           ${t('color_product_image')},
    'colorProductThumbnail',  ${t('color_product_image_thumbnail')},
    'backModel',              ${t('back_model_image')},
    'frontFlat',              ${t('front_flat_image')},
    'backFlat',               ${t('back_flat_image')},
    'productMeasurements',    ${t('product_measurements')}
  ))),
  btrim(s.mill) IN (${sqlList(DECORATED_ONLY_BRANDS)}),
  btrim(s.product_status) <> 'Discontinued',
  'epdd',
  now()
FROM deduped s
JOIN taxonomy x ON x.k = btrim(s.unique_key)
ON CONFLICT (unique_key) DO UPDATE SET
  inventory_key    = EXCLUDED.inventory_key,
  style            = EXCLUDED.style,
  brand_name       = EXCLUDED.brand_name,
  product_title    = EXCLUDED.product_title,
  product_description = EXCLUDED.product_description,
  category         = EXCLUDED.category,
  subcategory      = EXCLUDED.subcategory,
  categories       = EXCLUDED.categories,
  subcategories    = EXCLUDED.subcategories,
  color            = EXCLUDED.color,
  size             = EXCLUDED.size,
  size_index       = EXCLUDED.size_index,
  available_sizes  = EXCLUDED.available_sizes,
  case_size        = EXCLUDED.case_size,
  piece_weight     = EXCLUDED.piece_weight,
  product_status   = EXCLUDED.product_status,
  piece_price      = EXCLUDED.piece_price,
  dozen_price      = EXCLUDED.dozen_price,
  case_price       = EXCLUDED.case_price,
  price_code       = EXCLUDED.price_code,
  msrp             = EXCLUDED.msrp,
  map_price        = EXCLUDED.map_price,
  suggested_price  = EXCLUDED.suggested_price,
  gtin             = EXCLUDED.gtin,
  pms_color        = EXCLUDED.pms_color,
  mainframe_color  = EXCLUDED.mainframe_color,
  companion_styles = EXCLUDED.companion_styles,
  feed_qty         = EXCLUDED.feed_qty,
  images           = EXCLUDED.images,
  decorated_only   = EXCLUDED.decorated_only,
  source           = EXCLUDED.source,
  synced_at        = now()
  -- Deliberately NOT updated:
  --   visible          -- preserves manual hides from the admin UI
  --   keywords         -- SOAP-only field, absent from the feed
  --   piece/dozen/case_sale_price, sale_start_date, sale_end_date
  --                    -- sale data lives in sanmar_saleItems.txt, not the
  --                       EPDD feed; overwriting would blank it every load
;`;
}

async function main() {
  requireEnv('DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD');

  const fileArgIndex = process.argv.indexOf('--file');
  const providedFile = fileArgIndex !== -1 ? process.argv[fileArgIndex + 1] : null;
  const keep = process.argv.includes('--keep') || Boolean(providedFile);

  const workDir = providedFile
    ? path.dirname(path.resolve(providedFile))
    : fs.mkdtempSync(path.join(os.tmpdir(), 'sanmar-feed-'));

  let csvPath;
  try {
    csvPath = providedFile ? path.resolve(providedFile) : await download(workDir);

    const rows = fs.statSync(csvPath).size;
    console.log(`[sanmar-feed] staging ${(rows / 1024 / 1024).toFixed(0)}MB of CSV…`);
    const stagedStart = Date.now();
    psql(['-c', 'TRUNCATE sanmar_feed_staging']);
    // Postgres parses the CSV itself, so quoted fields with embedded commas
    // and newlines are handled without a JS CSV dependency.
    psql([
      '-c',
      `\\copy sanmar_feed_staging FROM '${csvPath.replace(/'/g, "''")}' WITH (FORMAT csv, HEADER true)`,
    ]);
    const staged = psql(['-tAc', 'SELECT count(*) FROM sanmar_feed_staging']);
    console.log(
      `[sanmar-feed] staged ${staged} rows in ${Math.round((Date.now() - stagedStart) / 1000)}s`
    );

    console.log('[sanmar-feed] upserting into sanmar_products…');
    const upsertStart = Date.now();
    const out = psql(['-c', buildUpsertSql()]);
    console.log(
      `[sanmar-feed] ${out.trim()} in ${Math.round((Date.now() - upsertStart) / 1000)}s`
    );

    psql(['-c', 'TRUNCATE sanmar_feed_staging']);

    // sanmar_style_catalog is materialized (a plain view made /shop take
    // 8-10s per page), so the storefront keeps serving the previous load's
    // prices until it is refreshed. CONCURRENTLY so a live shop is not
    // locked out for the duration; it needs the unique index created in
    // migrations/supplier_catalog_v1.sql.
    console.log('[sanmar-feed] refreshing sanmar_style_catalog…');
    const refreshStart = Date.now();
    try {
      psql(['-c', 'REFRESH MATERIALIZED VIEW CONCURRENTLY sanmar_style_catalog']);
    } catch (err) {
      // CONCURRENTLY cannot populate a matview that has never been filled.
      console.warn(`[sanmar-feed] concurrent refresh failed (${err.message.split('\n')[0]}); retrying plain`);
      psql(['-c', 'REFRESH MATERIALIZED VIEW sanmar_style_catalog']);
    }
    console.log(
      `[sanmar-feed] refreshed in ${Math.round((Date.now() - refreshStart) / 1000)}s`
    );

    const summary = psql([
      '-tAc',
      `SELECT format(
         'total=%s  sellable=%s  decorated_only=%s  hidden=%s  brands=%s  with_map=%s',
         count(*),
         count(*) FILTER (WHERE visible AND NOT decorated_only),
         count(*) FILTER (WHERE decorated_only),
         count(*) FILTER (WHERE NOT visible),
         count(DISTINCT brand_name),
         count(*) FILTER (WHERE map_price IS NOT NULL)
       ) FROM sanmar_products WHERE source = 'epdd'`,
    ]);
    console.log(`[sanmar-feed] ${summary}`);
  } finally {
    if (!keep && csvPath) {
      fs.rmSync(workDir, { recursive: true, force: true });
    } else if (csvPath) {
      console.log(`[sanmar-feed] kept download in ${workDir}`);
    }
  }
}

main().catch((err) => {
  console.error(`[sanmar-feed] FAILED: ${err.message}`);
  process.exit(1);
});
