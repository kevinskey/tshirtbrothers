import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeAbandonedDtfOrders } from './dtfRetention.js';

test('abandoning a reorder retains the original paid production file', async () => {
  const removed = [];
  const db = { async query(sql, params) {
    if (sql.startsWith('DELETE')) {
      assert.match(sql, /status = 'pending_payment'/);
      assert.match(sql, /24 hours/);
      return { rows: [{ id: 2, file_key: 'paid-original.png' }] };
    }
    assert.deepEqual(params, ['paid-original.png']);
    return { rows: [{ '?column?': 1 }] }; // Original paid order still references it.
  } };
  assert.equal(await purgeAbandonedDtfOrders({ db, removeFile: async key => removed.push(key) }), 1);
  assert.deepEqual(removed, []);
});

test('unreferenced abandoned uploads are deleted once even with multiple expired carts', async () => {
  const removed = [];
  const db = { async query(sql) {
    return sql.startsWith('DELETE') ? { rows: [{ id: 1, file_key: 'orphan.png' }, { id: 2, file_key: 'orphan.png' }] } : { rows: [] };
  } };
  assert.equal(await purgeAbandonedDtfOrders({ db, removeFile: async key => removed.push(key) }), 2);
  assert.deepEqual(removed, ['orphan.png']);
});
