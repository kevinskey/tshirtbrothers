/* ── Whole-shop "closed" switch ──────────────────────────────────────────
   One switch on the admin dashboard for holidays and days off. While it's
   on, every route that starts a NEW order or checkout refuses with the
   closed message (see requireShopOpen below), and the site shows a closed
   banner. Things that stay open on purpose:
     - paying an invoice, a quote deposit or a balance Kevin already sent
       (that's money for work already agreed, not a new order)
     - quote requests (customers are told we'll reply when we reopen)
     - orders already paid
   An optional reopen date turns the closure off by itself at midnight
   Atlanta time on that day, so nobody has to remember to flip it back. */

import pool from '../db.js';

// 'YYYY-MM-DD' for today in Atlanta.
export function atlantaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// pg returns a DATE column as a JS Date at LOCAL midnight (or a string if
// a type parser is set). Read the local parts back out so the calendar day
// survives whatever time zone the server runs in.
export function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    const dd = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${mm}-${dd}`;
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// 'YYYY-MM-DD' -> 'Fri, Nov 27'. Built at noon UTC so no time zone can
// tip it onto the neighbouring day.
export function prettyDate(ymd) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(`${ymd}T12:00:00Z`));
}

export function isValidYmd(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())
    && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
}

// Pure: a shop_status row (or anything with closed / reopens_on / note)
// -> what customers should see right now.
export function shopClosure(row, now = new Date()) {
  if (!row) return { closed: false };
  const reopensOn = dateOnly(row.reopens_on);
  const closed = !!row.closed && (!reopensOn || atlantaDate(now) < reopensOn);
  if (!closed) return { closed: false };
  const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null;
  return {
    closed: true,
    reopens_on: reopensOn,
    reopens_label: reopensOn ? prettyDate(reopensOn) : null,
    note,
    // One line every store, builder and checkout error reuses.
    message: reopensOn
      ? `We're closed right now and reopen ${prettyDate(reopensOn)}.`
      : 'We\'re closed right now and not taking new orders.',
  };
}

// Every checkout route reads this, so keep it cheap: a few seconds of
// cache, dropped the moment the admin changes the switch.
const CACHE_MS = 5_000;
let cached = null;
let cachedAt = 0;

export async function loadShopStatus() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const { rows } = await pool.query('SELECT * FROM shop_status WHERE id = 1');
    cached = rows[0] || { id: 1, closed: false, reopens_on: null, note: null };
  } catch (err) {
    // Table missing (migration not applied yet) must never take checkout
    // down: treat the shop as open.
    console.warn('[shop-status] read failed, treating shop as open:', err.message);
    cached = { id: 1, closed: false, reopens_on: null, note: null };
  }
  cachedAt = Date.now();
  return cached;
}

export function forgetShopStatus() {
  cached = null;
  cachedAt = 0;
}

export async function getShopClosure(now = new Date()) {
  return shopClosure(await loadShopStatus(), now);
}

// Express middleware for routes that start a new order or checkout.
// `extra` is appended to the message, e.g. to say a saved quote is kept.
export function requireShopOpen({ extra, skip } = {}) {
  return async (req, res, next) => {
    try {
      if (skip && skip(req)) return next();
      const closure = await getShopClosure();
      if (!closure.closed) return next();
      return res.status(400).json({
        error: extra ? `${closure.message} ${extra}` : closure.message,
        closed: true,
        closure,
      });
    } catch (err) { return next(err); }
  };
}
