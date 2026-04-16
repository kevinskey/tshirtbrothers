import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { api, type User } from '@/lib/api';
import LandingPage from '@/pages/LandingPage';
import LibraryPage from '@/pages/LibraryPage';
import EditorPage from '@/pages/EditorPage';
import PoetryPage from '@/pages/PoetryPage';
import AnalyzePage from '@/pages/AnalyzePage';
import PsalmsPage from '@/pages/PsalmsPage';
import DictionaryPage from '@/pages/DictionaryPage';
import BibleSearchPage from '@/pages/BibleSearchPage';
import JournalPage from '@/pages/JournalPage';
import { AssistantProvider } from '@/lib/assistantContext';
import AssistantOverlay from '@/components/AssistantOverlay';
import AssistantFab from '@/components/AssistantFab';
import OfflineBanner from '@/components/OfflineBanner';
import ErrorBoundary from '@/components/ErrorBoundary';

function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  return { user, loading, setUser };
}

function Protected({ user, loading, children }: { user: User | null; loading: boolean; children: JSX.Element }) {
  if (loading) return <div className="p-12 text-ink-400">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading, setUser } = useAuth();

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AssistantProvider>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<LandingPage user={user} />} />
        <Route
          path="/app"
          element={
            <Protected user={user} loading={loading}>
              <LibraryPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/song/:id"
          element={
            <Protected user={user} loading={loading}>
              <EditorPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/poetry"
          element={
            <Protected user={user} loading={loading}>
              <PoetryPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/analyze"
          element={
            <Protected user={user} loading={loading}>
              <AnalyzePage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/psalms"
          element={
            <Protected user={user} loading={loading}>
              <PsalmsPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/dictionary"
          element={
            <Protected user={user} loading={loading}>
              <DictionaryPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/bible"
          element={
            <Protected user={user} loading={loading}>
              <BibleSearchPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route
          path="/app/journal"
          element={
            <Protected user={user} loading={loading}>
              <JournalPage user={user!} onLogout={() => setUser(null)} />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {user && <AssistantFab />}
      <AssistantOverlay />
      <Toaster position="top-right" richColors />
      </AssistantProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
