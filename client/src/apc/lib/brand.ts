// All Print Club host detection. APC is a sister brand served from the
// same bundle: it mounts at /print-club/* on any host, and at "/" when the
// page is served from a dedicated APC hostname. The hostnames are
// configurable (VITE_APC_HOSTS, comma-separated) so no domain ownership is
// assumed at build time.

const DEFAULT_HOSTS = ['allprintclub.com', 'www.allprintclub.com'];

export function apcHosts(): string[] {
  const env = (import.meta.env.VITE_APC_HOSTS as string | undefined) || '';
  const fromEnv = env.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HOSTS;
}

export function isApcHost(): boolean {
  if (typeof window === 'undefined') return false;
  return apcHosts().includes(window.location.hostname.toLowerCase());
}
