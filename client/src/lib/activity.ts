// First-party activity tracking — posts to /api/events (see
// server/routes/events.js). Complements Umami: these events are tied to a
// customer email/account when one is known, so the admin Customers page can
// show how each person actually uses the site.
//
// Everything here is best-effort and must never break the page.

const ANON_KEY = 'tsb_anon_id';
const EMAIL_KEY = 'tsb_known_email';

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

// Call whenever the visitor tells us who they are (quote submit, sign-in,
// checkout) — later events from this browser get tied to them.
export function rememberEmail(email: string): void {
  try {
    if (email && email.includes('@')) localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
  } catch { /* best-effort */ }
}

export function logActivity(event: string, data?: Record<string, unknown>): void {
  try {
    const token = localStorage.getItem('tsb_token');
    const body = JSON.stringify({
      event,
      email: localStorage.getItem(EMAIL_KEY) || undefined,
      anon_id: anonId(),
      path: window.location.pathname,
      data,
    });
    fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => { /* tracking must never surface errors */ });
  } catch { /* ditto */ }
}

// Log an event at most once per browser session (per event name) — for
// page-open events so a hot-reload or back-button doesn't double count.
export function logActivityOnce(event: string, data?: Record<string, unknown>): void {
  try {
    const key = `tsb_evt_${event}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* fall through and log anyway */ }
  logActivity(event, data);
}
