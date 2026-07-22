// Detects whether the current hostname is a group-store subdomain like
// `sandycreekpto.tshirtbrothers.com` and, if so, exposes the leftmost
// label as the "store handle" the storefront should render.
//
// A single wildcard DNS + wildcard TLS record on *.tshirtbrothers.com
// gives every store its own subdomain at zero per-store ops cost. This
// helper is what lets the SPA figure out which store to show without
// any URL prefix.
import { useParams } from 'react-router-dom';

const ROOT_DOMAINS = new Set([
  'tshirtbrothers.com',
  'www.tshirtbrothers.com',
  'localhost',
  '127.0.0.1',
]);

// Reserved subdomains we NEVER treat as a store — these are TSB's own.
const RESERVED = new Set([
  'www', 'admin', 'api', 'staging', 'stage', 'dev', 'preview',
  'app', 'shop', 'mail', 'smtp', 'ftp', 'blog', 'help', 'status',
]);

/**
 * If the current hostname is a subdomain of tshirtbrothers.com AND
 * not on the reserved list, return that leftmost label. Otherwise null.
 * Runs safely in SSR (returns null when window is undefined).
 */
export function getStoreSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (ROOT_DOMAINS.has(host)) return null;

  // Only accept *.tshirtbrothers.com (any depth of subdomain — take the leftmost)
  if (!host.endsWith('.tshirtbrothers.com')) return null;

  const label = host.split('.')[0];
  if (!label) return null;
  if (RESERVED.has(label)) return null;
  // DNS label sanity: 2–63 chars, letters/digits/hyphens, no leading/trailing hyphen
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
  return label;
}

/**
 * The storefront pages read this to get the store handle. It prefers
 * `useParams().slug` (path-based routing), and falls back to the
 * subdomain (host-based routing) so the same components work both ways.
 */
export function useStoreSlug(): string {
  const params = useParams<{ slug?: string }>();
  if (params.slug) return params.slug;
  return getStoreSubdomain() ?? '';
}

/**
 * Build a link to a path inside the current storefront. On subdomain
 * hosts this returns the bare path (e.g. `/product/foo`). On the main
 * domain it prefixes with `/stores/<slug>`.
 */
export function storeLink(slug: string, path: string = ''): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (getStoreSubdomain()) return clean === '/' ? '/' : clean;
  return `/stores/${slug}${clean === '/' ? '' : clean}`;
}
