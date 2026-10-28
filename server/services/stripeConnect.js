// Stripe Connect for store partners.
//
// Default model: TSB charges, partner is credited in store_ledger, TSB pays
// them monthly by ACH. That works, but the money sits with TSB for up to a
// month and someone has to run payouts.
//
// With a connected account, Stripe moves the partner's share at charge time
// and TSB keeps the rest as an application fee.
//
// DESTINATION charges, deliberately. The charge still happens on TSB's
// account, so TSB stays merchant of record — which is the right answer here
// because TSB prints and ships every order. Under direct charges the partner
// would own chargebacks and refund liability for fulfilment they do not
// control, and the customer's statement would name a business that never
// touched their parcel.
//
// Nothing in here activates until a store has an account id AND Stripe says
// that account can take charges and receive payouts. A store half-way
// through onboarding keeps the ledger path.

import Stripe from 'stripe';
import pool from '../db.js';

let _stripe = null;
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

export class ConnectError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/**
 * Is this store ready to be paid directly?
 *
 * All three must hold. An account that has submitted details but is still
 * being reviewed has charges_enabled false, and routing a transfer to it
 * fails the whole payment — so a shopper's checkout would break because a
 * partner's paperwork was pending. Falling back to the ledger is always
 * safe; the partner is paid either way.
 */
export function isPayable(store) {
  return Boolean(
    store?.stripe_account_id
    && store.stripe_charges_enabled
    && store.stripe_payouts_enabled,
  );
}

/**
 * Split one order between the connected account and TSB, for a destination
 * charge. Pure — this is the money, so it is testable without Stripe.
 *
 * In a destination charge, `application_fee_amount` is what the PLATFORM
 * keeps; Stripe transfers the remainder to the connected account. So the fee
 * is everything that is not the partner's share: TSB's cut of retail, plus
 * shipping, tax and size upcharges, which are TSB's in full.
 *
 * @param {number} grossCents        total the shopper pays
 * @param {number} storeShareCents   the partner's earnings on this order
 * @returns {{ applicationFeeCents: number, transferCents: number }}
 */
export function destinationSplit(grossCents, storeShareCents) {
  const gross = Math.max(0, Math.round(Number(grossCents) || 0));
  // Never transfer more than was collected. A misconfigured split that put
  // the partner above 100% would otherwise make Stripe reject the payment,
  // or move money TSB never took.
  const transfer = Math.max(0, Math.min(Math.round(Number(storeShareCents) || 0), gross));
  return { applicationFeeCents: gross - transfer, transferCents: transfer };
}

/**
 * The Checkout Session fields that turn a payment into a destination charge.
 * Returns null when the store is not payable, which is the caller's signal
 * to carry on exactly as before.
 */
export function checkoutConnectParams(store, { grossCents, storeShareCents }) {
  if (!isPayable(store)) return null;
  const { applicationFeeCents, transferCents } = destinationSplit(grossCents, storeShareCents);
  // Nothing to transfer — a 100%-to-TSB store — is not worth a Connect
  // round trip, and Stripe rejects a zero-amount transfer anyway.
  if (transferCents <= 0) return null;

  return {
    payment_intent_data: {
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: store.stripe_account_id },
    },
    metadata: {
      connect_destination: store.stripe_account_id,
      connect_transfer: String(transferCents),
    },
  };
}

// ── Onboarding ───────────────────────────────────────────────────────────

/**
 * Create the store's connected account if it has none, then return a fresh
 * onboarding link.
 *
 * Express accounts: Stripe hosts the identity, bank and tax collection, so
 * TSB never handles a partner's SSN or bank details.
 *
 * Account links are single-use and expire in minutes, so this is called
 * every time an owner clicks "connect" rather than stored.
 */
export async function startOnboarding(storeId, { returnUrl, refreshUrl }) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, owner_email, stripe_account_id FROM stores WHERE id = $1`,
    [storeId],
  );
  const store = rows[0];
  if (!store) throw new ConnectError(404, 'Store not found');

  const stripe = stripeClient();
  let accountId = store.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: store.owner_email || undefined,
      business_profile: { name: store.name, product_description: `${store.name} merchandise` },
      // transfers is the only capability a destination charge actually
      // uses — the charge happens on TSB's account and Stripe just moves
      // the partner's share. But Stripe refuses `transfers` on its own:
      //
      //   "Your platform needs approval for accounts to have requested the
      //    transfers capability without the card_payments capability."
      //
      // So card_payments is requested too, and goes unused. The cost is
      // real but it is paperwork, not risk: Stripe asks the partner for the
      // fuller merchant onboarding. It does NOT make them merchant of
      // record for our sales — that would require on_behalf_of, which we
      // deliberately never set.
      //
      // Worth removing: ask Stripe to approve transfers-only for this
      // platform (support.stripe.com/contact), then drop card_payments
      // here and partners get a shorter form.
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      // store_id namespaces these: this Stripe account is SHARED with
      // GleeWorld, whose connected accounts carry gleeworld_tenant_id /
      // partner_id instead. Anything walking the account list must not
      // assume every account belongs to it.
      metadata: { store_id: String(store.id), store_slug: store.slug, platform: 'tsb' },
    });
    accountId = account.id;
    // Persist before returning the link. If the link request fails after
    // this, the next attempt reuses the account instead of creating a
    // second orphan for the same store.
    await pool.query(`UPDATE stores SET stripe_account_id = $1 WHERE id = $2`, [accountId, store.id]);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  return { accountId, url: link.url, expiresAt: link.expires_at };
}

/** Pull the account's current state from Stripe and cache it on the store. */
export async function refreshAccountStatus(storeId) {
  const { rows } = await pool.query(
    `SELECT stripe_account_id FROM stores WHERE id = $1`, [storeId],
  );
  const accountId = rows[0]?.stripe_account_id;
  if (!accountId) return { connected: false };

  const account = await stripeClient().accounts.retrieve(accountId);
  return syncAccount(account);
}

/**
 * Write an account's state onto whichever store owns it. Shared by the
 * account.updated webhook and the manual refresh, so the two cannot drift.
 */
export async function syncAccount(account) {
  const { rows } = await pool.query(
    `UPDATE stores
        SET stripe_charges_enabled   = $2,
            stripe_payouts_enabled   = $3,
            stripe_details_submitted = $4,
            stripe_account_updated_at = NOW()
      WHERE stripe_account_id = $1
      RETURNING id, slug`,
    [account.id, !!account.charges_enabled, !!account.payouts_enabled, !!account.details_submitted],
  );
  if (!rows[0]) return { connected: false, reason: 'account_not_linked_to_a_store' };

  return {
    connected: true,
    store_id: rows[0].id,
    account_id: account.id,
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    details_submitted: !!account.details_submitted,
    // What is still stopping them being paid, straight from Stripe.
    requirements_due: account.requirements?.currently_due ?? [],
  };
}

export async function getConnectStatus(storeId) {
  const { rows } = await pool.query(
    `SELECT stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled,
            stripe_details_submitted, stripe_account_updated_at
       FROM stores WHERE id = $1`,
    [storeId],
  );
  const s = rows[0];
  if (!s) throw new ConnectError(404, 'Store not found');
  return {
    connected: !!s.stripe_account_id,
    account_id: s.stripe_account_id,
    charges_enabled: s.stripe_charges_enabled,
    payouts_enabled: s.stripe_payouts_enabled,
    details_submitted: s.stripe_details_submitted,
    payable: isPayable(s),
    updated_at: s.stripe_account_updated_at,
  };
}
