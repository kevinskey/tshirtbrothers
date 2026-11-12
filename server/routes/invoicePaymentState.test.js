// Run: node --test server/routes/invoicePaymentState.test.js
// Exercise the real imported route handlers and shared helper, with every
// database entry point mocked. No Stripe request, receipt, SMS, or database
// connection is made. SQL assertions cover emitted queries, not execution
// against PostgreSQL; integration tests remain a separate check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pool from '../db.js';
import invoicesRouter from './invoices.js';
import orderDetailRouter from './orderDetail.js';
import { applyPaymentToInvoice } from './payments.js';
import { ensureOrderForInvoice, promoteOrderForInvoicePayment } from '../lib/orderFromInvoice.js';

const syncSql = /WITH invoice_money AS/;
const invoice = (over = {}) => ({
  id: 901, quote_id: 801, invoice_number: 'INV-TEST-001',
  total: '100.00', amount_paid: '0.00', amount_due: '100.00',
  status: 'draft', payments: [], customer_email: null, customer_phone: null,
  ...over,
});
const quote = (over = {}) => ({ id: 801, status: 'quoted', accepted_at: null, balance_paid_at: null, ...over });

function handler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} exists`);
  return layer.route.stack.at(-1).handle;
}
async function call(router, method, path, body, params = { id: '901' }) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(router, method, path)({ body, params, user: { email: 'unit@example.test' } }, res, (error) => { throw error; });
  return res;
}

// Unexpected queries are retained as failures even if production code catches
// a best-effort error. The t.after assertion prevents swallowed false passes.
function database(t, steps) {
  const remaining = [...steps], failures = [];
  t.mock.method(pool, 'connect', async () => { throw new Error('Unexpected database connection'); });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected external request'); });
  t.mock.method(pool, 'query', async (sql, args) => {
    try {
      const step = remaining.shift();
      assert.ok(step, `Unexpected query: ${sql}`);
      assert.match(sql, step.match);
      if (step.check) step.check(args, sql);
      if (step.error) throw step.error;
      return { rows: step.rows || [], rowCount: (step.rows || []).length };
    } catch (error) {
      if (!steps.some((step) => step.error === error)) failures.push(error);
      throw error;
    }
  });
  t.after(() => {
    assert.equal(remaining.length, 0, 'all expected database operations ran');
    assert.deepEqual(failures, [], 'no unexpected database operations were swallowed');
  });
}

for (const fixture of [
  { name: 'partial', prior: '0', amount: '40', paid: 40, due: 60, status: 'partial' },
  { name: 'full', prior: '40', amount: '60', paid: 100, due: 0, status: 'paid' },
  { name: 'cent-exact final balance', total: '50.13', prior: '25.07', amount: '25.06', paid: 50.13, due: 0, status: 'paid' },
]) {
  test(`invoice record-payment: ${fixture.name} records the correct amount and synchronizes the order`, async (t) => {
    const original = invoice({ total: fixture.total || '100', amount_paid: fixture.prior });
    const updated = invoice({ amount_paid: fixture.paid, amount_due: fixture.due, status: fixture.status });
    database(t, [
      { match: /SELECT \* FROM invoices/, rows: [original] },
      { match: /UPDATE invoices SET/, rows: [updated], check(args) {
        assert.equal(args[1], fixture.paid);
        assert.equal(args[2], fixture.due);
        assert.equal(args[3], fixture.status);
        assert.equal(JSON.parse(args[4]).at(-1).amount, Number(fixture.amount));
      } },
      { match: syncSql, rows: [quote()], check(args) { assert.deepEqual(args, [801]); } },
    ]);
    const res = await call(invoicesRouter, 'post', '/:id/record-payment', { amount: fixture.amount });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, fixture.status);
  });
}

for (const amount of [0, -1, 'not-a-number', Infinity]) {
  test(`invoice record-payment rejects invalid amount ${String(amount)} before touching the database`, async (t) => {
    database(t, []);
    const res = await call(invoicesRouter, 'post', '/:id/record-payment', { amount });
    assert.equal(res.statusCode, 400);
  });
}

test('invoice record-payment rejects an unapproved overpayment without stamping the order', async (t) => {
  database(t, [{ match: /SELECT \* FROM invoices/, rows: [invoice({ amount_paid: '40' })] }]);
  const res = await call(invoicesRouter, 'post', '/:id/record-payment', { amount: '70' });
  assert.equal(res.statusCode, 409);
});

test('invoice edit reopens a paid balance and synchronizes the linked order', async (t) => {
  database(t, [
    { match: /SELECT \* FROM invoices/, rows: [invoice({ amount_paid: '100', amount_due: '0', status: 'paid' })] },
    { match: /UPDATE invoices SET/, rows: [invoice({ total: '150', amount_paid: '100', amount_due: '50', status: 'partial' })], check(args) {
      assert.equal(args[11], 50);
      assert.equal(args[14], 'partial');
    } },
    { match: syncSql, rows: [quote({ status: 'accepted' })] },
  ]);
  const res = await call(invoicesRouter, 'put', '/:id', { total: 150 });
  assert.equal(res.body.amount_due, '50');
  assert.equal(res.body.status, 'partial');
});

test('invoice edit settling the balance also synchronizes the linked order', async (t) => {
  database(t, [
    { match: /SELECT \* FROM invoices/, rows: [invoice({ amount_paid: '40', amount_due: '60', status: 'partial' })] },
    { match: /UPDATE invoices SET/, rows: [invoice({ total: '40', amount_paid: '40', amount_due: '0', status: 'paid' })], check(args) {
      assert.equal(args[11], 0); assert.equal(args[14], 'paid');
    } },
    { match: syncSql, rows: [quote({ balance_paid_at: 'now' })] },
  ]);
  const res = await call(invoicesRouter, 'put', '/:id', { total: 40 });
  assert.equal(res.body.status, 'paid');
});

test('order-page offline payment rounds the final cents and returns shared reconciliation results', async (t) => {
  const synchronized = quote({ status: 'ready', accepted_at: 'earlier', balance_paid_at: 'now' });
  database(t, [
    { match: /SELECT \* FROM quotes/, rows: [quote({ status: 'ready', estimated_price: '50.13' })] },
    { match: /SELECT \* FROM invoices/, rows: [invoice({ total: '50.13', amount_paid: '25.07', amount_due: '25.06' })] },
    { match: /UPDATE invoices SET/, rows: [invoice({ total: '50.13', amount_paid: '50.13', amount_due: '0', status: 'paid' })], check(args, sql) {
      assert.equal(args[1], 50.13); assert.equal(args[2], 0);
      assert.equal(JSON.parse(args[3]).at(-1).amount, 25.06);
      assert.match(sql, /CASE WHEN \$3::numeric <= 0/,
        'PostgreSQL must not infer integer for a numeric balance reused in CASE');
    } },
    { match: /UPDATE quotes SET deposit_amount/, rows: [quote({ status: 'ready' })] },
    { match: syncSql, rows: [synchronized], check(args) { assert.deepEqual(args, ['801']); } },
  ]);
  const res = await call(orderDetailRouter, 'post', '/:quoteId/offline-payment', { amount: '25.06' }, { quoteId: '801' });
  assert.equal(res.body.invoice.status, 'paid');
  assert.deepEqual(res.body.quote, synchronized, 'do not return the stale pre-reconciliation quote');
});

test('order-page payment does not override an outstanding second invoice', async (t) => {
  const synchronized = quote({ status: 'in_production', accepted_at: 'earlier', balance_paid_at: null });
  database(t, [
    { match: /SELECT \* FROM quotes/, rows: [quote({ status: 'in_production', estimated_price: '100' })] },
    { match: /SELECT \* FROM invoices/, rows: [invoice({ total: '100', amount_paid: '40' })] },
    { match: /UPDATE invoices SET/, rows: [invoice({ amount_paid: '100', amount_due: '0', status: 'paid' })] },
    { match: /UPDATE quotes SET deposit_amount/, rows: [quote({ status: 'in_production' })] },
    { match: syncSql, rows: [synchronized] },
  ]);
  const res = await call(orderDetailRouter, 'post', '/:quoteId/offline-payment', { amount: 60 }, { quoteId: '801' });
  assert.equal(res.body.quote.balance_paid_at, null);
  assert.equal(res.body.quote.status, 'in_production');
});

test('Stripe replay retries a failed order update without booking the payment again', async (t) => {
  const paid = invoice({ amount_paid: 100, amount_due: 0, status: 'paid', payments: [{ amount: 100, payment_intent_id: 'pi_test' }] });
  const transientError = new Error('simulated order update failure');
  t.mock.method(console, 'error', () => {});
  database(t, [
    { match: /SELECT \* FROM invoices/, rows: [invoice()] },
    { match: /UPDATE invoices SET/, rows: [paid], check(args) {
      assert.equal(args[1], 100); assert.equal(args[2], 0);
      assert.equal(JSON.parse(args[4]).length, 1);
    } },
    { match: syncSql, error: transientError },
    { match: /INSERT INTO activity_events/ },
    { match: /SELECT \* FROM invoices/, rows: [paid] },
    { match: syncSql, rows: [quote({ status: 'accepted', balance_paid_at: 'now' })] },
  ]);
  await applyPaymentToInvoice({ invoiceId: 901, amount: 100, paymentIntentId: 'pi_test' });
  const replay = await applyPaymentToInvoice({ invoiceId: 901, amount: 100, paymentIntentId: 'pi_test' });
  assert.equal(replay.amount_paid, 100);
  assert.equal(replay.payments.length, 1);
});

test('new standalone invoice creates an unpaid quote and then synchronizes it', async (t) => {
  const created = invoice({ quote_id: null, created_at: '2026-11-11T12:00:00Z', items: [] });
  database(t, [
    { match: /SELECT invoice_number FROM invoices/ },
    { match: /INSERT INTO invoices/, rows: [created], check(args, sql) {
      assert.match(sql, /\$11,0,\$12/); assert.match(sql, /'draft'/);
    } },
    { match: syncSql, rows: [quote()] },
  ]);
  const transactionSteps = [
    /^BEGIN$/, /SELECT id FROM quotes WHERE source_invoice_id/,
    /INSERT INTO quotes/, /UPDATE invoices SET quote_id/, /^COMMIT$/,
  ];
  let released = false;
  const client = { async query(sql, args) {
    assert.match(sql, transactionSteps.shift());
    if (sql.includes('INSERT INTO quotes')) {
      assert.equal(args[6], 'quoted'); assert.equal(args[8], null);
      return { rows: [{ id: 801 }] };
    }
    return { rows: [] };
  }, release() { released = true; } };
  t.mock.method(pool, 'connect', async () => client);
  const res = await call(invoicesRouter, 'post', '/', { customer_name: 'Unit Test', customer_email: 'unit@example.test', total: 100, items: [] });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.quote_id, 801);
  assert.equal(res.body.amount_paid, '0.00');
  assert.equal(transactionSteps.length, 0);
  assert.equal(released, true);
});

test('already-linked invoices are not recreated or rewritten', async (t) => {
  database(t, []);
  assert.equal(await ensureOrderForInvoice(invoice()), 801);
});

test('shared payment SQL requires money, aggregates every due separately, and preserves production stages', async (t) => {
  const returned = quote({ status: 'ready', accepted_at: 'earlier' });
  database(t, [{ match: syncSql, rows: [returned], check(args, sql) {
    assert.deepEqual(args, [801]);
    assert.match(sql, /SUM\(GREATEST\(amount_due, 0\)\)/);
    assert.match(sql, /WHERE quote_id = \$1/);
    assert.match(sql, /m\.paid > 0 AND m\.due <= 0/);
    assert.match(sql, /WHEN m\.due > 0 AND q\.status = 'paid' THEN 'accepted'/);
    assert.match(sql, /'in_production','ready','completed'/);
    assert.match(sql, /ELSE q\.status END/);
    assert.match(sql, /ELSE NULL END/);
    assert.match(sql, /RETURNING q\.\*/);
  } }]);
  assert.deepEqual(await promoteOrderForInvoicePayment(801), returned);
});

test('order page cannot net an invoice overpayment against another invoice due or trust a stale full-payment stamp', () => {
  const source = readFileSync(new URL('../../client/src/pages/AdminOrderDetailPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /invoices\.reduce\(\(s, i\) => s \+ Math\.max\(0, Number\(i\.amount_due \|\| 0\)\), 0\)/);
  assert.match(source, /label: 'Final payment', done: totalDue <= 0 && totalPaid > 0/);
});
