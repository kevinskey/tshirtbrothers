// Custom Gift Club catalog upkeep. jds_products rows get a derived
// cgc_category (see lib/cgcCategories.js). The backfill runs at boot —
// cheap (one indexed scan for NULLs) and idempotent — so the whole
// published assortment is always categorized, including SKUs published
// before CGC existed or by admin paths that predate the categorizer.

import pool from '../db.js';
import { categorizeCgcProduct } from '../lib/cgcCategories.js';
import { sportsForCgcProduct } from '../lib/cgcSports.js';

export async function backfillCgcCategories() {
  const { rows } = await pool.query(
    `SELECT id, name FROM jds_products WHERE cgc_category IS NULL`,
  );
  if (!rows.length) return 0;

  // Group ids per category so 3,400 rows update in ~6 statements.
  const byCategory = new Map();
  for (const row of rows) {
    const cat = categorizeCgcProduct(row.name);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(row.id);
  }
  for (const [category, ids] of byCategory) {
    await pool.query(
      `UPDATE jds_products SET cgc_category = $1 WHERE id = ANY($2)`,
      [category, ids],
    );
  }
  console.log(`[cgc] categorized ${rows.length} products into ${byCategory.size} collections`);
  return rows.length;
}

// Sport is optional, so "no sport" is a legitimate answer and NULL can't mean
// "unscanned" the way it does for category — cgc_sport_scanned carries that.
export async function backfillCgcSports() {
  const { rows } = await pool.query(
    `SELECT id, name FROM jds_products WHERE NOT cgc_sport_scanned`,
  );
  if (!rows.length) return 0;

  // Group ids by the exact sport set so the whole catalog updates in a handful
  // of statements rather than one per row.
  const bySports = new Map();
  for (const row of rows) {
    const sports = sportsForCgcProduct(row.name);
    const key = sports.join('|');
    if (!bySports.has(key)) bySports.set(key, { sports, ids: [] });
    bySports.get(key).ids.push(row.id);
  }
  let tagged = 0;
  for (const { sports, ids } of bySports.values()) {
    await pool.query(
      `UPDATE jds_products SET cgc_sport = $1, cgc_sport_scanned = TRUE WHERE id = ANY($2)`,
      [sports.length ? sports : null, ids],
    );
    if (sports.length) tagged += ids.length;
  }
  console.log(`[cgc] scanned ${rows.length} products for sport, tagged ${tagged}`);
  return rows.length;
}
