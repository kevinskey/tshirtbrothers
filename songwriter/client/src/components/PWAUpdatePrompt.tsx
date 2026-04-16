import { useEffect, useState } from 'react';

declare global {
  interface Window {
    __swUpdate?: () => void;
  }
}

export default function PWAUpdatePrompt() {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    // Dynamic import so this code only runs in the browser
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedsUpdate(true);
          },
          onRegisteredSW(_swUrl, reg) {
            registration = reg || null;
            // Poll for updates every hour while the app is open
            if (reg) {
              setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
            }
          },
        });
        window.__swUpdate = () => {
          setUpdating(true);
          updateSW(true); // pass true to skipWaiting + reload
        };
      })
      .catch(() => { /* PWA plugin virtual module not available (dev mode) */ });

    // Also update when the user returns to the tab after backgrounding
    const onVisible = () => {
      if (document.visibilityState === 'visible' && registration) {
        registration.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!needsUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-50">
      <div className="bg-sun-100 border border-sun-400 rounded-xl shadow-lg p-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#e6b020">
            <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" />
          </svg>
        </div>
        <div className="flex-1 text-sm">
          <div className="font-semibold text-meadow-900 mb-0.5">A new version is ready</div>
          <div className="text-meadow-700 text-xs mb-2">
            Reload to get the latest updates. Your work is saved.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.__swUpdate?.()}
              disabled={updating}
              className="px-3 py-1 bg-meadow-700 text-meadow-50 text-xs rounded-full hover:bg-meadow-800 font-medium disabled:opacity-50"
            >
              {updating ? 'Updating…' : 'Reload'}
            </button>
            <button
              onClick={() => setNeedsUpdate(false)}
              className="px-3 py-1 text-xs text-meadow-600 hover:text-meadow-900"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
