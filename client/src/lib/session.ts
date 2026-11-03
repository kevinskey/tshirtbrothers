// Who is signed in, read from the JWT we already hold.
//
// The login token carries { id, email, role, name, iat, exp }, so the UI can
// tell a customer from an admin without a round trip. This is for CHROME ONLY
// — deciding which links to render. Every admin route and endpoint is still
// gated server-side by the authenticate/requireAdmin middleware, because a
// token payload is reader-supplied data and anyone can edit localStorage.
//
// Added 2026-11-03: the navbar had been showing "Admin Dashboard" to every
// signed-in user, admin or not, because it only ever checked whether a token
// existed. That is a problem on the App Store — a reviewer signing in with the
// demo customer account would see staff tooling and could reasonably read the
// app as an employee app (guideline 3.2(a)).

export interface SessionUser {
  id: number;
  email: string;
  role: string;
  name?: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tsb_token');
}

/** Decoded token payload, or null when signed out / the token is unreadable or expired. */
export function getSessionUser(): SessionUser | null {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const payload = JSON.parse(json) as SessionUser & { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (!payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  return !!getToken();
}

/** True only for staff. Drives which chrome we render — never trust it for access. */
export function isAdmin(): boolean {
  return getSessionUser()?.role === 'admin';
}
