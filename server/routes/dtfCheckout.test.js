import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDtfCheckoutHandler } from './gangsheetStore.js';
const file = (w, h) => `gangsheet-orders/2026-11/abc-${w}x${h}.png`;
const settings = { min_ft: 1, max_ft: 10, standard_active: true, width_34_active: true,
  rate_standard_cents: 600, rate_34_standard_cents: 900, shipping_flat_cents: 1200,
  cutoff_rush: '12:00', cutoff_hot_rush: '10:00' };
const base = { date_needed: '2026-12-15', attested: true, name: 'Buyer', email: 'buyer@example.invalid', phone: '5555551234', tier: 'standard' };
function harness({ missing = false } = {}) {
  const writes = [], checked = [], sessions = [];
  const handler = createDtfCheckoutHandler({ settings: async () => settings,
    ensureBuyer: async () => 7,
    db: { async query(sql, params) { writes.push({ sql, params }); return { rows: sql.includes('INSERT INTO gang_sheet_orders') ? [{ id: 42 }] : [] }; } },
    headFile: async key => { checked.push(key); if (missing === true || missing === key) { const err = Error('Missing'); err.name = 'NotFound'; throw err; } },
    stripeClient: () => ({ checkout: { sessions: { async create(body, options) { sessions.push({ body, options }); return { id: 'cs_test', url: 'https://stripe.example/test' }; } } } }),
  });
  return { writes, checked, sessions, async call(body) {
    let result; const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { result = { code: this.code, data }; return this; } };
    await handler({ body: { ...base, ...body } }, res, err => { throw err; }); return result;
  } };
}

test('two files, multiple copies, one shipping charge and one full-payment session', async () => {
  const h = harness();
  const result = await h.call({ delivery: 'ship', ship_address: { line1: '1 Main St', city: 'Fairburn', state: 'GA', zip: '30213' },
    sheets: [{ file_key: file(6600, 3600), length_ft: 1, copies: 3 }, { file_key: file(10200, 7200), length_ft: 2, copies: 2 }] });
  assert.equal(result.code, 200);
  assert.equal(h.checked.length, 2);
  const insert = h.writes.find(w => w.sql.includes('INSERT INTO gang_sheet_orders'));
  assert.equal(insert.params[7], 5400);
  assert.equal(insert.params[8], 1200);
  const sheets = JSON.parse(insert.params[19]);
  assert.equal(sheets.length, 2); assert.equal(sheets[1].copies, 2);
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].body.mode, 'payment');
  assert.equal(h.sessions[0].body.metadata.gang_sheet_order_id, '42');
  const lines = h.sessions[0].body.line_items;
  assert.deepEqual(lines.map(l => [l.price_data.unit_amount, l.quantity]), [[600, 3], [1800, 2], [1200, 1]]);
  assert.equal(lines.reduce((sum, l) => sum + l.price_data.unit_amount * l.quantity, 0), 6600);
});

test('legacy single-sheet request remains compatible', async () => {
  const h = harness(); const result = await h.call({ file_key: file(6600, 3600), length_ft: 1 });
  assert.equal(result.code, 200); assert.equal(h.sessions[0].body.line_items.length, 1);
});

test('one invalid or missing file prevents any order/payment creation', async () => {
  const invalid = harness();
  assert.equal((await invalid.call({ sheets: [{ file_key: file(6600, 3600), length_ft: 1 }, { file_key: file(10200, 7200), length_ft: 1 }] })).code, 400);
  assert.equal(invalid.writes.length, 0); assert.equal(invalid.sessions.length, 0);
  const missing = harness({ missing: true });
  assert.equal((await missing.call({ file_key: file(6600, 3600), length_ft: 1 })).code, 400);
  assert.equal(missing.writes.length, 0); assert.equal(missing.sessions.length, 0);
  const laterMissing = harness({ missing: file(10200, 3600) });
  assert.equal((await laterMissing.call({ sheets: [
    { file_key: file(6600, 3600), length_ft: 1 }, { file_key: file(10200, 3600), length_ft: 1 },
  ] })).code, 400);
  assert.equal(laterMissing.writes.some(write => write.sql.includes('INSERT')), false);
  assert.equal(laterMissing.sessions.length, 0);
});

test('admin cannot send unpaid or canceled DTF carts to production', async t => {
  const { default: router } = await import('./gangsheetStore.js');
  const { default: pool } = await import('../db.js');
  let status = 'pending_payment';
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 42, status }] }));
  const handler = router.stack.find(layer => layer.route?.path === '/admin/orders/:id/send-to-vendor').route.stack.at(-1).handle;
  for (const value of ['pending_payment', 'canceled']) {
    status = value; let code;
    await handler({ body: { vendor_email: 'printer@example.invalid' }, params: { id: 42 } }, {
      status(value) { code = value; return this; }, json(data) { assert.match(data.error, /Payment must clear/); },
    }, err => { throw err; });
    assert.equal(code, 409);
  }
});
