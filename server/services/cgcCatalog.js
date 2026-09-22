// Custom Gift Club catalog upkeep. jds_products rows get a derived
// cgc_category (see lib/cgcCategories.js). The backfill runs at boot —
// cheap (one indexed scan for NULLs) and idempotent — so the whole
// published assortment is always categorized, including SKUs published
// before CGC existed or by admin paths that predate the categorizer.

import pool from '../db.js';
import { categorizeCgcProduct } from '../lib/cgcCategories.js';

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
