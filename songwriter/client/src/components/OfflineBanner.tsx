import { useOnline } from '@/lib/useOnline';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-900 text-xs text-center py-1.5 px-3">
      <span className="font-medium">You're offline.</span>{' '}
      Reading previously-loaded psalms, songs, and journal entries still works. AI features will resume when you reconnect.
    </div>
  );
}
