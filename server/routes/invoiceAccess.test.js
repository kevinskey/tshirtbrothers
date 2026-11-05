// Run: node --test server/routes/invoiceAccess.test.js
//
// mayViewInvoice is the gate on the three unauthenticated invoice routes
// (GET /public/:id, GET /:id/pdf, POST /public/:id/create-checkout). Before
// it existed those routes took nothing but a sequential integer id and
// returned the customer's name, email, phone, street address, line items and
// balance — so `for id in 1..N` walked the whole invoice book.
//
// These tests exist to make the "no credential at all" case impossible to
// regress by accident, which is exactly how it was introduced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { mayViewInvoice } from './invoices.js';
import { invoiceViewUrl, invoicePdfUrl } from '../lib/invoiceLinks.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-invoice-access';

const TOKEN = 'a'.repeat(64);
const invoice = (over = {}) => ({
  id: 7,
  customer_email: 'Customer@Example.com',
  public_token: TOKEN,
  ...over,
});

const req = ({ token, bodyToken, user } = {}) => ({
  query: token ? { token } : {},
  body: bodyToken ? { token: bodyToken } : {},
  headers: user ? { authorization: `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}` } : {},
});

// ── The hole this closes ───────────────────────────────────────────────────

test('no token and no session is refused', () => {
  assert.equal(mayViewInvoice(req(), invoice()), false);
});

test('a wrong token is refused', () => {
  assert.equal(mayViewInvoice(req({ token: 'b'.repeat(64) }), invoice()), false);
});

test('an empty token is refused, not treated as a match', () => {
  assert.equal(mayViewInvoice(req({ token: '' }), invoice()), false);
});

// A row that somehow has no token must not become readable by everyone —
// the absent-vs-absent comparison has to fail, not pass.
test('an invoice with no stored token is not opened by an absent token', () => {
  assert.equal(mayViewInvoice(req(), invoice({ public_token: null })), false);
  assert.equal(mayViewInvoice(req({ token: TOKEN }), invoice({ public_token: null })), false);
});

// ── What must keep working ────────────────────────────────────────────────

test('the right token in the query string is accepted', () => {
  assert.equal(mayViewInvoice(req({ token: TOKEN }), invoice()), true);
});

test('the right token in a POST body is accepted (create-checkout)', () => {
  assert.equal(mayViewInvoice(req({ bodyToken: TOKEN }), invoice()), true);
});

// Mail scanners and chat apps tack punctuation onto URLs; tokenMatches
// strips it. Quote #221 arrived with `token=<hex>?` and 403'd.
test('a token mangled by a mail scanner still matches', () => {
  assert.equal(mayViewInvoice(req({ token: `${TOKEN}?` }), invoice()), true);
});

test('an admin session needs no token — the print view links without one', () => {
  const r = req({ user: { id: 1, email: 'kevin@tshirtbrothers.com', role: 'admin' } });
  assert.equal(mayViewInvoice(r, invoice()), true);
});

test('the customer whose invoice it is needs no token, case-insensitively', () => {
  const r = req({ user: { id: 2, email: 'customer@example.com', role: 'customer' } });
  assert.equal(mayViewInvoice(r, invoice()), true);
});

test('a different signed-in customer is refused', () => {
  const r = req({ user: { id: 3, email: 'someone@else.com', role: 'customer' } });
  assert.equal(mayViewInvoice(r, invoice()), false);
});

// Without this, every invoice whose customer_email is null would be readable
// by any signed-in account with no email claim.
test('a null customer_email does not match a tokenless session', () => {
  const r = req({ user: { id: 4, email: '', role: 'customer' } });
  assert.equal(mayViewInvoice(r, invoice({ customer_email: null })), false);
});

test('a forged token payload is refused — the signature is checked', () => {
  const unsigned = Buffer.from(JSON.stringify({ id: 9, role: 'admin' })).toString('base64url');
  const r = { query: {}, body: {}, headers: { authorization: `Bearer x.${unsigned}.x` } };
  assert.equal(mayViewInvoice(r, invoice()), false);
});

// ── The links we hand customers have to carry the token ───────────────────

test('customer-facing links carry the token', () => {
  const inv = invoice();
  assert.ok(invoiceViewUrl(inv, { domain: 'https://x.test' }).endsWith(`?token=${TOKEN}`));
  assert.ok(invoicePdfUrl(inv, { domain: 'https://x.test' }).endsWith(`?token=${TOKEN}`));
});

test('the relative PDF url used by the success page keeps the token', () => {
  assert.equal(invoicePdfUrl(invoice(), { absolute: false }), `/api/invoices/7/pdf?token=${TOKEN}`);
});

// Pre-migration rows have no token; the link must still render (the viewer
// falls back to confirming the recipient's email) rather than printing
// "undefined" into a customer's email.
test('a tokenless invoice yields a bare link, not "?token=undefined"', () => {
  const url = invoiceViewUrl(invoice({ public_token: null }), { domain: 'https://x.test' });
  assert.equal(url, 'https://x.test/invoice/view/7');
});
