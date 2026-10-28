// Run: node --test server/routes/payments.test.js
//
// reconcileInvoicePayments decides what an invoice reads after a Stripe
// charge clears: the payment list, amount_paid, amount_due, and whether the
// order counts as settled (which in turn gates the paid-in-full receipt and
// the quote's balance_paid_at stamp).
//
// It exists because the old inline version "reconstructed" payment history —
// if a charge came in short of the total it invented a deposit entry for the
// difference, assuming a deposit had been collected earlier. On 2026-10-13
// quotes #215 (John Brown) and #221 (Kristyn Evans) each paid a single 50%
// charge through the balance route. Both were booked as paid in full,
// inventing ~$1,094 of revenue that never cleared Stripe, and both customers
// got a paid-in-full receipt for a half-paid order.
//
// The rule under test: only money we can actually account for — prior
// recorded payments plus this charge — ever reaches the invoice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInvoicePayments } from './payments.js';

const DATE = '2026-10-13T18:00:21.093Z';

test('short charge with nothing recorded stays partial — no invented deposit', () => {
  // Quote #215 exactly: $1,848.17 order, one $924.09 charge, no prior record.
  const book = reconcileInvoicePayments({
    total: 1848.17,
    priorPayments: [],
    chargeAmount: 924.09,
    chargeDate: DATE,
  });
  assert.equal(book.payments.length, 1, 'must not fabricate a second payment');
  assert.equal(book.payments[0].amount, 924.09);
  assert.equal(book.amountPaid, 924.09);
  assert.equal(book.amountDue, 924.08);
  assert.equal(book.status, 'partial');
  assert.equal(book.settled, false, 'a half-paid order is never settled');
});

test('quote #221 regression: $170.24 against $340.49 leaves $170.25 due', () => {
  const book = reconcileInvoicePayments({
    total: 340.49,
    priorPayments: [],
    chargeAmount: 170.24,
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 170.24);
  assert.equal(book.amountDue, 170.25);
  assert.equal(book.settled, false);
});

test('a real recorded deposit plus the balance charge settles the invoice', () => {
  const book = reconcileInvoicePayments({
    total: 1848.17,
    priorPayments: [{ amount: 924.08, method: 'stripe', note: 'deposit', date: '2026-10-06T12:00:00.000Z' }],
    chargeAmount: 924.09,
    chargeDate: DATE,
  });
  assert.equal(book.payments.length, 2, 'keeps the genuine deposit, appends the charge');
  assert.equal(book.amountPaid, 1848.17);
  assert.equal(book.amountDue, 0);
  assert.equal(book.status, 'paid');
  assert.equal(book.settled, true);
});

test('full payment in one charge settles the invoice', () => {
  const book = reconcileInvoicePayments({
    total: 788,
    priorPayments: [],
    chargeAmount: 788,
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 788);
  assert.equal(book.amountDue, 0);
  assert.equal(book.settled, true);
  assert.equal(book.depositPercent, 100);
});

test('overpayment never reports a negative amount due', () => {
  const book = reconcileInvoicePayments({
    total: 100,
    priorPayments: [{ amount: 80 }],
    chargeAmount: 40,
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 120);
  assert.equal(book.amountDue, 0);
  assert.equal(book.settled, true);
  assert.equal(book.depositPercent, 100, 'clamped, never above 100');
});

test('NUMERIC columns arriving as strings still add up', () => {
  // node-postgres hands back NUMERIC as strings, so the real rows look like this.
  const book = reconcileInvoicePayments({
    total: '340.49',
    priorPayments: [{ amount: '170.24' }],
    chargeAmount: '170.25',
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 340.49);
  assert.equal(book.amountDue, 0);
  assert.equal(book.settled, true);
});

test('junk entries in stored payment history are ignored, not counted as 0 or NaN', () => {
  const book = reconcileInvoicePayments({
    total: 200,
    priorPayments: [{ amount: 100 }, null, { note: 'no amount' }, { amount: 'abc' }],
    chargeAmount: 50,
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 150, 'only the parseable entries count');
  assert.equal(book.amountDue, 50);
  assert.equal(book.settled, false);
});

test('rounding: three charges that sum to the total settle exactly', () => {
  const book = reconcileInvoicePayments({
    total: 100,
    priorPayments: [{ amount: 33.33 }, { amount: 33.33 }],
    chargeAmount: 33.34,
    chargeDate: DATE,
  });
  assert.equal(book.amountPaid, 100);
  assert.equal(book.amountDue, 0);
  assert.equal(book.settled, true);
});

test('deposit percent reflects what was actually collected', () => {
  const book = reconcileInvoicePayments({
    total: 1848.17,
    priorPayments: [],
    chargeAmount: 924.09,
    chargeDate: DATE,
  });
  assert.equal(book.depositPercent, 50);
});

test('zero-total invoice does not divide by zero', () => {
  const book = reconcileInvoicePayments({
    total: 0,
    priorPayments: [],
    chargeAmount: 0,
    chargeDate: DATE,
  });
  assert.equal(book.depositPercent, 0);
  assert.equal(book.amountDue, 0);
  assert.equal(book.settled, true);
});
