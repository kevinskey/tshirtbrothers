import { test } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db.js';
import dtf from './gangsheetStore.js';
import embroidery from './embroidery.js';
import quotes from './quotes.js';

async function call(router, path, body) {
  let result;
  const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { result = { code: this.code, data }; return this; } };
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route.stack.at(-1).handle;
  await handler({ body }, response, err => { throw err; });
  return result;
}

test('DTF, embroidery and legacy quote intake reject missing/impossible dates before DB/storage/payment work', async t => {
  const query = t.mock.method(pool, 'query', () => { throw Error('Invalid intake must not reach the database'); });
  const connect = t.mock.method(pool, 'connect', () => { throw Error('Invalid intake must not connect'); });
  for (const [router, path] of [[dtf, '/checkout'], [embroidery, '/embroidery/requests'], [quotes, '/']]) {
    for (const date_needed of [undefined, '', '2026-02-31', '2026-13-01', 'tomorrow']) {
      const result = await call(router, path, { date_needed });
      assert.equal(result.code, 400, `${path} ${date_needed}`);
      assert.match(result.data.error, /date/i);
    }
  }
  assert.equal(query.mock.callCount(), 0);
  assert.equal(connect.mock.callCount(), 0);
});

test('DTF checkout enforces artwork approval server-side, not just a disabled button', async t => {
  t.mock.method(pool, 'query', () => { throw Error('Must not query'); });
  for (const attested of [undefined, false, 'true', 1]) {
    const result = await call(dtf, '/checkout', { date_needed: '2026-12-15', attested });
    assert.equal(result.code, 400);
    assert.match(result.data.error, /agreement/);
  }
});
