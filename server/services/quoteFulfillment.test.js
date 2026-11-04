// Run: node --test server/services/quoteFulfillment.test.js
//
// Quote #293 (2026-11-04, Cheryl Maher): $504 of shirts plus a $35
// "Courier/Delivery Fee" line. Adding that fee never touched
// fulfillment_method, so it stayed 'pickup' and the balance-paid notice
// told the shop "PICKUP at the shop · Hand it over and hit Mark Picked Up"
// on an order the customer had paid us to drive to her.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentMode, hasDeliveryFee } from './quoteFulfillment.js';

const SHIRTS = { item_type: 'product', product_name: 'Unisex Heavy Cotton™ T-Shirt' };

test('quote #293: a courier fee line means delivery, not pickup', () => {
  const quote = { id: 293, fulfillment_method: 'pickup', shipping_method: 'pickup' };
  const items = [SHIRTS, { item_type: 'fee', product_name: 'Courier/Delivery Fee' }];
  assert.equal(fulfillmentMode(quote, items), 'delivery');
});

test('no fee line is still pickup', () => {
  const quote = { id: 1, fulfillment_method: 'pickup', shipping_method: 'pickup' };
  assert.equal(fulfillmentMode(quote, [SHIRTS]), 'pickup');
});

test('an explicit ship choice wins over a delivery fee', () => {
  // Someone picked the carrier on purpose; a fee line does not override it.
  const quote = { id: 2, fulfillment_method: 'ship' };
  const items = [SHIRTS, { item_type: 'fee', product_name: 'Delivery Fee' }];
  assert.equal(fulfillmentMode(quote, items), 'ship');
});

test('shipping_method = shipping also reads as ship', () => {
  assert.equal(fulfillmentMode({ id: 3, shipping_method: 'shipping' }, []), 'ship');
});

test('a product named "Delivery Driver Tee" is not a delivery fee', () => {
  // item_type gates the match, so garment names can say anything.
  const items = [{ item_type: 'product', product_name: 'Delivery Driver Tee' }];
  assert.equal(hasDeliveryFee(items), false);
  assert.equal(fulfillmentMode({ id: 4 }, items), 'pickup');
});

test('unrelated fee lines do not trigger delivery', () => {
  const items = [
    { item_type: 'fee', product_name: 'Digitization Fee' },
    { item_type: 'fee', product_name: 'Rush Fee' },
    { item_type: 'fee', product_name: 'Art Setup' },
  ];
  assert.equal(hasDeliveryFee(items), false);
});

test('the labels the shop actually types all match', () => {
  for (const name of [
    'Courier/Delivery Fee', 'Delivery fee', 'Local Delivery', 'Courier',
    'Drop-off fee', 'Drop off', 'DELIVERY',
  ]) {
    assert.equal(hasDeliveryFee([{ item_type: 'fee', product_name: name }]), true, name);
  }
});

test('missing or junk input never throws', () => {
  assert.equal(fulfillmentMode(null, []), 'pickup');
  assert.equal(fulfillmentMode({ id: 5 }, null), 'pickup');
  assert.equal(hasDeliveryFee([null, {}, { item_type: 'fee' }]), false);
});
