import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerDtfOrdersRouter } from './customerDtfOrders.js';

async function call(router, path, req) {
  let result;
  const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { result = { code: this.code, data }; return this; } };
  const handler = router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
  await handler(req, response, err => { throw err; });
  return result;
}

test('DTF order library requires authentication before any database lookup', async () => {
  const router = createCustomerDtfOrdersRouter({ db: { query() { throw Error('Must not query'); } } });
  let code;
  await router.stack[0].handle({ headers: {} }, { status(c) { code = c; return this; }, json() {} }, () => { throw Error('Must not authenticate'); });
  assert.equal(code, 401);
});

test('listing uses current account identity, excludes unpaid orders and omits production keys', async () => {
  const router = createCustomerDtfOrdersRouter({ db: {
    async query(sql, params) {
      assert.deepEqual(params, [7]);
      assert.match(sql, /FROM users WHERE id = \$1 AND deleted_at IS NULL/);
      assert.match(sql, /status IN \('paid'/);
      return { rows: [{ id: 22, file_key: 'private-key', date_needed: '2026-12-15' }] };
    },
  }, sign() { throw Error('Listing should not need storage'); } });
  const response = await call(router, '/', { user: { id: 7 }, query: { email: 'someone-else@example.com' } });
  assert.equal(response.code, 200);
  assert.equal(response.data[0].id, 22);
  assert.equal(response.data[0].date_needed, '2026-12-15');
  assert.equal('file_key' in response.data[0], false);
  assert.equal('file_key' in response.data[0].sheets[0], false);
});

test('missing or another customer order never receives a signed download', async () => {
  let signed = false;
  const router = createCustomerDtfOrdersRouter({ db: {
    async query(sql, params) {
      assert.deepEqual(params, [7, 99]);
      assert.match(sql, /WHERE \(user_id = \$1 OR/);
      assert.match(sql, /AND id = \$2/);
      return { rows: [] };
    },
  }, sign() { signed = true; } });
  const result = await call(router, '/:id', { user: { id: 7 }, params: { id: '99' } });
  assert.equal(result.code, 404);
  assert.equal(signed, false);
});

test('owner gets original print file and dimensions for a fresh reorder', async () => {
  const order = { id: 22, file_key: 'production-file', width_in: 34, file_width_px: 10200, file_height_px: 3600, length_ft: 1 };
  const router = createCustomerDtfOrdersRouter({ db: { async query() { return { rows: [order] }; } }, sign: async value => {
    assert.equal(value.file_key, order.file_key);
    assert.equal(value.id, order.id);
    assert.equal(value.sheet_index, 0);
    return 'https://storage.example/signed';
  } });
  const response = await call(router, '/:id', { user: { id: 7 }, params: { id: '22' } });
  assert.equal(response.data.download_url, 'https://storage.example/signed');
  assert.equal(response.data.file_key, order.file_key);
  assert.equal(response.data.width_in, 34);
});

test('invalid order identifiers are rejected without database or storage', async () => {
  const router = createCustomerDtfOrdersRouter({ db: { query() { throw Error('Must not query'); } } });
  for (const id of ['abc', '-1', '1.2', '9007199254740992']) {
    assert.equal((await call(router, '/:id', { user: { id: 7 }, params: { id } })).code, 404);
  }
});

test('every sheet in a purchased cart gets an owner-only download and its original copy count', async () => {
  const manifest = [{ file_key: 'sheet-a', width_in: 22, copies: 2 }, { file_key: 'sheet-b', width_in: 34, copies: 4 }];
  const signed = [];
  const router = createCustomerDtfOrdersRouter({ db: { async query() { return { rows: [{ id: 88, sheets_json: manifest }] }; } },
    sign: async order => { signed.push(order.file_key); return `https://example.com/${order.file_key}`; } });
  const result = await call(router, '/:id', { user: { id: 7 }, params: { id: '88' } });
  assert.deepEqual(signed, ['sheet-a', 'sheet-b']);
  assert.deepEqual(result.data.sheets.map(sheet => sheet.copies), [2, 4]);
  assert.equal(result.data.sheets[1].download_url, 'https://example.com/sheet-b');
});
