// Resumable, rate-limited prices backfill. Re-run safely — it only
// touches products whose base_price is 0/null and uses the same throttle
// + retry pattern as backfill-sizes.js. The S&S /styles/ endpoint
// doesn't return pricing, so each row needs a /products/?styleid=X call.

import 'dotenv/config';
import pkg from 'pg';
import { fetchStyleSkuData } from '../services/ssActivewear.js';

const { Pool } = pkg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(ssId, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchStyleSkuData(ssId);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(500 * attempt);
    }
  }
  return { sizes: [], customer_price: null };
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, ss_id, name FROM products
     WHERE (base_price IS NULL OR base_price = 0)
       AND ss_id IS NOT NULL
     ORDER BY id`
  );
  console.log(`[backfill-prices] ${rows.length} products with no price`);

  let filled = 0;
  let empty = 0;
  let consecutive429 = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const { customer_price } = await fetchWithRetry(p.ss_id);
    if (customer_price != null && customer_price > 0) {
      await pool.query(
        'UPDATE products SET base_price = $1, last_synced = NOW() WHERE id = $2',
        [customer_price, p.id]
      );
      filled++;
      consecutive429 = 0;
    } else {
      empty++;
      consecutive429++;
      if (consecutive429 >= 5) {
        console.log(`[backfill-prices] ${consecutive429} empties in a row — sleeping 10s`);
        await sleep(10000);
        consecutive429 = 0;
      }
    }
    await sleep(1000);
    if ((i + 1) % 25 === 0) {
      console.log(`[backfill-prices] ${i + 1}/${rows.length}  filled=${filled} empty=${empty}`);
    }
  }
  console.log(`[backfill-prices] DONE  total=${rows.length} filled=${filled} empty=${empty}`);
  await pool.end();
}

main().catch((e) => {
  console.error('[backfill-prices] fatal:', e);
  process.exit(1);
});
