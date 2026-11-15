// One-time (but re-runnable) backfill for orders opened from hand-written
// invoices before syncInvoiceArtworkToOrder existed. Those orders show an
// empty Art square in the Quotes list even though the proof mockups are
// sitting on the invoice — see the helper's doc comment for the full story.
//
// Safe to re-run: the sync is idempotent and never overwrites artwork an
// admin attached to the order by hand.
//
//   node server/scripts/backfill-invoice-order-artwork.js --dry-run
//   node server/scripts/backfill-invoice-order-artwork.js
//
// Runs from anywhere: the repo root is the obvious place to run that command
// from, and `import 'dotenv/config'` resolves .env against the CURRENT
// DIRECTORY — so from the root it quietly loaded nothing and the run died
// with SASL "client password must be a string", a confusing way to say "no
// credentials". The path is resolved from this file instead.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// Imported dynamically, and only now: db.js builds its connection Pool out of
// process.env the moment it is evaluated, and a static import would evaluate
// it before the line above had put anything there.
const { default: pool } = await import('../db.js');
const { syncInvoiceArtworkToOrder } = await import('../lib/orderFromInvoice.js');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  // Only invoices that have an order AND carry art worth copying. The
  // jsonb_array_length guard keeps '[]' rows out of the work list.
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.quote_id, i.mockup_id, i.extra_mockups,
            q.mockup_image_url AS order_mockup_url
       FROM invoices i
       JOIN quotes q ON q.id = i.quote_id
      WHERE i.mockup_id IS NOT NULL
         OR jsonb_array_length(COALESCE(i.extra_mockups, '[]'::jsonb)) > 0
      ORDER BY i.id`,
  );

  console.log(`${rows.length} invoice(s) with artwork and an order attached`);

  let touched = 0;
  for (const inv of rows) {
    const already = inv.order_mockup_url ? ' (order already has a primary)' : '';
    if (dryRun) {
      console.log(`  would sync ${inv.invoice_number} -> order ${inv.quote_id}${already}`);
      continue;
    }
    try {
      await syncInvoiceArtworkToOrder(inv, inv.quote_id);
      touched += 1;
      console.log(`  synced ${inv.invoice_number} -> order ${inv.quote_id}${already}`);
    } catch (err) {
      console.error(`  FAILED ${inv.invoice_number}: ${err.message}`);
    }
  }

  if (!dryRun) console.log(`done — ${touched}/${rows.length} synced`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
