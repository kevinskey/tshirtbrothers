import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendPurchasedDtfSheets } from './dtfVendor.js';

test('vendor receives all purchased files with explicit copy counts, including split pages', async () => {
  const order = { id: 88, sheets_json: [{ file_key: 'a', copies: 2, width_px: 6600 }, { file_key: 'b', copies: 3, width_px: 10200 }] };
  const sent = [], split = [];
  const files = await sendPurchasedDtfSheets(order, { vendorName: 'Printer', vendorEmail: 'printer@example.invalid', note: 'Match order' }, {
    split: async spec => { split.push(spec); return spec.fileKey === 'b' ? [{ key: 'b-page1' }, { key: 'b-page2' }] : null; },
    sign: async key => `https://example.com/${key}`,
    send: async spec => { sent.push(spec); },
  });
  assert.equal(split.length, 2); assert.equal(sent.length, 1);
  assert.match(sent[0].note, /Print 2 copies/); assert.match(split[1].note, /Print 3 copies/);
  assert.deepEqual(files.map(file => [file.key, file.copies]), [['a', 2], ['b-page1', 3], ['b-page2', 3]]);
});

test('a failed sheet send propagates; callers cannot mark the whole cart sent', async () => {
  await assert.rejects(() => sendPurchasedDtfSheets({ id: 1, sheets_json: [{ file_key: 'a', copies: 1 }] }, {}, {
    split: async () => null, sign: async () => 'https://example.com/a', send: async () => { throw Error('Vendor unavailable'); },
  }), /Vendor unavailable/);
});
