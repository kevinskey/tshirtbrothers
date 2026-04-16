import { Link, useNavigate } from 'react-router-dom';
import { api, type User } from '@/lib/api';

export default function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
    navigate('/');
  }

  return (
    <header className="border-b border-ink-100 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/app" className="font-serif text-xl font-bold">Songwriter</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-ink-600 hover:text-ink-900">Songs</Link>
            <Link to="/app/dictionary" className="text-ink-600 hover:text-ink-900">Dictionary</Link>
            <Link to="/app/poetry" className="text-ink-600 hover:text-ink-900">Poetry</Link>
            <Link to="/app/psalms" className="text-ink-600 hover:text-ink-900">Psalms</Link>
            <Link to="/app/bible" className="text-ink-600 hover:text-ink-900">Bible</Link>
            <Link to="/app/analyze" className="text-ink-600 hover:text-ink-900">Analyze</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user.avatar_url && (
            <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
          )}
          <span className="text-sm text-ink-600 hidden sm:inline">{user.name || user.email}</span>
          <button
            onClick={logout}
            className="text-xs text-ink-400 hover:text-ink-800 px-2 py-1"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
