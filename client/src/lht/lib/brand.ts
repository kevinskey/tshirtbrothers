// Live Hard Truth host detection. LHT is a sister brand served from the
// same bundle: it mounts at /live-hard-truth/* on any host, and at "/"
// when the page is served from a dedicated LHT hostname. The hostnames are
// configurable (VITE_LHT_HOSTS, comma-separated) so no domain ownership is
// assumed at build time.

// livehardtruth.tshirtbrothers.com is a store subdomain by DNS, so it must
// be listed here or App.tsx falls through to the generic group-store
// storefront instead of the LHT brand app.
const DEFAULT_HOSTS = [
  'livehardtruth.com',
  'www.livehardtruth.com',
  'livehardtruth.tshirtbrothers.com',
];

export function lhtHosts(): string[] {
  const env = (import.meta.env.VITE_LHT_HOSTS as string | undefined) || '';
  const fromEnv = env.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HOSTS;
}

export function isLhtHost(): boolean {
  if (typeof window === 'undefined') return false;
  return lhtHosts().includes(window.location.hostname.toLowerCase());
}
