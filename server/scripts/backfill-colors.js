// Resumable, rate-limited colors backfill. Re-run safely — touches only
// products whose `colors` is null/empty. Mirrors the sizes/prices
// backfill scripts in pacing + retry behavior.

import 'dotenv/config';
import pkg from 'pg';
import { fetchStyleColors } from '../services/ssActivewear.js';

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
      return await fetchStyleColors(ssId);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(500 * attempt);
    }
  }
  return [];
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, ss_id, name FROM products
     WHERE (colors IS NULL OR jsonb_array_length(colors) = 0)
       AND ss_id IS NOT NULL
     ORDER BY id`
  );
  console.log(`[backfill-colors] ${rows.length} products with no colors`);

  let filled = 0;
  let empty = 0;
  let consecutive429 = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const colors = await fetchWithRetry(p.ss_id);
    if (colors.length > 0) {
      await pool.query(
        'UPDATE products SET colors = $1, last_synced = NOW() WHERE id = $2',
        [JSON.stringify(colors), p.id]
      );
      filled++;
      consecutive429 = 0;
    } else {
      empty++;
      consecutive429++;
      if (consecutive429 >= 5) {
        console.log(`[backfill-colors] ${consecutive429} empties in a row — sleeping 10s`);
        await sleep(10000);
        consecutive429 = 0;
      }
    }
    await sleep(1000);
    if ((i + 1) % 25 === 0) {
      console.log(`[backfill-colors] ${i + 1}/${rows.length}  filled=${filled} empty=${empty}`);
    }
  }
  console.log(`[backfill-colors] DONE  total=${rows.length} filled=${filled} empty=${empty}`);
  await pool.end();
}

main().catch((e) => {
  console.error('[backfill-colors] fatal:', e);
  process.exit(1);
});
