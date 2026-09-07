// Resumable, rate-limited per-item weight backfill from S&S. Re-run
// safely — touches only products whose weight_oz is NULL. Weight is
// caseWeight / caseQty in lbs, converted to ounces and rounded to 0.1.
// Mirrors backfill-colors.js pacing + retry behavior.
//
// Run on the droplet:  cd /var/www/tshirtbrothers/server && node scripts/backfill-weights.js

import 'dotenv/config';
import pkg from 'pg';

const { Pool } = pkg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWeightOz(styleId, maxAttempts = 5) {
  const credentials = Buffer.from(
    `${process.env.SS_ACCOUNT_NUMBER}:${process.env.SS_API_KEY}`,
  ).toString('base64');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(
        `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=caseWeight,caseQty&limit=1`,
        { headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : null;
      if (item?.caseWeight && item?.caseQty) {
        return Math.round((item.caseWeight / item.caseQty) * 16 * 10) / 10;
      }
      return null;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(500 * attempt);
    }
  }
  return null;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, ss_id, name FROM products
      WHERE weight_oz IS NULL AND ss_id IS NOT NULL
      ORDER BY id`,
  );
  console.log(`[backfill-weights] ${rows.length} products with no weight`);

  let filled = 0;
  let empty = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    let oz = null;
    try {
      oz = await fetchWeightOz(p.ss_id);
    } catch (err) {
      console.error(`[backfill-weights] ${p.ss_id} failed: ${err.message}`);
    }
    if (oz != null && oz > 0) {
      await pool.query('UPDATE products SET weight_oz = $1 WHERE id = $2', [oz, p.id]);
      filled++;
    } else {
      // Stamp 0 so re-runs skip styles S&S has no weight for; checkout
      // treats <= 0 the same as NULL (falls back to a default weight).
      await pool.query('UPDATE products SET weight_oz = 0 WHERE id = $1', [p.id]);
      empty++;
    }
    if ((i + 1) % 100 === 0) console.log(`[backfill-weights] ${i + 1}/${rows.length} (${filled} filled, ${empty} empty)`);
    await sleep(150);
  }
  console.log(`[backfill-weights] done — ${filled} filled, ${empty} without weight data`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
