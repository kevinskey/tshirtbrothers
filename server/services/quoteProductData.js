/**
 * What a customer is actually ordering, for the pages they see.
 *
 * The approval page and the payment page both need this, and they were both
 * showing pictures and a price with nothing in between — a customer could
 * approve a proof without ever being told the garment, the colours or the
 * quantities they were agreeing to.
 *
 * quote_items is the itemised record; a quote written before items existed
 * (or imported from mail) carries one garment's worth of detail on the quote
 * row itself, so that is the fallback rather than showing nothing.
 */
import pool from '../db.js';

/** jsonb size maps arrive as either {S:4,M:2} or [] / {} when unused. */
function sizesToText(sizes) {
  if (!sizes) return null;
  const entries = Array.isArray(sizes)
    ? sizes.map((s) => (typeof s === 'string' ? [s, null] : [s?.size, s?.quantity]))
    : Object.entries(sizes);
  const parts = entries
    .filter(([size]) => size)
    .map(([size, qty]) => (qty ? `${size}×${qty}` : String(size)));
  return parts.length ? parts.join(', ') : null;
}

function areasToText(areas) {
  if (!Array.isArray(areas) || areas.length === 0) return null;
  const names = areas
    .map((a) => (typeof a === 'string' ? a : a?.name || a?.area || a?.location))
    .filter(Boolean);
  return names.length ? names.join(', ') : null;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Customer-safe product data for one quote. Never throws — these pages must
 * still render their mockups and totals if this lookup fails.
 */
export async function quoteProductData(quoteId) {
  if (!quoteId) return null;
  try {
    const { rows: qrows } = await pool.query(
      `SELECT id, product_name, color, quantity, sizes, print_areas,
              estimated_price, deposit_amount, status
         FROM quotes WHERE id = $1`,
      [quoteId],
    );
    const q = qrows[0];
    if (!q) return null;

    const { rows: items } = await pool.query(
      `SELECT position, product_name, color, sizes, quantity, print_areas,
              unit_price, line_total, notes
         FROM quote_items WHERE quote_id = $1 ORDER BY position, id`,
      [quoteId],
    );

    const mapped = items.map((it) => {
      const unit = toNumber(it.unit_price);
      const qty = it.quantity ?? null;
      let total = toNumber(it.line_total);
      // Real rows carry line_total = 0 with a real unit price (quote 276 is
      // one), and printing "$0.00" next to a 26-shirt order reads as free.
      // Derive it from the same row instead, and show nothing if we cannot.
      if (!total && unit && qty) total = unit * qty;
      return {
        product_name: it.product_name,
        color: it.color || null,
        sizes: sizesToText(it.sizes),
        quantity: qty,
        print_areas: areasToText(it.print_areas),
        unit_price: unit,
        line_total: total || null,
        notes: it.notes || null,
      };
    });

    // No itemised rows — synthesize one line from the quote so the customer
    // still sees the garment and quantity rather than a bare total.
    const fallback = mapped.length === 0 && (q.product_name || q.quantity)
      ? [{
          product_name: q.product_name,
          color: q.color || null,
          sizes: sizesToText(q.sizes),
          quantity: q.quantity ?? null,
          print_areas: areasToText(q.print_areas),
          unit_price: null,
          line_total: null,
          notes: null,
        }]
      : [];

    return {
      // estimated_price is TAX-INCLUSIVE on a TSB quote — it is the total the
      // customer pays, not a subtotal, so it is labelled as the total.
      estimated_price: toNumber(q.estimated_price),
      deposit_amount: toNumber(q.deposit_amount),
      status: q.status,
      product_name: q.product_name,
      quantity: q.quantity ?? null,
      items: mapped.length ? mapped : fallback,
    };
  } catch (err) {
    console.error(`[quoteProductData] lookup failed for quote ${quoteId}:`, err.message);
    return null;
  }
}
