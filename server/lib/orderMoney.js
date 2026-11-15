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

// Is this invoice settled? Asked three ways because no single column is
// trustworthy across the table's history: 16 invoices have an amount_due
// that disagrees with total - amount_paid, 16 carry a non-zero amount_paid
// with an empty payments[], and 11 are marked 'paid' while still showing a
// balance. Invoice 33 is the cautionary one — status 'paid', amount_due
// 0.00, amount_paid 242.45 against a 701.00 total, with the quote stamped
// paid in full. Summing amount_paid there would re-bill a customer 458.55
// on a job they settled in June.
//
// ANY of the three saying "settled" settles it. The asymmetry is deliberate:
// these numbers go out in emails that ask people for money, and billing
// someone who has paid is far worse than failing to chase someone who has
// not. Contradictory rows are a human's problem, not an email's.
function invoiceSettled(invoice) {
  const status = String(invoice.status || '').toLowerCase();
  if (status === 'paid') return true;
  if (invoice.amount_due != null && round2(invoice.amount_due) <= 0) return true;
  const total = round2(invoice.total);
  return total > 0 && round2(invoice.amount_paid) >= total;
}

// What the QUOTE row claims has been collected.
//
// deposit_amount means three different things depending on where the quote
// is, and only two of them are money:
//   before acceptance → the deposit we ASKED for (send-price stamps every
//                       quoted quote with the 50% ask; nothing was paid)
//   after acceptance  → the deposit actually collected
//   after the balance → cumulative collected, clamped to estimated_price
// So it counts only once something proves money arrived. Treating the
// pre-acceptance ask as revenue is how a quote nobody paid showed up under
// "Deposit Paid".
function quoteCollected(quote) {
  if (!quote) return 0;
  if (quote.balance_paid_at) return round2(quote.estimated_price);
  if (quote.accepted_at) return round2(quote.deposit_amount);
  return 0;
}

/**
 * Might this invoice still be owed? The mirror of invoiceSettled, and
 * deliberately NOT its negation.
 *
 * Automated billing asks "is it settled?" and needs ANY signal saying yes,
 * so a contradictory row never emails someone who has paid. A human deciding
 * whether to chase a balance needs the opposite bias: ANY signal saying
 * money is owed should put the Send / Text / Record-payment buttons on the
 * row, so the decision can be made by a person looking at the invoice.
 *
 * Without this, the 11 invoices marked 'paid' while still showing a balance
 * — $2,352.79 of them — rendered with no way to collect anything at all.
 */
export function invoiceMayOweMoney(invoice) {
  if (!invoice) return false;
  if (IGNORED_INVOICE_STATUSES.has(String(invoice.status || '').toLowerCase())) return false;
  // amount_due is the column the payment paths maintain to answer exactly
  // this question, so when it is present it decides — including when it
  // says 0 against a stale amount_paid (invoice 33: 242.45 recorded of a
  // 701.00 total, settled in June). amount_paid is the unreliable one; it
  // only gets a vote when there is no amount_due at all.
  if (invoice.amount_due != null) return round2(invoice.amount_due) > 0;
  const total = round2(invoice.total);
  return total > 0 && round2(invoice.amount_paid) < total;
}

/** What is still owed on one invoice, preferring amount_due over arithmetic. */
function invoiceDue(invoice) {
  if (invoiceSettled(invoice)) return 0;
  const total = round2(invoice.total);
  if (invoice.amount_due != null) return round2(Math.max(0, invoice.amount_due));
  return round2(Math.max(0, total - round2(invoice.amount_paid)));
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
    const total = round2(billable.reduce((n, i) => n + round2(i.total), 0));
    const due = round2(billable.reduce((n, i) => n + invoiceDue(i), 0));
    const fromInvoices = round2(Math.max(0, total - due));

    // The quote sometimes knows about money the invoice never recorded —
    // quote 70 has a deposit stamped on the quote and an invoice showing
    // nothing paid. Take the most generous reading of what the customer has
    // handed over, for the same reason as invoiceSettled: under-billing is
    // recoverable by a phone call, over-billing is not.
    const collected = round2(Math.min(total, Math.max(fromInvoices, quoteCollected(quote))));
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
  const collected = Math.min(quoteCollected(quote), total || Infinity);

  return {
    total,
    collected: round2(collected),
    due: round2(Math.max(0, total - collected)),
    source: 'quote',
    paidInFull: Boolean(quote.balance_paid_at) && total > 0,
    invoiceCount: 0,
  };
}
