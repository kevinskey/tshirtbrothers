#!/usr/bin/env node
/**
 * 90-day cleanup of saved_designs.elements_legacy snapshots.
 *
 * The Fabric port writes a v1 snapshot to elements_legacy the first time
 * a row is converted to v2 (see PUT /api/designs/:id in server/routes/designs.js).
 * This script nulls those snapshots once they're 90+ days old — by then,
 * either the v2 design has soaked enough that we trust it, or we'd already
 * have rolled back via /api/admin/designs/:id/restore-legacy.
 *
 * The retention window is the migration plan's commitment to customers:
 * a Fabric save is rollback-able for 90 days, no longer.
 *
 * Run modes:
 *   node server/scripts/cleanup_legacy_snapshots.js           -- DRY RUN, prints what would be cleaned
 *   node server/scripts/cleanup_legacy_snapshots.js --execute -- ACTUALLY clean
 *
 * Cron candidate:
 *   0 4 * * *  cd /var/www/tshirtbrothers && node server/scripts/cleanup_legacy_snapshots.js --execute
 *
 * Not auto-scheduled in PR #8 — kept manual until the toggle has been
 * default-on for the 14-day window in PR #9 and we know the retention
 * policy is the right one.
 */

import 'dotenv/config';
import pool from '../db.js';

const RETENTION_DAYS = 90;

async function main() {
  const execute = process.argv.includes('--execute');

  const candidates = await pool.query(
    `SELECT id, name, legacy_archived_at,
            octet_length(elements_legacy::text) AS legacy_bytes
     FROM saved_designs
     WHERE elements_legacy IS NOT NULL
       AND legacy_archived_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
     ORDER BY legacy_archived_at ASC`
  );

  if (candidates.rows.length === 0) {
    console.log(`[cleanup_legacy_snapshots] no rows older than ${RETENTION_DAYS} days. nothing to do.`);
    await pool.end();
    return;
  }

  const totalBytes = candidates.rows.reduce((s, r) => s + Number(r.legacy_bytes ?? 0), 0);
  console.log(`[cleanup_legacy_snapshots] ${execute ? 'CLEANING' : 'DRY RUN'} — ${candidates.rows.length} row(s), ${(totalBytes / 1024).toFixed(1)} KB to reclaim:`);
  for (const row of candidates.rows.slice(0, 20)) {
    console.log(`  id=${row.id} name="${row.name}" archived=${row.legacy_archived_at.toISOString()}`);
  }
  if (candidates.rows.length > 20) console.log(`  ... and ${candidates.rows.length - 20} more`);

  if (!execute) {
    console.log('[cleanup_legacy_snapshots] re-run with --execute to actually clean.');
    await pool.end();
    return;
  }

  const result = await pool.query(
    `UPDATE saved_designs
       SET elements_legacy = NULL,
           legacy_archived_at = NULL
     WHERE elements_legacy IS NOT NULL
       AND legacy_archived_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
     RETURNING id`
  );
  console.log(`[cleanup_legacy_snapshots] cleared ${result.rows.length} row(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('[cleanup_legacy_snapshots] failed:', err);
  process.exit(1);
});
