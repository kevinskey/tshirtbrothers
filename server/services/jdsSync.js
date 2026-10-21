// Nightly JDS catalog re-snapshot.
//
// Published JDS products (the gifts store + Custom Gift Club both sell from
// jds_products) are frozen at whatever JDS said on publish day — cost,
// image, name, and nothing about stock. This walks every active SKU back
// through the JDS product API and:
//   - refreshes name / image / cost_cents and records available_quantity
//   - deactivates SKUs JDS no longer recognizes (discontinued)
//   - writes a sync_note when the refreshed cost eats the retail margin,
//     so the admin list can show which prices need a second look
// Retail prices are NEVER changed automatically — pricing is Doc's call.
import pool from '../db.js';
import { fetchJdsProducts } from './jds.js';

const BATCH = 40; // stay well clear of "wasteful and excessive spamming"

export async function runJdsCatalogSync() {
  try {
    const { rows: products } = await pool.query(
      'SELECT id, sku, retail_price_cents FROM jds_products WHERE active ORDER BY sku',
    );
    if (products.length === 0) return;

    let updated = 0;
    const deactivated = [];
    const marginAlerts = [];

    for (let i = 0; i < products.length; i += BATCH) {
      const slice = products.slice(i, i + BATCH);
      let results;
      try {
        results = await fetchJdsProducts(slice.map((p) => p.sku));
      } catch (err) {
        // One failed batch shouldn't stop the rest of the night's sync.
        console.error(`[jds-sync] batch ${i / BATCH + 1} failed:`, err.message);
        continue;
      }
      const bySku = new Map(
        results.map((r) => [String(r.sku || '').toUpperCase(), r]),
      );

      for (const p of slice) {
        const jds = bySku.get(p.sku.toUpperCase());
        if (!jds || jds.notFound) {
          await pool.query(
            `UPDATE jds_products
                SET active = FALSE,
                    sync_note = 'JDS no longer lists this SKU',
                    last_synced_at = NOW()
              WHERE id = $1`,
            [p.id],
          );
          deactivated.push(p.sku);
          continue;
        }

        const cost = [jds.onePiece, jds.lessThanCase, jds.oneCase]
          .find((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
        const costCents = cost != null ? Math.round(cost * 100) : null;
        const qty = [jds.availableQuantity, jds.localQuantity]
          .find((v) => typeof v === 'number' && Number.isFinite(v));

        let note = null;
        if (costCents != null && costCents >= p.retail_price_cents) {
          note = `cost $${(costCents / 100).toFixed(2)} ≥ retail $${(p.retail_price_cents / 100).toFixed(2)} — reprice`;
          marginAlerts.push(`${p.sku} (${note})`);
        }

        await pool.query(
          `UPDATE jds_products
              SET name = COALESCE(NULLIF($2, ''), name),
                  image_url = COALESCE($3, image_url),
                  cost_cents = COALESCE($4, cost_cents),
                  available_quantity = $5,
                  sync_note = $6,
                  last_synced_at = NOW()
            WHERE id = $1`,
          [
            p.id,
            String(jds.name || jds.description || jds.title || ''),
            jds.image || jds.thumbnail || jds.quickImage || null,
            costCents,
            qty ?? null,
            note,
          ],
        );
        updated += 1;
      }
    }

    console.log(
      `[jds-sync] ${updated} refreshed, ${deactivated.length} deactivated` +
      (deactivated.length ? ` (${deactivated.join(', ')})` : '') +
      (marginAlerts.length ? `; margin alerts: ${marginAlerts.join('; ')}` : ''),
    );
  } catch (err) {
    console.error('[jds-sync] failed:', err.message);
  }
}
