// Who a customer-facing email for a quote / invoice / mockup should reach.
//
// Deliberately free of the Resend client: routes that only need to resolve
// or validate addresses (invoices.js) must not drag in services/email.js,
// which constructs Resend at import time and throws without an API key.

import pool from '../db.js';

// Max additional addresses on one quote or invoice. High enough for a
// buyer + AP + a manager or two, low enough that a paste accident can't
// turn a quote into a mailing list.
export const MAX_CC = 5;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Every address a customer-facing send for this quote/invoice should reach:
// the primary first, then its cc_emails. Deduped case-insensitively so a
// CC that repeats the primary doesn't double-send, and shape-checked so one
// bad paste can't fail the whole send.
//
// Use this instead of `to: [row.customer_email]` at every customer-facing
// send site — a CC that only some emails honor is worse than none, because
// the AP contact silently misses the one email that mattered.
export function mailRecipients(row) {
  const primary = typeof row?.customer_email === 'string' ? row.customer_email.trim() : '';
  const out = [];
  const seen = new Set();
  const add = (addr) => {
    if (typeof addr !== 'string') return;
    const clean = addr.trim();
    if (!clean || !EMAIL_RE.test(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  add(primary);

  const raw = typeof row?.cc_emails === 'string'
    ? (() => { try { return JSON.parse(row.cc_emails); } catch { return []; } })()
    : (row?.cc_emails || []);
  if (Array.isArray(raw)) raw.slice(0, MAX_CC).forEach(add);

  // Never return an empty list: Resend rejects it, and an empty `to` on a
  // row with a malformed primary should surface as a send error upstream,
  // not as a silent no-op.
  return out.length ? out : (primary ? [primary] : []);
}

// Validate and tidy an admin-supplied CC list before it hits the column.
// Accepts an array or a comma/semicolon/newline-separated string, since the
// address usually arrives pasted out of an email client. Returns
// { emails } or { error } — the caller decides the status code.
export function normalizeCcEmails(input) {
  if (input === null || input === undefined || input === '') return { emails: [] };
  const list = Array.isArray(input) ? input : String(input).split(/[,;\n]/);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    if (!EMAIL_RE.test(clean)) {
      return { error: `"${clean}" is not a valid email address` };
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  if (out.length > MAX_CC) return { error: `At most ${MAX_CC} additional email addresses` };
  return { emails: out };
}

// Mockups carry their own customer_email but belong to a quote — the proof
// has to reach the same people the quote did, or the manager who approves
// artwork never sees it.
export async function mockupRecipients(mockup) {
  const base = mailRecipients(mockup);
  if (!mockup?.quote_id) return base;
  try {
    const { rows } = await pool.query(
      'SELECT customer_email, cc_emails FROM quotes WHERE id = $1',
      [mockup.quote_id],
    );
    if (!rows[0]) return base;
    const merged = mailRecipients({ customer_email: mockup.customer_email, cc_emails: rows[0].cc_emails });
    return merged.length ? merged : base;
  } catch (err) {
    console.error(`[recipients] cc lookup failed for mockup ${mockup?.id}:`, err.message);
    return base;
  }
}
