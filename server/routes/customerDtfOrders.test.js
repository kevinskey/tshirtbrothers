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
  assert.deepEqual(response.data, [{ id: 22, date_needed: '2026-12-15' }]);
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
    assert.deepEqual(value, order); return 'https://storage.example/signed';
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
