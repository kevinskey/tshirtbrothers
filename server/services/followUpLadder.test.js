// Run: node --test server/services/followUpLadder.test.js
//
// The leak: runAbandonedQuoteFollowUps chased only `status = 'pending'`,
// while archiveNonResponsiveQuotes sweeps `status IN ('pending','quoted')`.
// A quote that was priced and SENT -- the highest-intent lead there is --
// got nudged exactly zero times and then vanished on day 7.
//
// There is no local Postgres, so these assert on the SQL the ladder builds
// rather than on query results. That is enough to pin the three things that
// were actually wrong: which statuses are chased, that each rung has its own
// stamp, and that the rungs fire in order and can't re-fire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'scheduler.js'), 'utf8');

// The FOLLOW_UPS array as written, pulled out of the module source. Importing
// scheduler.js would start cron timers and open a DB pool.
const LADDER = SRC.slice(SRC.indexOf('const FOLLOW_UPS = ['), SRC.indexOf('async function runAbandonedQuoteFollowUps'));

/** Just one function's body — slicing to end-of-file picks up later code. */
function fn(name) {
  const start = SRC.indexOf(`async function ${name}`);
  assert.ok(start !== -1, `${name} not found in scheduler.js`);
  const after = SRC.indexOf('\nasync function ', start + 1);
  return SRC.slice(start, after === -1 ? SRC.length : after);
}

/**
 * A function's code with comments removed — both JS `//` and SQL `--`, since
 * the queries here carry inline SQL comments that name the very columns these
 * assertions are checking for.
 */
function sqlOf(name) {
  return fn(name)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

test('the ladder chases quoted, not just pending — this is the bug', () => {
  const query = fn('runAbandonedQuoteFollowUps');
  assert.match(
    query,
    /status IN \('pending',\s*'quoted'\)/,
    'follow-ups must include quoted quotes; chasing only pending was the leak',
  );
});

test('the archive sweep and the follow-up query cover the same statuses', () => {
  // If these ever diverge again, a status becomes archivable without ever
  // being chased — exactly the original defect.
  const archive = fn('archiveNonResponsiveQuotes');
  const archived = archive.match(/status IN \(([^)]*)\)/)?.[1];
  const chased = fn('runAbandonedQuoteFollowUps').match(/status IN \(([^)]*)\)/)?.[1];
  assert.ok(archived && chased, 'both queries should filter on status');
  const norm = (s) => s.split(',').map((x) => x.trim()).sort().join(',');
  assert.equal(norm(chased), norm(archived),
    'every status that can be archived unanswered must also be chased');
});

test('there are three rungs, each with its own stamp column', () => {
  const columns = [...LADDER.matchAll(/column:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(columns, ['follow_up_sent_at', 'follow_up_2_sent_at', 'follow_up_3_sent_at']);
  // Distinct stamps, not a counter: a half-failed send must not re-fire.
  assert.equal(new Set(columns).size, columns.length);
});

test('each rung only fires once — it filters on its own stamp being null', () => {
  const wheres = [...LADDER.matchAll(/where:\s*`([^`]+)`/g)].map((m) => m[1]);
  assert.equal(wheres.length, 3);
  assert.match(wheres[0], /follow_up_sent_at IS NULL/);
  assert.match(wheres[1], /follow_up_2_sent_at IS NULL/);
  assert.match(wheres[2], /follow_up_3_sent_at IS NULL/);
});

test('rungs 2 and 3 wait for rung 1, so the ladder cannot run out of order', () => {
  const wheres = [...LADDER.matchAll(/where:\s*`([^`]+)`/g)].map((m) => m[1]);
  assert.match(wheres[1], /follow_up_sent_at IS NOT NULL/);
  assert.match(wheres[2], /follow_up_sent_at IS NOT NULL/);
});

test('the ladder fits inside the 7-day archive window', () => {
  // QUOTE_EXPIRY_DAYS was lowered 14 -> 7 deliberately (Doc, 2026-10-30), so
  // a rung scheduled past day 7 would simply never fire.
  const expiry = Number(SRC.match(/QUOTE_EXPIRY_DAYS\s*=\s*(\d+)/)?.[1]);
  assert.equal(expiry, 7);
  const days = [...LADDER.matchAll(/INTERVAL '(\d+) days'/g)].map((m) => Number(m[1]));
  assert.ok(days.length >= 2, 'expected day-based intervals on rungs 2 and 3');
  for (const d of days) {
    assert.ok(d < expiry, `a rung at day ${d} would never fire before the day-${expiry} archive`);
  }
});

test('the SMS rung requires a phone number', () => {
  const wheres = [...LADDER.matchAll(/where:\s*`([^`]+)`/g)].map((m) => m[1]);
  assert.match(wheres[1], /customer_phone IS NOT NULL/);
});

test('follow-ups never chase a quote that was accepted or archived', () => {
  const query = fn('runAbandonedQuoteFollowUps');
  assert.match(query, /archived_at IS NULL/);
  assert.match(query, /accepted_at IS NULL/);
});

test('the language column the templates actually read is selected', () => {
  // quoteLang() reads inputs_json. Selecting a non-existent quote_lang column
  // would send English to every Spanish-speaking customer, silently.
  assert.match(fn('runAbandonedQuoteFollowUps'), /inputs_json/);
  // Comments stripped: the explanation of this very trap mentions the column.
  assert.doesNotMatch(sqlOf('runAbandonedQuoteFollowUps'), /\bquote_lang\b/);
});

test('archiving sends a closing note and stamps it', () => {
  const archive = fn('archiveNonResponsiveQuotes');
  assert.match(archive, /sendQuoteClosingNote/);
  assert.match(archive, /closing_note_sent_at = NOW\(\)/);
  assert.match(archive, /inputs_json/, 'the closing note needs the language too');
});
