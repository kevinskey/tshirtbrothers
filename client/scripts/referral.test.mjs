// Run: npm run test:referral   (from client/)
//
// Tests the referrer classifier in src/lib/referral.ts, which decides
// whether a visit gets credited to ChatGPT, Perplexity, Gemini, Copilot,
// Claude, ordinary search, social, a plain referral, or direct.
//
// Why this is worth testing rather than eyeballing: the whole point of
// the module is to answer "is AI search actually sending us customers",
// and a classifier that silently mis-buckets ChatGPT as "referral" would
// answer "no" while the traffic was right there. The failure mode is a
// confidently wrong business metric, which is worse than no metric.
//
// The client has no test runner, so this transpiles the TS with esbuild
// (already a vite dependency) and drives the real exported function —
// not a copy of its logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const built = await esbuild.build({
  entryPoints: [new URL('../src/lib/referral.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  // lib/activity is imported lazily inside a session-logging path we
  // never reach here; stub it so the bundle doesn't pull in DOM code.
  external: ['./activity'],
});
const tmp = join(tmpdir(), 'tsb-referral-test.mjs');
writeFileSync(tmp, built.outputFiles[0].text);
const { classifyReferrer, isAiChannel, AI_CHANNELS } = await import(tmp);

const cases = [
  // ── AI assistants, including subdomain and legacy hosts ──
  ['https://chatgpt.com/', null, 'chatgpt'],
  ['https://chat.openai.com/c/abc123', null, 'chatgpt'],
  ['https://www.perplexity.ai/search?q=custom+shirts', null, 'perplexity'],
  ['https://perplexity.ai/', null, 'perplexity'],
  ['https://gemini.google.com/app', null, 'gemini'],
  ['https://copilot.microsoft.com/chats/1', null, 'copilot'],
  ['https://claude.ai/chat/xyz', null, 'claude'],
  ['https://www.you.com/search', null, 'other_ai'],
  ['https://grok.com/', null, 'other_ai'],

  // ── utm_source wins, and survives a stripped referrer ──
  ['', 'chatgpt.com', 'chatgpt'],
  ['', 'perplexity', 'perplexity'],
  ['https://example.com/', 'chatgpt.com', 'chatgpt'],

  // ── Conventional search. A google.com referrer may actually be an AI
  // Overview click, but nothing in the referrer says so, so it must not
  // be guessed into an AI bucket. ──
  ['https://www.google.com/search?q=custom+shirts+fairburn', null, 'organic_search'],
  ['https://www.google.co.uk/', null, 'organic_search'],
  ['https://duckduckgo.com/', null, 'organic_search'],
  ['https://www.bing.com/search?q=dtf', null, 'organic_search'],

  // ── Social ──
  ['https://l.instagram.com/?u=foo', null, 'social'],
  ['https://www.facebook.com/', null, 'social'],
  ['https://t.co/abc', null, 'social'],

  // ── Direct and internal ──
  ['', null, 'direct'],
  ['https://tshirtbrothers.com/shop', null, 'direct'],
  ['https://www.tshirtbrothers.com/quote', null, 'direct'],

  // ── Unknown third party is a plain referral, not AI ──
  ['https://some-blog.example/post', null, 'referral'],
  ['https://maps.google.com/', null, 'organic_search'],
];

for (const [referrer, utm, expected] of cases) {
  test(`${referrer || '(no referrer)'}${utm ? ` utm=${utm}` : ''} -> ${expected}`, () => {
    const { channel } = classifyReferrer(referrer, utm);
    assert.equal(channel, expected);
  });
}

test('malformed referrer does not throw and falls back to direct', () => {
  for (const bad of ['not a url', 'javascript:alert(1)', '://', '   ']) {
    const { channel } = classifyReferrer(bad, null);
    assert.equal(channel, 'direct', `expected direct for ${JSON.stringify(bad)}`);
  }
});

test('an AI referrer never reports our own domain as the source', () => {
  const { source } = classifyReferrer('https://chatgpt.com/', null);
  assert.equal(source, 'chatgpt.com');
});

test('internal navigation reports no source, so it cannot be counted as a channel', () => {
  const { channel, source } = classifyReferrer('https://tshirtbrothers.com/faq', null);
  assert.equal(channel, 'direct');
  assert.equal(source, '');
});

test('isAiChannel agrees with AI_CHANNELS and excludes search/social/direct', () => {
  for (const c of AI_CHANNELS) assert.ok(isAiChannel(c), `${c} should be AI`);
  for (const c of ['organic_search', 'social', 'referral', 'direct']) {
    assert.ok(!isAiChannel(c), `${c} should NOT be AI`);
  }
});

test('every AI assistant host maps to an AI channel', () => {
  const aiHosts = [
    'https://chatgpt.com/', 'https://www.perplexity.ai/',
    'https://gemini.google.com/', 'https://copilot.microsoft.com/',
    'https://claude.ai/', 'https://poe.com/',
  ];
  for (const h of aiHosts) {
    const { channel } = classifyReferrer(h, null);
    assert.ok(isAiChannel(channel), `${h} classified as ${channel}, expected an AI channel`);
  }
});
