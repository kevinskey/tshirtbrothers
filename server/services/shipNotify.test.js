// Whether a customer gets a "your order shipped" email. Four code paths
// now call into this, so the rule has to live in one testable place: the
// failure modes are emailing a buyer twice, emailing them a tracking link
// that doesn't exist, or going quiet on an order that actually shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shippedEmailDecision } from './shipNotify.js';

const ready = {
  id: 1,
  email: 'buyer@example.com',
  tracking_number: '9400111899223197428490',
  shipped_email_sent_at: null,
  fulfillment_type: 'ship',
};

test('sends when there is an email and a tracking number', () => {
  assert.deepEqual(shippedEmailDecision(ready), { send: true, reason: 'ok' });
});

test('never sends twice — this is the whole reason the service exists', () => {
  const sent = { ...ready, shipped_email_sent_at: '2026-10-24T12:00:00Z' };
  assert.deepEqual(shippedEmailDecision(sent), { send: false, reason: 'already_sent' });
});

test('force re-sends an already-sent notice', () => {
  const sent = { ...ready, shipped_email_sent_at: '2026-10-24T12:00:00Z' };
  assert.equal(shippedEmailDecision(sent, { force: true }).send, true);
});

test('no tracking number means no email', () => {
  // "Your package is on its way" with nothing to click is worse than
  // silence — and this is the state right after a label is voided.
  assert.deepEqual(
    shippedEmailDecision({ ...ready, tracking_number: null }),
    { send: false, reason: 'no_tracking' },
  );
});

test('pickup orders are never told they shipped', () => {
  assert.deepEqual(
    shippedEmailDecision({ ...ready, fulfillment_type: 'pickup' }),
    { send: false, reason: 'pickup' },
  );
  // Quotes spell the same idea with a different column.
  assert.deepEqual(
    shippedEmailDecision({ ...ready, fulfillment_type: null, fulfillment_method: 'pickup' }),
    { send: false, reason: 'pickup' },
  );
});

test('pickup wins over force — forcing is for re-sending, not for inventing', () => {
  assert.equal(
    shippedEmailDecision({ ...ready, fulfillment_type: 'pickup' }, { force: true }).send,
    false,
  );
});

test('an order with no customer email is skipped, not attempted', () => {
  assert.deepEqual(
    shippedEmailDecision({ ...ready, email: null }),
    { send: false, reason: 'no_email' },
  );
});

test('a missing row is reported, not thrown', () => {
  assert.deepEqual(shippedEmailDecision(undefined), { send: false, reason: 'not_found' });
  assert.deepEqual(shippedEmailDecision(null), { send: false, reason: 'not_found' });
});

test('a ship-method quote with tracking sends', () => {
  const quote = {
    id: 9, email: 'c@example.com', tracking_number: '1Z999',
    shipped_email_sent_at: null, fulfillment_method: 'ship',
  };
  assert.equal(shippedEmailDecision(quote).send, true);
});
