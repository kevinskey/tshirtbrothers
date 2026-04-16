import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';

type CurrentPdf = {
  url: string;
  filename: string;
  size: number;
  uploaded_at: string;
};

export default function SpiritualsAdminPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState<CurrentPdf | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    try {
      const r = await fetch('/api/spirituals/pdf', { credentials: 'include' });
      const data = await r.json();
      setCurrent(data.file);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      await api.uploadSpiritualsPdf(f);
      toast.success('Uploaded');
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="branches"
        eyebrow="🛠 Admin"
        title="Spirituals PDF"
        subtitle="Upload a PDF of sheet music. The most recent upload is shown on the Spirituals page."
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-4 text-sm">
          <Link to="/app/spirituals" className="text-meadow-500 hover:text-meadow-800">← Back to spirituals</Link>
        </div>

        {/* Current */}
        {current ? (
          <section className="bg-white border border-meadow-200 rounded-xl p-5 mb-6">
            <h2 className="font-serif text-xl font-bold text-meadow-900 mb-2">Currently showing</h2>
            <div className="text-sm text-meadow-800">
              <div className="font-medium">{current.filename}</div>
              <div className="text-xs text-meadow-500 mt-0.5">
                {(current.size / 1024 / 1024).toFixed(1)} MB · uploaded {new Date(current.uploaded_at).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100"
              >
                Open PDF ↗
              </a>
              <button
                onClick={() => navigate('/app/spirituals')}
                className="text-xs px-3 py-1.5 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover font-medium"
              >
                View sheet music →
              </button>
            </div>
          </section>
        ) : (
          <section className="bg-meadow-100 border border-meadow-200 rounded-xl p-5 mb-6">
            <p className="text-sm text-meadow-700">No PDF uploaded yet.</p>
          </section>
        )}

        {/* Upload */}
        <section className="bg-white border border-meadow-200 rounded-xl p-5">
          <h2 className="font-serif text-xl font-bold text-meadow-900 mb-2">
            {current ? 'Replace with a new PDF' : 'Upload a PDF'}
          </h2>
          <p className="text-xs text-meadow-500 mb-3">
            Up to 50 MB. The previous PDF stays in the server's uploads directory but is no longer shown.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={uploading}
            className="block w-full text-sm text-meadow-800 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-meadow-700 file:text-meadow-50 file:font-medium hover:file:bg-meadow-800 file:cursor-pointer"
          />
          {uploading && <p className="text-xs text-accent mt-2">Uploading…</p>}
        </section>
      </main>
    </div>
  );
}
