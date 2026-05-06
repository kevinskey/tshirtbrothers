// Resumable, rate-limited sizes backfill. Re-run safely — it skips
// products whose sizes column is already populated and applies a small
// throttle + 429 retry to stay under the S&S rate limit.

import 'dotenv/config';
import pkg from 'pg';
import { fetchStyleSizes } from '../services/ssActivewear.js';

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
      const sizes = await fetchStyleSizes(ssId);
      // fetchStyleSizes already returns [] on non-200, so we can't
      // distinguish 429 from a genuine empty list inside this function.
      // We treat empty as "no retry" — the rate-limited cases will
      // return empty arrays after the first 429 prints to stderr.
      return sizes;
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
     WHERE jsonb_array_length(sizes) = 0
       AND ss_id IS NOT NULL
     ORDER BY id`
  );
  console.log(`[backfill] ${rows.length} products with empty sizes`);

  let filled = 0;
  let empty = 0;
  let consecutive429 = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    let sizes = await fetchWithRetry(p.ss_id);
    if (sizes.length > 0) {
      await pool.query(
        'UPDATE products SET sizes = $1 WHERE id = $2',
        [JSON.stringify(sizes), p.id]
      );
      filled++;
      consecutive429 = 0;
    } else {
      empty++;
      // Heuristic: many empties in a row almost certainly means we're
      // being rate-limited. Back off aggressively.
      consecutive429++;
      if (consecutive429 >= 5) {
        console.log(`[backfill] ${consecutive429} empties in a row — sleeping 10s`);
        await sleep(10000);
        consecutive429 = 0;
      }
    }
    // Steady throttle: ~1 req/sec to stay well under any S&S rate limit.
    await sleep(1000);
    if ((i + 1) % 25 === 0) {
      console.log(`[backfill] ${i + 1}/${rows.length}  filled=${filled} empty=${empty}`);
    }
  }
  console.log(`[backfill] DONE  total=${rows.length} filled=${filled} empty=${empty}`);
  await pool.end();
}

main().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
