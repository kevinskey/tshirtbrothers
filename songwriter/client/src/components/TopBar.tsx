import { Link, useNavigate } from 'react-router-dom';
import { api, type User } from '@/lib/api';
import { Flower } from '@/components/decorations/GardenDecorations';

export default function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
    navigate('/');
  }

  return (
    <header className="border-b border-meadow-200 bg-meadow-50/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-6">
          <Link to="/app" className="flex items-center gap-2 font-serif text-xl font-bold text-meadow-800">
            <Flower size={22} petal="#f2c6c6" center="#f5c842" />
            Songwriter
          </Link>
          <nav className="flex items-center gap-1 text-sm flex-wrap">
            <NavLink to="/app" label="Songs" />
            <NavLink to="/app/journal" label="Journal" />
            <NavLink to="/app/dictionary" label="Dictionary" />
            <NavLink to="/app/poetry" label="Poetry" />
            <NavLink to="/app/psalms" label="Psalms" />
            <NavLink to="/app/bible" label="Bible" />
            <NavLink to="/app/analyze" label="Analyze" />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user.avatar_url && (
            <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full border border-meadow-200" referrerPolicy="no-referrer" />
          )}
          <span className="text-sm text-meadow-700 hidden sm:inline">{user.name || user.email}</span>
          <button
            onClick={logout}
            className="text-xs text-meadow-500 hover:text-meadow-800 px-2 py-1"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-full text-meadow-700 hover:text-meadow-900 hover:bg-meadow-100 transition-colors"
    >
      {label}
    </Link>
  );
}
