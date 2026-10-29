// Sync the SanMar catalog into sanmar_products, one getProductInfoByBrand
// call per brand (SanMar asks integrators to prefer bulk pulls over
// per-style hammering). Usage:
//   node scripts/sync-sanmar.js                 # sync the default brand list
//   node scripts/sync-sanmar.js "Port & Company" "Gildan"   # specific brands
import 'dotenv/config';
import pool from '../db.js';
import {
  getProductInfoByBrand,
  DECORATED_ONLY_BRANDS,
  EXCLUDED_BRANDS,
} from '../services/sanmar.js';

// Request names must match the brand table in SanMar's integration guide.
const DEFAULT_BRANDS = [
  // SanMar house brands (20% MAP) — sellable blank
  'Port & Company',
  'Port Authority',
  'Sport-Tek',
  'District',
  'District Made',
  'CornerStone',
  'Precious Cargo',
  // Open mill brands (no MAP) — sellable blank
  'Gildan',
  'Hanes',
  'Jerzees',
  'Fruit of the Loom',
  'Anvil',
  'Bella+Canvas',
  'Rabbit Skins',
  // Decorated-only brands (SanMar prohibits blank/DTC sale)
  'Nike',
  'New Era',
  'OGIO',
  'OGIO Endurance',
  'Eddie Bauer',
  'Alternative Apparel',
];

const UPSERT_SQL = `
  INSERT INTO sanmar_products (
    unique_key, inventory_key, style, brand_name, product_title,
    product_description, category, keywords, color, size, size_index,
    available_sizes, case_size, piece_weight, product_status,
    piece_price, dozen_price, case_price,
    piece_sale_price, dozen_sale_price, case_sale_price,
    sale_start_date, sale_end_date, price_code, images, decorated_only, synced_at
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
    $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26, now()
  )
  ON CONFLICT (unique_key) DO UPDATE SET
    inventory_key = EXCLUDED.inventory_key,
    style = EXCLUDED.style,
    brand_name = EXCLUDED.brand_name,
    product_title = EXCLUDED.product_title,
    product_description = EXCLUDED.product_description,
    category = EXCLUDED.category,
    keywords = EXCLUDED.keywords,
    color = EXCLUDED.color,
    size = EXCLUDED.size,
    size_index = EXCLUDED.size_index,
    available_sizes = EXCLUDED.available_sizes,
    case_size = EXCLUDED.case_size,
    piece_weight = EXCLUDED.piece_weight,
    product_status = EXCLUDED.product_status,
    piece_price = EXCLUDED.piece_price,
    dozen_price = EXCLUDED.dozen_price,
    case_price = EXCLUDED.case_price,
    piece_sale_price = EXCLUDED.piece_sale_price,
    dozen_sale_price = EXCLUDED.dozen_sale_price,
    case_sale_price = EXCLUDED.case_sale_price,
    sale_start_date = EXCLUDED.sale_start_date,
    sale_end_date = EXCLUDED.sale_end_date,
    price_code = EXCLUDED.price_code,
    images = EXCLUDED.images,
    decorated_only = EXCLUDED.decorated_only,
    synced_at = now()
`;

function toDate(v) {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function syncBrand(brand) {
  const decoratedOnly = DECORATED_ONLY_BRANDS.has(brand);
  console.log(`[sanmar-sync] fetching ${brand}…`);
  const started = Date.now();
  const products = await getProductInfoByBrand(brand);
  console.log(
    `[sanmar-sync] ${brand}: ${products.length} SKUs in ${Math.round((Date.now() - started) / 1000)}s`
  );

  let upserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of products) {
      await client.query(UPSERT_SQL, [
        p.uniqueKey, p.inventoryKey, p.style, p.brandName, p.productTitle,
        p.productDescription, p.category, p.keywords, p.color, p.size,
        p.sizeIndex, p.availableSizes, p.caseSize, p.pieceWeight,
        p.productStatus, p.piecePrice, p.dozenPrice, p.casePrice,
        p.pieceSalePrice, p.dozenSalePrice, p.caseSalePrice,
        toDate(p.saleStartDate), toDate(p.saleEndDate), p.priceCode,
        JSON.stringify(p.images), decoratedOnly || p.decoratedOnly,
      ]);
      upserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return upserted;
}

async function main() {
  const brands = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BRANDS;
  let total = 0;
  const failed = [];
  for (const brand of brands) {
    if (EXCLUDED_BRANDS.has(brand)) {
      console.log(`[sanmar-sync] skipping ${brand} (not orderable via integration)`);
      continue;
    }
    try {
      total += await syncBrand(brand);
    } catch (err) {
      console.error(`[sanmar-sync] ${brand} FAILED: ${err.message}`);
      failed.push(brand);
    }
  }
  console.log(`[sanmar-sync] done — ${total} SKUs upserted${failed.length ? `; FAILED: ${failed.join(', ')}` : ''}`);
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main();
