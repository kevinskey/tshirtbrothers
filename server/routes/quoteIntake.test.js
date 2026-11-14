import { test } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db.js';
import router, { invalidatePricingCache } from './instantQuote.js';

// Exercise the actual Express route callbacks with an isolated database double.
// No database, Stripe session, or customer notification is created.
const handler = path => router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
async function invoke(path, body) {
  let result;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { result = { status: this.statusCode, data }; return this; } };
  await handler(path)({ body }, res, err => { throw err; });
  return result;
}

test('calculate works without a date; explicit malformed dates return 400', async t => {
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('instant_quote_garments')) return { rows: [{ name: 'T-shirt', quality_tier: 'Standard', base_cost: 3, active: true }] };
    if (sql.includes('instant_quote_print_methods')) return { rows: [{ name: 'DTF', base_per_piece_cost: 4, setup_fee_per_color: 0, active: true }] };
    if (sql.includes('instant_quote_quantity_tiers')) return { rows: [{ min_qty: 1, max_qty: null, discount_pct: 0 }] };
    if (sql.includes('instant_quote_settings')) return { rows: [{ markup_multiplier: 2, standard_turnaround: 10 }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  invalidatePricingCache();
  const inputs = { garmentName: 'T-shirt', qualityTier: 'Standard', methodName: 'DTF', quantity: 1, numLocations: 1 };
  const result = await invoke('/calculate', inputs);
  assert.equal(result.status, 200);
  assert.equal(result.data.total, 14);
  assert.equal((await invoke('/calculate', { ...inputs, requested_need_by: '2026-02-31' })).status, 400);
  assert.equal((await invoke('/calculate', { ...inputs, requested_need_by: '2026-11-14' })).status, 200);
  // A client-supplied catalog price must never override our price table.
  assert.equal((await invoke('/calculate', { ...inputs, pickedProduct: { your_price: 0.02 } })).data.total, 14);
  invalidatePricingCache();
});

test('save rejects missing or impossible dates before acquiring a database connection', async t => {
  const connect = t.mock.method(pool, 'connect', () => { throw new Error('Must not connect'); });
  for (const date of [undefined, '', '2026-02-30', 'not-a-date']) {
    const result = await invoke('/save', { requested_need_by: date });
    assert.equal(result.status, 400);
    assert.match(result.data.error, /requested_need_by/);
  }
  assert.equal(connect.mock.callCount(), 0);
});

test('save persists date, separate garment selections, sleeve artwork and every mockup atomically', async t => {
  // Empty key makes notification attempts fail locally before the SDK can send.
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = '';
  t.after(() => { if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey; });
  const writes = [];
  const client = {
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes('INSERT INTO quotes')) return { rows: [{ id: 42, customer_name: 'Test Buyer', customer_email: 'test@example.invalid', created_at: new Date().toISOString() }] };
      if (sql.includes('SELECT id FROM products')) return { rows: [{ id: Number(params[0]) }] };
      return { rows: [] };
    },
    release: t.mock.fn(),
  };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT ss_id, name')) return { rows: [{ ss_id: params[0], name: `Product ${params[0]}`, base_price: '3.00' }] };
    if (sql.includes('instant_quote_garments')) return { rows: [{ name: 'T-shirt', quality_tier: 'Standard', base_cost: 3, active: true }] };
    if (sql.includes('instant_quote_print_methods')) return { rows: [{ name: 'DTF', base_per_piece_cost: 4, setup_fee_per_color: 0, active: true }] };
    if (sql.includes('instant_quote_quantity_tiers')) return { rows: [{ min_qty: 1, max_qty: null, discount_pct: 0 }] };
    if (sql.includes('instant_quote_settings')) return { rows: [{ markup_multiplier: 2, standard_turnaround: 10 }] };
    return { rows: [] };
  });
  invalidatePricingCache();
  const items = [123, 456].map((id, i) => ({
    inputs: { garmentName: 'T-shirt', qualityTier: 'Standard', methodName: 'DTF', productSsId: String(id), color: i ? 'Navy' : 'White', quantity: 2, numLocations: 1 },
    design_url: `https://example.com/art-${id}.png`,
    artwork_placements: ['front', 'right_sleeve'].map(placement => ({ url: `https://example.com/${id}-${placement}.png`, placement })),
    mockups: ['front', 'back', 'left_sleeve', 'right_sleeve'].map(placement => ({ url: `https://example.com/mockup-${id}-${placement}.png`, placement })),
  }));
  const result = await invoke('/save', { items, requested_need_by: '2026-12-15', customer_name: 'Test Buyer', customer_email: 'test@example.invalid', customer_phone: '5555551234', mockup_image_url_sleeve: 'https://test.digitaloceanspaces.com/sleeve.png' });
  assert.equal(result.status, 200);
  const header = writes.find(w => w.sql.includes('INSERT INTO quotes'));
  assert.match(header.sql, /date_needed/);
  assert.equal(header.params[13], '2026-12-15');
  assert.equal(header.params[14], 'https://test.digitaloceanspaces.com/sleeve.png');
  const stored = JSON.parse(header.params[5]);
  assert.equal(stored.requested_need_by, '2026-12-15');
  assert.equal(stored.items[0].mockups.length, 4);
  assert.equal(stored.items[1].picked_product.ss_id, '456');
  assert.equal(stored.items[0].inputs.numLocations, 2, 'sleeves cannot silently be priced as one side');
  const lines = writes.filter(w => w.sql.includes('INSERT INTO quote_items'));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(l => l.params[2]), [123, 456]);
  assert.deepEqual(lines.map(l => l.params[4]), ['White', 'Navy']);
  assert.deepEqual(JSON.parse(lines[0].params[7]), ['front', 'right_sleeve']);
  assert.equal(writes.at(-1).sql, 'COMMIT');
  assert.equal(client.release.mock.callCount(), 1);
  invalidatePricingCache();
});

test('an unavailable exact catalog product never silently falls back to tier pricing', async t => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const result = await invoke('/calculate', { productSsId: 'unavailable' });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /unavailable/);
  invalidatePricingCache();
});
