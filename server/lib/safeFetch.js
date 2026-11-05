// Guarded outbound fetch for URLs that came from a request body or query.
//
// Two live SSRF holes motivated this:
//
//   routes/products.js  /image-proxy allowlisted with `url.includes('ssactivewear.com')`,
//     a substring test — so `http://169.254.169.254/latest/meta-data/?x=ssactivewear.com`
//     passed, and the bytes came back to the caller with ACAO:*.
//   routes/design.js    /remove-color did `fetch(req.body.imageUrl)` with no
//     allowlist at all and returned the response body.
//
// On a DigitalOcean droplet 169.254.169.254 serves cloud-init user-data,
// which routinely carries provisioning secrets. So the rules here are:
//
//   - https only. The metadata service is http, and every host we actually
//     want is https.
//   - Hostname compared against an allowlist by exact match or dot-suffix
//     ("ssactivewear.com" allows "www.ssactivewear.com" but NOT
//     "ssactivewear.com.evil.test"). Never a substring test.
//   - No IP literals, no localhost/.internal/.local — an allowlist already
//     excludes them, but this keeps a future caller that passes a wide
//     allowlist from reintroducing the bug.
//   - No embedded credentials, no non-443 port.
//   - Redirects followed by hand, re-validating every hop. Otherwise an
//     allowlisted host could 302 us to the metadata endpoint.

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.status = 400;
  }
}

const BLOCKED_HOST_SUFFIXES = ['.internal', '.local', '.localdomain'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal']);

// Bracketed v6 ("[::1]"), dotted v4, or bare hex/decimal that the URL parser
// would still resolve numerically.
function isIpLiteral(hostname) {
  if (hostname.startsWith('[')) return true;
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function hostAllowed(hostname, allowHosts) {
  return allowHosts.some((h) => {
    const allowed = h.toLowerCase().replace(/^\.+/, '');
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });
}

/**
 * Validate a caller-supplied URL. Returns the parsed URL or throws
 * UnsafeUrlError (which carries status 400).
 */
export function assertSafeUrl(raw, { allowHosts }) {
  if (!Array.isArray(allowHosts) || allowHosts.length === 0) {
    // A caller that forgot its allowlist must fail closed, not open.
    throw new UnsafeUrlError('No host allowlist configured for this fetch');
  }

  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new UnsafeUrlError('Not a valid URL');
  }

  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https URLs are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('URL must not carry credentials');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Only port 443 is allowed');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host)) throw new UnsafeUrlError('IP addresses are not allowed');
  if (BLOCKED_HOSTS.has(host)) throw new UnsafeUrlError('Host not allowed');
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) throw new UnsafeUrlError('Host not allowed');
  if (!hostAllowed(host, allowHosts)) throw new UnsafeUrlError('URL not allowed');

  return url;
}

/** True when `raw` is safe, for callers that want a boolean rather than a throw. */
export function isSafeUrl(raw, opts) {
  try {
    assertSafeUrl(raw, opts);
    return true;
  } catch {
    return false;
  }
}

/**
 * fetch() with every hop validated. Same return value as fetch().
 *
 * redirect:'manual' then re-validating is the point — following redirects
 * automatically would let an allowlisted host bounce us anywhere.
 */
export async function safeFetch(raw, { allowHosts, timeoutMs = 10000, headers, maxRedirects = 3 } = {}) {
  let target = assertSafeUrl(raw, { allowHosts });

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      ...(headers ? { headers } : {}),
    });

    if (res.status < 300 || res.status > 399) return res;

    const location = res.headers.get('location');
    if (!location) return res;
    // Relative redirects resolve against the current hop, then get the same
    // scheme/host/port/allowlist treatment as the original.
    target = assertSafeUrl(new URL(location, target).href, { allowHosts });
  }

  throw new UnsafeUrlError('Too many redirects');
}
