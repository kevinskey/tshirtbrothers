// What does this job cost, and what has actually been collected?
//
// One answer, one place. A job is stored in two rows — the quote (the work)
// and the invoice (the bill) — and both carry money. They are written by
// different code paths and drift apart, so every consumer that picked one
// row and trusted it has eventually been wrong:
//
//   * the admin list read quotes.balance_paid_at and labelled a fully-paid
//     order "Deposit paid" (invoice said paid, quote stamp was never written)
//   * the 'ready' hook read estimated_price - deposit_amount and emailed a
//     customer a $335 balance on an order he had paid off in full
//   * quote 298 says $247.36 where its invoice says $247.32
//
// The rule: THE INVOICE WINS WHENEVER ONE EXISTS. A quote that has not been
// billed yet still legitimately holds its own price, so it remains the
// fallback — "invoice is the record" does not mean quotes never hold money,
// it means the quote's copy stops counting the moment a bill exists.
//
// Pure and synchronous: callers load the rows (see loadOrderMoney in
// orderMoneyDb.js) so the decision stays testable without a database.

/** Money is dollars-and-cents; keep float noise out of comparisons. */
function round2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// A draft invoice has not been sent and a cancelled one has been withdrawn —
// neither is a bill the customer owes, so neither may define what this job
// costs. Anything else (sent / partial / paid / overdue) counts.
const IGNORED_INVOICE_STATUSES = new Set(['draft', 'cancelled']);

export function billableInvoices(invoices = []) {
  if (!Array.isArray(invoices)) return [];
  return invoices.filter((i) => i && !IGNORED_INVOICE_STATUSES.has(String(i.status || '').toLowerCase()));
}

/**
 * Resolve the money for one job.
 *
 * @param {object} quote      the quotes row (may be null)
 * @param {object[]} invoices every invoice linked to it (invoices.quote_id)
 * @returns {{
 *   total: number, collected: number, due: number,
 *   source: 'invoice'|'quote'|'none',
 *   paidInFull: boolean, invoiceCount: number
 * }}
 */
export function resolveOrderMoney(quote, invoices = []) {
  const billable = billableInvoices(invoices);

  // ── Invoice path — the bill is the record. Summed, not picked: a job can
  // carry more than one invoice (quotes 122 and 126 each have two), and
  // reading only the first understates both what is owed and what was paid.
  if (billable.length > 0) {
    const total = round2(billable.reduce((n, i) => n + Number(i.total || 0), 0));
    const collected = round2(billable.reduce((n, i) => n + Number(i.amount_paid || 0), 0));
    return {
      total,
      collected,
      due: round2(Math.max(0, total - collected)),
      source: 'invoice',
      paidInFull: total > 0 && collected >= total,
      invoiceCount: billable.length,
    };
  }

  // ── Quote path — no bill exists yet.
  if (!quote) {
    return { total: 0, collected: 0, due: 0, source: 'none', paidInFull: false, invoiceCount: 0 };
  }

  const total = round2(quote.estimated_price);

  // deposit_amount means three different things depending on where the quote
  // is, and only two of them are money:
  //   before acceptance → the deposit we ASKED for (send-price stamps every
  //                       quoted quote with the 50% ask; nothing was paid)
  //   after acceptance  → the deposit actually collected
  //   after the balance → cumulative collected, clamped to estimated_price
  // So it counts as collected only once something proves money arrived.
  // Treating the pre-acceptance ask as revenue is how a quote nobody paid
  // showed up under "Deposit Paid".
  let collected = 0;
  if (quote.balance_paid_at) {
    collected = total;
  } else if (quote.accepted_at) {
    collected = Math.min(round2(quote.deposit_amount), total || Infinity);
  }

  return {
    total,
    collected: round2(collected),
    due: round2(Math.max(0, total - collected)),
    source: 'quote',
    paidInFull: Boolean(quote.balance_paid_at) && total > 0,
    invoiceCount: 0,
  };
}
