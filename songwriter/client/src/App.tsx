import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { api, type User } from '@/lib/api';
import LandingPage from '@/pages/LandingPage';
import LibraryPage from '@/pages/LibraryPage';
import EditorPage from '@/pages/EditorPage';
import PoetryPage from '@/pages/PoetryPage';
import AnalyzePage from '@/pages/AnalyzePage';

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
    <BrowserRouter>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
