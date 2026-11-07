// Run: node --test server/services/smsConsent.test.js
//
// Before this module, routes/sms.js had no STOP handling and there was no
// consent column anywhere — while several message bodies already printed
// "Reply STOP to opt out". These tests pin the keyword matching and the
// quiet-hours window, which are the parts a carrier audit actually checks.
//
// The DB-touching functions are covered by the route tests; here we assert
// the pure logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKeyword, phoneDigits, isQuietHours, HELP_REPLY, STOP_REPLY } from './smsConsent.js';

// ── Keyword matching ──────────────────────────────────────────────────────

test('every carrier-standard stop word is honoured, not just STOP', () => {
  for (const w of ['STOP', 'stop', 'StopAll', 'UNSUBSCRIBE', 'cancel', 'END', 'quit', 'revoke', 'optout']) {
    assert.equal(classifyKeyword(w), 'stop', `${w} should opt out`);
  }
});

test('punctuation and whitespace do not defeat an opt-out', () => {
  // "STOP." is extremely common and must not be read as a conversation.
  for (const w of ['STOP.', ' stop ', 'Stop!', '\nSTOP\n', 'stop,']) {
    assert.equal(classifyKeyword(w), 'stop');
  }
});

test('start and help keywords are recognised', () => {
  for (const w of ['START', 'unstop', 'yes', 'OptIn']) assert.equal(classifyKeyword(w), 'start');
  for (const w of ['HELP', 'info', 'Help']) assert.equal(classifyKeyword(w), 'help');
});

// The important negative: a real customer message must stay a conversation.
test('an ordinary reply is not a keyword', () => {
  for (const m of [
    'stop by tomorrow and I will pick them up',
    'can you quit the back print?',
    'yes please add 12 hoodies',          // 'yes' alone is START; a sentence is not
    'Please cancel the sleeve print only',
    'help me pick a color',
    '',
    'Looks great!',
  ]) {
    assert.equal(classifyKeyword(m), null, `"${m}" should be treated as a message`);
  }
});

test('junk input does not throw', () => {
  for (const v of [null, undefined, 42, {}]) assert.equal(classifyKeyword(v), null);
});

// ── Phone keying ──────────────────────────────────────────────────────────

test('every spelling of the same number keys to the same row', () => {
  const expected = '4706221392';
  for (const p of ['+14706221392', '14706221392', '4706221392', '(470) 622-1392', '470.622.1392']) {
    assert.equal(phoneDigits(p), expected);
  }
});

test('a missing number yields no key rather than an empty match', () => {
  assert.equal(phoneDigits(null), '');
  assert.equal(phoneDigits(''), '');
});

// ── Quiet hours ───────────────────────────────────────────────────────────

const at = (iso) => new Date(iso);

test('marketing is quiet from 9pm to 8am Eastern', () => {
  // 2026-06-15 is EDT (UTC-4).
  assert.equal(isQuietHours(at('2026-06-15T01:30:00Z')), true);  // 9:30pm ET
  assert.equal(isQuietHours(at('2026-06-15T05:00:00Z')), true);  // 1am ET
  assert.equal(isQuietHours(at('2026-06-15T11:00:00Z')), true);  // 7am ET
  assert.equal(isQuietHours(at('2026-06-15T12:00:00Z')), false); // 8am ET
  assert.equal(isQuietHours(at('2026-06-15T20:00:00Z')), false); // 4pm ET
  assert.equal(isQuietHours(at('2026-06-16T00:59:00Z')), false); // 8:59pm ET
});

test('quiet hours follow the clock change, not a fixed UTC offset', () => {
  // 2026-01-15 is EST (UTC-5): 01:30Z is 8:30pm ET, still allowed.
  assert.equal(isQuietHours(at('2026-01-15T01:30:00Z')), false);
  // The same instant in June is 9:30pm ET and suppressed (asserted above).
  assert.equal(isQuietHours(at('2026-01-15T02:30:00Z')), true);  // 9:30pm EST
});

// ── Required reply copy ───────────────────────────────────────────────────

test('the HELP reply identifies the business and gives a contact', () => {
  assert.match(HELP_REPLY, /T-Shirt Brothers/);
  assert.match(HELP_REPLY, /470/);
  assert.match(HELP_REPLY, /STOP/);
  assert.match(HELP_REPLY, /rates may apply/i);
});

test('the STOP reply confirms and explains how to resume', () => {
  assert.match(STOP_REPLY, /unsubscribed/i);
  assert.match(STOP_REPLY, /START/);
});

test('both replies fit a single SMS segment budget', () => {
  // Over 160 chars splits; carriers dislike multipart compliance replies.
  for (const [name, msg] of [['HELP', HELP_REPLY], ['STOP', STOP_REPLY]]) {
    assert.ok(msg.length <= 160, `${name} reply is ${msg.length} chars, over one segment`);
  }
});
