// Custom Gift Club host detection. CGC is a sister brand served from the
// same bundle: it mounts at /gift-club/* on any host, and at "/" when the
// page is served from a dedicated CGC hostname. The hostnames are
// configurable (VITE_CGC_HOSTS, comma-separated) so no domain ownership is
// assumed at build time.

const DEFAULT_HOSTS = ['customgiftclub.com', 'www.customgiftclub.com'];

export function cgcHosts(): string[] {
  const env = (import.meta.env.VITE_CGC_HOSTS as string | undefined) || '';
  const fromEnv = env.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HOSTS;
}

export function isCgcHost(): boolean {
  if (typeof window === 'undefined') return false;
  return cgcHosts().includes(window.location.hostname.toLowerCase());
}
