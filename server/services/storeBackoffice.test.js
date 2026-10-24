// Store back office money arithmetic. These two functions decide what a
// shopper is charged and what a store's promo costs, so a quiet regression
// here either undercharges every order or hands a fundraiser money it
// didn't earn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discountCentsFor, priceShippingRules, normalizeSlug, sanitizeBranding,
} from './storeBackoffice.js';

// ── discounts ────────────────────────────────────────────────────────────

test('percent discounts round to the nearest cent', () => {
  assert.equal(discountCentsFor({ discount_type: 'percent', discount_value: 10 }, 12499), 1250);
  assert.equal(discountCentsFor({ discount_type: 'percent', discount_value: 15 }, 3333), 500);
  assert.equal(discountCentsFor({ discount_type: 'percent', discount_value: 100 }, 5000), 4999);
});

test('amount discounts are taken verbatim', () => {
  assert.equal(discountCentsFor({ discount_type: 'amount', discount_value: 1500 }, 12499), 1500);
});

test('a discount never takes an order to zero — Stripe rejects that session', () => {
  assert.equal(discountCentsFor({ discount_type: 'amount', discount_value: 99999 }, 2500), 2499);
  assert.equal(discountCentsFor({ discount_type: 'percent', discount_value: 100 }, 1), 0);
});

test('free_shipping takes nothing off the goods', () => {
  assert.equal(discountCentsFor({ discount_type: 'free_shipping', discount_value: 0 }, 12499), 0);
});

test('a discount is never negative', () => {
  assert.equal(discountCentsFor({ discount_type: 'amount', discount_value: -500 }, 2500), 0);
  assert.equal(discountCentsFor({ discount_type: 'percent', discount_value: 10 }, 0), 0);
});

// ── shipping rules ───────────────────────────────────────────────────────

const FLAT     = { rule_type: 'flat', amount_cents: 695, label: 'Standard' };
const PER_ITEM = { rule_type: 'per_item', amount_cents: 300, label: 'Per item' };
const PICKUP   = { rule_type: 'pickup', amount_cents: 0, label: 'Pickup' };
const FREE_OVER = {
  rule_type: 'free_over', amount_cents: 695, threshold_cents: 7500, label: 'Free over $75',
};

test('flat charges the same regardless of cart size', () => {
  const [opt] = priceShippingRules([FLAT], { subtotalCents: 2000, itemCount: 7 });
  assert.equal(opt.cents, 695);
});

test('per_item multiplies by quantity, and never by zero', () => {
  assert.equal(priceShippingRules([PER_ITEM], { itemCount: 4 })[0].cents, 1200);
  assert.equal(priceShippingRules([PER_ITEM], { itemCount: 0 })[0].cents, 300);
});

test('free_over is free at the threshold and charges below it', () => {
  assert.equal(priceShippingRules([FREE_OVER], { subtotalCents: 7499 })[0].cents, 695);
  assert.equal(priceShippingRules([FREE_OVER], { subtotalCents: 7500 })[0].cents, 0);
  assert.equal(priceShippingRules([FREE_OVER], { subtotalCents: 9900 })[0].cents, 0);
});

test('pickup is always free', () => {
  assert.equal(priceShippingRules([PICKUP], { subtotalCents: 50000, itemCount: 20 })[0].cents, 0);
});

test('a free_shipping code zeroes the cheapest option only', () => {
  const opts = priceShippingRules(
    [FLAT, { rule_type: 'flat', amount_cents: 2995, label: 'Overnight' }],
    { subtotalCents: 5000, freeShipping: true },
  );
  assert.equal(opts[0].cents, 0);
  assert.match(opts[0].label, /free with your code/);
  assert.equal(opts[1].cents, 2995, 'overnight must still cost money');
});

test('a free_shipping code on an already-free option changes nothing', () => {
  const opts = priceShippingRules([PICKUP, FLAT], { subtotalCents: 5000, freeShipping: true });
  assert.equal(opts[0].cents, 0);
  assert.equal(opts[0].label, 'Pickup', 'no "free with your code" on an already-free option');
  assert.equal(opts[1].cents, 695, 'the paid option must not also become free');
});

test('unknown rule types are skipped, not priced at zero', () => {
  const opts = priceShippingRules([{ rule_type: 'carrier_live', amount_cents: 0, label: 'Live' }, FLAT], {});
  assert.equal(opts.length, 1);
  assert.equal(opts[0].label, 'Standard');
});

test('no rules yields no options, so the caller can fall back', () => {
  assert.deepEqual(priceShippingRules([], {}), []);
});

// ── slugs ────────────────────────────────────────────────────────────────

test('category slugs survive the usual store naming', () => {
  assert.equal(normalizeSlug('Fall 2026 — Sets & Joggers'), 'fall-2026-sets-joggers');
  assert.equal(normalizeSlug('  Hats  '), 'hats');
  assert.equal(normalizeSlug('***'), '');
});

// ── branding ─────────────────────────────────────────────────────────────
// brand_json also carries `demo` (which marks a showroom store unsellable)
// and the business-store address/website. A store owner writes to this
// column now, so the allowlist is a security boundary, not tidiness.

test('only branding keys survive — everything else is dropped', () => {
  const out = sanitizeBranding({
    primary_color: '#1F2A44',
    tagline: 'Live hard',
    demo: true,                     // would un-sell or fake a showroom store
    business_address: '1 Evil St',
    is_fundraiser: true,
    percent_of_retail: 0,
  });
  assert.deepEqual(Object.keys(out).sort(), ['primary_color', 'tagline']);
});

test('absent keys are left alone, so a partial save is not a wipe', () => {
  const out = sanitizeBranding({ tagline: 'Just this' });
  assert.deepEqual(out, { tagline: 'Just this' });
  assert.ok(!('logo_url' in out), 'an untouched logo must not be cleared');
});

test('an explicitly empty field clears it — that is how a logo is removed', () => {
  assert.deepEqual(sanitizeBranding({ logo_url: '' }), { logo_url: null });
  assert.deepEqual(sanitizeBranding({ tagline: '   ' }), { tagline: null });
});

test('colours must be hex — the value lands in a style attribute', () => {
  assert.equal(sanitizeBranding({ primary_color: '#abc' }).primary_color, '#abc');
  assert.equal(sanitizeBranding({ primary_color: '#1F2A44' }).primary_color, '#1f2a44');
  for (const bad of ['red', 'rgb(1,2,3)', '#12345', 'javascript:alert(1)', '#1f2a44; background:url(x)']) {
    assert.throws(() => sanitizeBranding({ primary_color: bad }), /hex colour/, `accepted ${bad}`);
  }
});

test('image URLs must be http(s) — these render into an img src', () => {
  const ok = 'https://cdn.example.com/logo.png';
  assert.equal(sanitizeBranding({ logo_url: ok }).logo_url, ok);
  for (const bad of [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'file:///etc/passwd',
    'not a url',
  ]) {
    assert.throws(() => sanitizeBranding({ logo_url: bad }), /URL/, `accepted ${bad}`);
  }
});

test('long text is rejected rather than silently truncated', () => {
  assert.throws(() => sanitizeBranding({ tagline: 'x'.repeat(201) }), /200 characters/);
  assert.throws(() => sanitizeBranding({ footer_note: 'x'.repeat(501) }), /500 characters/);
  assert.equal(sanitizeBranding({ tagline: 'x'.repeat(200) }).tagline.length, 200);
});

test('a junk payload yields no writes at all', () => {
  assert.deepEqual(sanitizeBranding(null), {});
  assert.deepEqual(sanitizeBranding('nope'), {});
  assert.deepEqual(sanitizeBranding({}), {});
});
