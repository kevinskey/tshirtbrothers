// Destination-charge arithmetic and the gate that decides whether a store
// is paid by Stripe or by the ledger.
//
// The two failure modes here are expensive and quiet: routing a transfer to
// an account that can't accept it (which fails the shopper's payment, not
// just the payout), and getting the application fee wrong (which moves the
// wrong amount of real money to a partner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPayable, destinationSplit, checkoutConnectParams } from './stripeConnect.js';

const payable = {
  stripe_account_id: 'acct_123',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
};

// ── the gate ─────────────────────────────────────────────────────────────

test('a fully onboarded store is payable', () => {
  assert.equal(isPayable(payable), true);
});

test('a store mid-onboarding is NOT payable', () => {
  // This is the dangerous case: details submitted, Stripe still reviewing.
  // Routing a transfer to it fails the PAYMENT, so a shopper would be unable
  // to check out because a partner's paperwork was pending.
  assert.equal(isPayable({ ...payable, stripe_charges_enabled: false }), false);
  assert.equal(isPayable({ ...payable, stripe_payouts_enabled: false }), false);
});

test('a store with no account is not payable', () => {
  assert.equal(isPayable({ stripe_charges_enabled: true, stripe_payouts_enabled: true }), false);
  assert.equal(isPayable({}), false);
  assert.equal(isPayable(null), false);
});

// ── the money ────────────────────────────────────────────────────────────

test('the fee is everything that is not the partner share', () => {
  // $124.99 set at Leora's 20% = $25.00, plus $6.95 shipping that is TSB's.
  const { applicationFeeCents, transferCents } = destinationSplit(13194, 2500);
  assert.equal(transferCents, 2500);
  assert.equal(applicationFeeCents, 10694);
  assert.equal(applicationFeeCents + transferCents, 13194, 'fee + transfer must equal gross');
});

test('fee and transfer always reconcile to the gross', () => {
  for (const [gross, share] of [[13194, 2500], [999, 1], [5000, 2500], [1, 0], [100000, 33333]]) {
    const r = destinationSplit(gross, share);
    assert.equal(r.applicationFeeCents + r.transferCents, gross, `${gross}/${share}`);
    assert.ok(r.applicationFeeCents >= 0 && r.transferCents >= 0);
  }
});

test('a share above the gross cannot transfer more than was collected', () => {
  // A split misconfigured past 100% would otherwise move money TSB never took.
  const r = destinationSplit(1000, 5000);
  assert.equal(r.transferCents, 1000);
  assert.equal(r.applicationFeeCents, 0);
});

test('a negative or junk share floors at zero', () => {
  assert.equal(destinationSplit(1000, -500).transferCents, 0);
  assert.equal(destinationSplit(1000, NaN).transferCents, 0);
  assert.equal(destinationSplit(1000, undefined).applicationFeeCents, 1000);
});

// ── the checkout params ──────────────────────────────────────────────────

test('an unconnected store gets null — the caller carries on unchanged', () => {
  assert.equal(checkoutConnectParams({}, { grossCents: 13194, storeShareCents: 2500 }), null);
  assert.equal(
    checkoutConnectParams({ ...payable, stripe_charges_enabled: false },
      { grossCents: 13194, storeShareCents: 2500 }),
    null,
  );
});

test('a connected store gets destination params', () => {
  const p = checkoutConnectParams(payable, { grossCents: 13194, storeShareCents: 2500 });
  assert.equal(p.payment_intent_data.application_fee_amount, 10694);
  assert.equal(p.payment_intent_data.transfer_data.destination, 'acct_123');
  // The capture webhook reads these to know not to also credit the ledger.
  assert.equal(p.metadata.connect_destination, 'acct_123');
  assert.equal(p.metadata.connect_transfer, '2500');
});

test('a 100%-to-TSB store gets null rather than a zero transfer', () => {
  // Stripe rejects a zero-amount transfer, and there is nothing to move.
  assert.equal(checkoutConnectParams(payable, { grossCents: 13194, storeShareCents: 0 }), null);
});
