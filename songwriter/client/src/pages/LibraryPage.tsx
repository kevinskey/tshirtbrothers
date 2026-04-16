import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type SongSummary, type User } from '@/lib/api';
import TopBar from '@/components/TopBar';

export default function LibraryPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.listSongs().then(setSongs).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  async function newSong() {
    try {
      const song = await api.createSong({
        title: 'Untitled',
        sections: [
          { id: crypto.randomUUID(), type: 'verse', label: 'Verse 1', lines: [''] },
          { id: crypto.randomUUID(), type: 'chorus', label: 'Chorus', lines: [''] },
        ],
      });
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function deleteSong(id: number) {
    if (!confirm('Delete this song? This cannot be undone.')) return;
    try {
      await api.deleteSong(id);
      setSongs((s) => s.filter((x) => x.id !== id));
      toast.success('Song deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <main className="max-w-4xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-4xl font-bold">Your songs</h1>
          <button
            onClick={newSong}
            className="px-4 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium"
          >
            + New song
          </button>
        </div>

        {loading ? (
          <div className="text-ink-400">Loading…</div>
        ) : songs.length === 0 ? (
          <div className="text-center py-20 text-ink-400">
            <p className="mb-4">No songs yet.</p>
            <button
              onClick={newSong}
              className="px-4 py-2 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium"
            >
              Write your first song
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {songs.map((s) => (
              <li key={s.id} className="group flex items-center justify-between p-4 bg-white rounded-md border border-ink-100 hover:border-ink-200">
                <Link to={`/app/song/${s.id}`} className="flex-1">
                  <div className="font-serif text-xl font-semibold">{s.title || 'Untitled'}</div>
                  <div className="text-xs text-ink-400 mt-1">
                    {s.section_count} section{s.section_count !== 1 ? 's' : ''} ·
                    updated {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                </Link>
                <button
                  onClick={() => deleteSong(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:text-red-800 px-3 py-1"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
