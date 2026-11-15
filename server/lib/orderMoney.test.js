import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderMoney, billableInvoices } from './orderMoney.js';

const inv = (total, amount_paid, status = 'sent') => ({ total, amount_paid, status });

test('an invoice outranks the quote, even when the quote claims otherwise', () => {
  // Quote 268: estimated_price 335 (pre-tax), invoice 361.80 fully paid, and
  // the quote's own stamps were never written. The invoice is the truth.
  const m = resolveOrderMoney(
    { estimated_price: 335.00, deposit_amount: null, accepted_at: '2026-10-20', balance_paid_at: null },
    [inv(361.80, 361.80, 'paid')],
  );
  assert.equal(m.source, 'invoice');
  assert.equal(m.total, 361.80);
  assert.equal(m.collected, 361.80);
  assert.equal(m.due, 0);
  assert.equal(m.paidInFull, true);
});

test('a settled invoice with a stale amount_paid does NOT re-bill the customer', () => {
  // Invoice 33 (quote 89), a real row: marked paid with amount_due 0.00, but
  // amount_paid only 242.45 of a 701.00 total and payments[] empty. Summing
  // amount_paid would have emailed this customer a $458.55 balance on a job
  // settled in June.
  const m = resolveOrderMoney(
    { estimated_price: 701, deposit_amount: 701, accepted_at: '2026-06-02', balance_paid_at: '2026-06-19' },
    [{ status: 'paid', total: 701.00, amount_paid: 242.45, amount_due: 0.00 }],
  );
  assert.equal(m.due, 0);
  assert.equal(m.collected, 701);
  assert.equal(m.paidInFull, true);
});

test('any one settled signal is enough — status, zero due, or paid >= total', () => {
  const byStatus = resolveOrderMoney({}, [{ status: 'paid', total: 100, amount_paid: 0, amount_due: 40 }]);
  assert.equal(byStatus.due, 0, "status 'paid' settles even when amount_due disagrees");

  const byDue = resolveOrderMoney({}, [{ status: 'sent', total: 100, amount_paid: 10, amount_due: 0 }]);
  assert.equal(byDue.due, 0, 'amount_due 0 settles even when amount_paid is short');

  const byPaid = resolveOrderMoney({}, [{ status: 'sent', total: 100, amount_paid: 100, amount_due: 25 }]);
  assert.equal(byPaid.due, 0, 'amount_paid >= total settles even when amount_due disagrees');
});

test('the quote can prove money the invoice never recorded', () => {
  // Quote 70: deposit stamped on the quote, invoice showing nothing paid.
  // The customer handed over 171; only the remainder of the bill is owed.
  const m = resolveOrderMoney(
    { estimated_price: 342, deposit_amount: 171, accepted_at: '2026-07-01', balance_paid_at: null },
    [{ status: 'sent', total: 439.56, amount_paid: 0, amount_due: 439.56 }],
  );
  assert.equal(m.total, 439.56, 'the bill is the invoice total, not the quote estimate');
  assert.equal(m.collected, 171, 'credit the deposit the quote recorded');
  assert.equal(m.due, 268.56);
});

test('what the quote claims collected can never exceed the bill', () => {
  const m = resolveOrderMoney(
    { estimated_price: 9999, deposit_amount: 9999, accepted_at: 'x', balance_paid_at: 'x' },
    [{ status: 'sent', total: 100, amount_paid: 0, amount_due: 100 }],
  );
  assert.equal(m.collected, 100);
  assert.equal(m.due, 0);
});

test('multiple invoices are summed, not picked — one job can carry several', () => {
  // Quote 126: 129.60 paid + 151.20 outstanding. Reading only the first
  // invoice would report the job settled when 151.20 is still owed.
  const m = resolveOrderMoney({ estimated_price: 160 }, [inv(129.60, 129.60, 'paid'), inv(151.20, 0, 'sent')]);
  assert.equal(m.total, 280.80);
  assert.equal(m.collected, 129.60);
  assert.equal(m.due, 151.20);
  assert.equal(m.paidInFull, false);
  assert.equal(m.invoiceCount, 2);
});

test('draft and cancelled invoices are not bills and never define the total', () => {
  assert.deepEqual(billableInvoices([inv(10, 0, 'draft'), inv(20, 0, 'cancelled'), inv(30, 0, 'sent')]).length, 1);
  const m = resolveOrderMoney({ estimated_price: 99 }, [inv(500, 0, 'draft'), inv(250, 0, 'cancelled')]);
  assert.equal(m.source, 'quote', 'ignored invoices must fall back to the quote');
  assert.equal(m.total, 99);
});

test('status casing and unknown statuses still count as bills', () => {
  const m = resolveOrderMoney({ estimated_price: 1 }, [inv(50, 25, 'PARTIAL'), inv(50, 0, 'overdue')]);
  assert.equal(m.source, 'invoice');
  assert.equal(m.total, 100);
  assert.equal(m.collected, 25);
});

test('an unaccepted quote has collected NOTHING, whatever deposit_amount says', () => {
  // send-price stamps the 50% ask on every quoted quote. Counting that as
  // money is how a quote nobody paid appeared under "Deposit Paid".
  const m = resolveOrderMoney({ estimated_price: 400, deposit_amount: 200, accepted_at: null, balance_paid_at: null });
  assert.equal(m.source, 'quote');
  assert.equal(m.collected, 0);
  assert.equal(m.due, 400);
  assert.equal(m.paidInFull, false);
});

test('once accepted, deposit_amount is real money — but never more than the total', () => {
  const m = resolveOrderMoney({ estimated_price: 400, deposit_amount: 200, accepted_at: '2026-10-01' });
  assert.equal(m.collected, 200);
  assert.equal(m.due, 200);

  // After a balance payment deposit_amount becomes cumulative-collected and
  // can exceed the total through rounding; it must not produce negative due.
  const over = resolveOrderMoney({ estimated_price: 400, deposit_amount: 450, accepted_at: '2026-10-01' });
  assert.equal(over.collected, 400);
  assert.equal(over.due, 0);
});

test('balance_paid_at settles the quote path in full', () => {
  const m = resolveOrderMoney({ estimated_price: 247.36, deposit_amount: 100, accepted_at: 'x', balance_paid_at: '2026-11-01' });
  assert.equal(m.collected, 247.36);
  assert.equal(m.due, 0);
  assert.equal(m.paidInFull, true);
});

test('cents survive summation — no float drift in what a customer owes', () => {
  const m = resolveOrderMoney({}, [inv(0.1, 0, 'sent'), inv(0.2, 0, 'sent')]);
  assert.equal(m.total, 0.3);
  assert.equal(m.due, 0.3);
});

test('nulls, junk and missing rows resolve to zero rather than NaN', () => {
  assert.deepEqual(resolveOrderMoney(null), { total: 0, collected: 0, due: 0, source: 'none', paidInFull: false, invoiceCount: 0 });
  const junk = resolveOrderMoney({ estimated_price: 'abc', deposit_amount: undefined, accepted_at: 'x' });
  assert.equal(junk.total, 0);
  assert.equal(junk.collected, 0);
  assert.equal(junk.due, 0);
  const badInv = resolveOrderMoney({ estimated_price: 5 }, [inv(null, undefined, 'sent')]);
  assert.equal(badInv.total, 0);
  assert.equal(badInv.due, 0);
});

test('a zero-total invoice is still the record, and is not "paid in full"', () => {
  const m = resolveOrderMoney({ estimated_price: 100 }, [inv(0, 0, 'sent')]);
  assert.equal(m.source, 'invoice');
  assert.equal(m.total, 0);
  assert.equal(m.paidInFull, false, 'nothing billed is not the same as nothing owed');
});

test('non-array invoice arguments are tolerated', () => {
  assert.equal(resolveOrderMoney({ estimated_price: 12 }, null).source, 'quote');
  assert.equal(resolveOrderMoney({ estimated_price: 12 }, undefined).total, 12);
});
