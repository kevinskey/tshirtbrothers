// Run: node --test server/lib/safeFetch.test.js
//
// The bug this exists to prevent: routes/products.js allowlisted with
// `url.includes('ssactivewear.com')`, so
//   http://169.254.169.254/latest/meta-data/?x=ssactivewear.com
// passed the check and the droplet's metadata came back to the caller.
// routes/design.js had no check at all.
//
// Every assertion below is a URL shape that a substring test gets wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl, isSafeUrl, UnsafeUrlError } from './safeFetch.js';

const HOSTS = ['ssactivewear.com', 'digitaloceanspaces.com'];
const ok = (u) => isSafeUrl(u, { allowHosts: HOSTS });

// ── The actual exploit ────────────────────────────────────────────────────

test('the metadata endpoint with an allowlisted string in the query is refused', () => {
  assert.equal(ok('http://169.254.169.254/latest/meta-data/?x=ssactivewear.com'), false);
  assert.equal(ok('https://169.254.169.254/metadata/v1/user-data?h=ssactivewear.com'), false);
});

test('an allowlisted hostname used as a prefix of another domain is refused', () => {
  assert.equal(ok('https://ssactivewear.com.evil.test/x'), false);
});

test('an allowlisted hostname in the path or fragment is refused', () => {
  assert.equal(ok('https://evil.test/ssactivewear.com/x'), false);
  assert.equal(ok('https://evil.test/x#ssactivewear.com'), false);
});

test('an allowlisted hostname in userinfo is refused', () => {
  // https://ssactivewear.com@evil.test/ resolves to evil.test.
  assert.equal(ok('https://ssactivewear.com@evil.test/'), false);
});

// ── Loopback and private space ────────────────────────────────────────────

test('loopback and private addresses are refused', () => {
  for (const u of [
    'https://127.0.0.1/',
    'https://localhost/',
    'https://10.0.0.1/',
    'https://192.168.1.1/',
    'https://172.16.0.1/',
    'https://[::1]/',
    'https://metadata.google.internal/',
    'https://foo.internal/',
  ]) {
    assert.equal(ok(u), false, `${u} should be refused`);
  }
});

test('decimal and hex IP spellings are refused', () => {
  assert.equal(ok('https://2852039166/'), false);   // 169.254.169.254
  assert.equal(ok('https://0xA9FEA9FE/'), false);
});

// ── Scheme, port, shape ───────────────────────────────────────────────────

test('http is refused even on an allowlisted host — the metadata service is http', () => {
  assert.equal(ok('http://www.ssactivewear.com/img.jpg'), false);
});

test('non-https schemes are refused', () => {
  assert.equal(ok('file:///etc/passwd'), false);
  assert.equal(ok('gopher://ssactivewear.com/'), false);
  assert.equal(ok('data:image/png;base64,AAAA'), false);
});

test('a non-443 port is refused', () => {
  assert.equal(ok('https://www.ssactivewear.com:8080/x'), false);
});

test('junk is refused rather than thrown as a TypeError', () => {
  assert.equal(ok('not a url'), false);
  assert.equal(ok(''), false);
  assert.equal(ok(null), false);
  assert.equal(ok(undefined), false);
});

// ── Fails closed ──────────────────────────────────────────────────────────

test('an empty or missing allowlist refuses everything', () => {
  assert.equal(isSafeUrl('https://www.ssactivewear.com/x', { allowHosts: [] }), false);
  assert.equal(isSafeUrl('https://www.ssactivewear.com/x', {}), false);
});

// ── What has to keep working ──────────────────────────────────────────────

test('the hosts we actually use are allowed, including subdomains', () => {
  assert.equal(ok('https://www.ssactivewear.com/Images/Style/32_fl.jpg'), true);
  assert.equal(ok('https://ssactivewear.com/x.jpg'), true);
  assert.equal(ok('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/a/b.png'), true);
  assert.equal(ok('https://www.ssactivewear.com/x.jpg?a=1&b=2'), true);
});

test('a trailing dot on the hostname still matches', () => {
  assert.equal(ok('https://www.ssactivewear.com./x.jpg'), true);
});

test('hostname comparison is case-insensitive', () => {
  assert.equal(ok('https://WWW.SSActivewear.COM/x.jpg'), true);
});

// ── Error shape ───────────────────────────────────────────────────────────

test('assertSafeUrl throws UnsafeUrlError carrying status 400', () => {
  assert.throws(
    () => assertSafeUrl('https://169.254.169.254/', { allowHosts: HOSTS }),
    (err) => err instanceof UnsafeUrlError && err.status === 400,
  );
});

test('assertSafeUrl returns the parsed URL on success', () => {
  const u = assertSafeUrl('https://www.ssactivewear.com/x.jpg', { allowHosts: HOSTS });
  assert.equal(u.hostname, 'www.ssactivewear.com');
  assert.equal(u.pathname, '/x.jpg');
});
