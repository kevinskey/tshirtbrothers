// Run: node --test server/routes/invoices.test.js
//
// computeAmountOwed decides what a customer is asked for when they hit Pay
// Now on an invoice. It is the single source of that number for the emailed
// invoice, the public invoice payload, and the Stripe session — if those ever
// disagreed, the customer would be shown one figure and charged another.
//
// NUMERIC columns come back from node-postgres as strings, so the fixtures
// use strings wherever the real rows would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAmountOwed } from './invoices.js';

const invoice = (over = {}) => ({
  id: 1,
  invoice_number: 'INV-20260911-001',
  customer_name: 'Test Customer',
  total: '400.00',
  amount_paid: '0',
  deposit_percent: '0',
  ...over,
});

test('no deposit configured: asks for the whole total', () => {
  const owed = computeAmountOwed(invoice());
  assert.equal(owed.amount, 400);
  assert.equal(owed.paymentType, 'full');
});

test('deposit configured and nothing collected: asks for the deposit only', () => {
  const owed = computeAmountOwed(invoice({ deposit_percent: '50' }));
  assert.equal(owed.amount, 200);
  assert.equal(owed.paymentType, 'deposit');
  assert.equal(owed.depositPercent, 50);
});

test('deposit already collected: asks for the remaining balance', () => {
  const owed = computeAmountOwed(invoice({ deposit_percent: '50', amount_paid: '200.00' }));
  assert.equal(owed.amount, 200);
  assert.equal(owed.paymentType, 'balance');
});

test('partial payment with no deposit configured: asks for what is left', () => {
  const owed = computeAmountOwed(invoice({ amount_paid: '150.00' }));
  assert.equal(owed.amount, 250);
  assert.equal(owed.paymentType, 'balance');
});

test('paid in full: owes nothing, so callers suppress the Pay button', () => {
  const owed = computeAmountOwed(invoice({ amount_paid: '400.00' }));
  assert.equal(owed.amount, 0);
  assert.ok(owed.amount <= 0);
});

test('overpayment does not produce a negative charge the page would offer', () => {
  const owed = computeAmountOwed(invoice({ amount_paid: '450.00' }));
  assert.ok(owed.amount <= 0, 'must not be offered as a payable amount');
});

test('a deposit percentage that does not divide evenly still rounds to cents', () => {
  const owed = computeAmountOwed(invoice({ total: '100.01', deposit_percent: '33' }));
  assert.equal(owed.amount, 33.0);
  // Whatever it is, Stripe must be able to take it as a whole number of cents.
  assert.equal(Math.round(owed.amount * 100), owed.amount * 100);
});

test('null deposit_percent is treated as no deposit, not NaN', () => {
  const owed = computeAmountOwed(invoice({ deposit_percent: null }));
  assert.equal(owed.amount, 400);
  assert.equal(owed.paymentType, 'full');
});
