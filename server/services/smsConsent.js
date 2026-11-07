// Who we are allowed to text, and when.
//
// Two separate rules, deliberately not collapsed into one:
//
//   TRANSACTIONAL  — mockup ready, deposit received, shipped, balance due,
//                    delivered. These ride the business relationship the
//                    customer started by ordering. They are NOT gated on
//                    marketing consent, and they ignore quiet hours: a
//                    customer who asked where their shirts are should be
//                    told, at 9pm, on a Sunday.
//
//   MARKETING      — review request, the day-3 quote follow-up, and anything
//                    like a reorder nudge or win-back. These need consent,
//                    honour STOP, and respect quiet hours.
//
// Before this, routes/sms.js had no STOP handling and there was no consent
// column anywhere. "Reply STOP to opt out" was printed in message bodies
// that nothing on the server could act on.

import pool from '../db.js';

/** Last 10 digits — the same key the inbound webhook attributes on. */
export function phoneDigits(phone) {
  return String(phone ?? '').replace(/\D/g, '').slice(-10);
}

// Carrier-standard keywords. 10DLC requires all of these to work, not just
// the one we happen to print.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout']);
const START_WORDS = new Set(['start', 'unstop', 'yes', 'optin']);
const HELP_WORDS = new Set(['help', 'info']);

/** Classify an inbound body. Returns 'stop' | 'start' | 'help' | null. */
export function classifyKeyword(body) {
  // Carriers match on the whole message, trimmed and case-insensitive.
  // Punctuation is stripped because "STOP." is extremely common.
  const word = String(body ?? '').trim().toLowerCase().replace(/[.!?,]+$/, '');
  if (STOP_WORDS.has(word)) return 'stop';
  if (START_WORDS.has(word)) return 'start';
  if (HELP_WORDS.has(word)) return 'help';
  return null;
}

export async function recordOptOut(phone, source = 'inbound STOP') {
  const digits = phoneDigits(phone);
  if (!digits) return;
  await pool.query(
    `INSERT INTO sms_consent (phone_digits, phone, opt_out_at, opt_out_source)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (phone_digits) DO UPDATE
       SET opt_out_at = NOW(), opt_out_source = EXCLUDED.opt_out_source, updated_at = NOW()`,
    [digits, String(phone), source],
  );
  console.log(`[sms] opt-out recorded for ${digits} (${source})`);
}

export async function recordOptIn(phone, { source = 'inbound START', text = null } = {}) {
  const digits = phoneDigits(phone);
  if (!digits) return;
  await pool.query(
    `INSERT INTO sms_consent (phone_digits, phone, consent_at, consent_source, consent_text, opt_out_at)
     VALUES ($1, $2, NOW(), $3, $4, NULL)
     ON CONFLICT (phone_digits) DO UPDATE
       SET consent_at = NOW(), consent_source = EXCLUDED.consent_source,
           consent_text = COALESCE(EXCLUDED.consent_text, sms_consent.consent_text),
           opt_out_at = NULL, updated_at = NOW()`,
    [digits, String(phone), source, text],
  );
  console.log(`[sms] opt-in recorded for ${digits} (${source})`);
}

/** True when this number has opted out. Fails CLOSED — see below. */
export async function hasOptedOut(phone) {
  const digits = phoneDigits(phone);
  if (!digits) return true;
  try {
    const { rows } = await pool.query(
      'SELECT opt_out_at FROM sms_consent WHERE phone_digits = $1',
      [digits],
    );
    return Boolean(rows[0]?.opt_out_at);
  } catch (err) {
    // A DB hiccup must not become "text the people who said stop". Texting
    // someone who opted out is a statutory problem; skipping one marketing
    // message is not.
    console.error(`[sms] consent check failed for ${digits}, suppressing:`, err.message);
    return true;
  }
}

// Quiet hours, recipient-local. We serve metro Atlanta, so America/New_York
// is the right assumption; a number's real timezone isn't knowable from the
// digits alone and guessing from area code is worse than a fixed window.
const QUIET_START_HOUR = 21; // 9pm
const QUIET_END_HOUR = 8;    // 8am

export function isQuietHours(now = new Date(), timeZone = 'America/New_York') {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now),
  );
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * May we send a MARKETING text to this number right now?
 *
 * Returns { ok: true } or { ok: false, reason }. Callers log the reason
 * rather than silently dropping, so a suppressed send is explainable.
 */
export async function maySendMarketing(phone, { now = new Date(), ignoreQuietHours = false } = {}) {
  if (!phoneDigits(phone)) return { ok: false, reason: 'no phone number' };
  if (await hasOptedOut(phone)) return { ok: false, reason: 'opted out' };
  if (!ignoreQuietHours && isQuietHours(now)) return { ok: false, reason: 'quiet hours' };
  return { ok: true };
}

/** The HELP reply carriers require: who we are and how to reach us. */
export const HELP_REPLY =
  'T-Shirt Brothers (Fairburn, GA) — custom apparel order updates. '
  + 'Call (470) 622-1392. Msg & data rates may apply. Reply STOP to opt out.';

export const STOP_REPLY =
  'T-Shirt Brothers: you\'re unsubscribed and won\'t get further texts. '
  + 'Reply START to resume. Questions? (470) 622-1392.';
