// Customer-facing gang sheet builder. Any authenticated account may open
// it (unlike /admin/gangsheet, which is admin-only) — the actual per-sheet
// ownership scoping happens server-side in server/routes/gangsheetStore.js's
// /sheets routes (created_by = req.user.id), not here.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import GangSheetBuilder from '@/components/gangsheet/GangSheetBuilder';

// Umami custom event, if the tracker loaded (adblock / script failure = no-op).
// Copied idiom from DtfStorePage.tsx rather than imported — page components
// in this app don't import helpers from each other.
function trackEvent(event: string, data?: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { track: (e: string, d?: Record<string, unknown>) => void };
  };
  try { w.umami?.track(event, data); } catch { /* analytics must never break the page */ }
}

// Login gate — cloned from AdminDtfOrdersPage.tsx's gate (itself cloned from
// GangSheetPage.tsx), minus the `user.role !== 'admin'` check: any signed-in
// account may build a sheet, not just admins.
export default function DtfBuilderPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth?redirect=/dtf/builder');
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setChecking(false))
      .catch(() => navigate('/auth?redirect=/dtf/builder'));
  }, [navigate]);

  // Fire only once, after the gate passes — mirrors the brief's "on mount
  // after gate" requirement rather than firing before we know the user is
  // actually allowed in.
  useEffect(() => {
    if (!checking) trackEvent('dtf-builder-open');
  }, [checking]);

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return <GangSheetBuilder mode="customer" />;
}
