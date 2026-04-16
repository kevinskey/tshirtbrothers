import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { User } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';
import PdfPageImage from '@/components/PdfPageImage';

type CurrentPdf = {
  url: string;
  filename: string;
  size: number;
  uploaded_at: string;
};

export default function SpiritualsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [current, setCurrent] = useState<CurrentPdf | null>(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/spirituals/pdf', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setCurrent(data.file))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Load page count once the PDF is available
  useEffect(() => {
    if (!current?.url) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url: current.url }).promise;
        if (!cancelled) setNumPages(doc.numPages);
      } catch (err: any) {
        if (!cancelled) toast.error(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [current?.url]);

  function jumpToPage() {
    const n = parseInt(jumpTo, 10);
    if (!n || !numPages || n < 1 || n > numPages) {
      toast.message(`Enter a page between 1 and ${numPages}`);
      return;
    }
    const el = document.getElementById(`page-${n}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="branches"
        eyebrow="✊🏾 Negro spirituals"
        title="The spirituals"
        subtitle="A reference collection of sheet music for traditional African American spirituals."
      >
        <Link
          to="/app/spirituals/admin"
          className="inline-block text-xs px-3 py-1.5 bg-white/80 backdrop-blur border border-meadow-200 rounded-full hover:bg-meadow-100 text-meadow-700 font-medium"
        >
          Upload / replace PDF →
        </Link>
      </PageBanner>

      <main className="max-w-4xl mx-auto px-2 sm:px-6 py-6 sm:py-10">
        <div className="mb-4 text-sm px-2 sm:px-0">
          <Link to="/app" className="text-meadow-500 hover:text-meadow-800">← All songs</Link>
        </div>

        {loading && <div className="text-meadow-500 text-sm px-2">Loading…</div>}

        {!loading && !current && (
          <div className="bg-meadow-100 border border-meadow-200 rounded-xl p-6 text-center mx-2">
            <p className="text-sm text-meadow-700 mb-3">
              No spirituals PDF uploaded yet.
            </p>
            <Link
              to="/app/spirituals/admin"
              className="inline-block px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full text-sm font-medium"
            >
              Upload PDF
            </Link>
          </div>
        )}

        {current && (
          <>
            {/* Metadata + controls */}
            <section className="bg-white border border-meadow-200 rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-meadow-900 truncate">
                  {current.filename}
                </div>
                <div className="text-[11px] text-meadow-500">
                  {numPages ? `${numPages} pages · ` : ''}
                  {(current.size / 1024 / 1024).toFixed(1)} MB · uploaded {new Date(current.uploaded_at).toLocaleDateString()}
                </div>
              </div>
              {numPages && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={numPages}
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') jumpToPage(); }}
                    placeholder="Page"
                    className="w-16 text-xs bg-meadow-50 border border-meadow-200 rounded-full px-2 py-1.5 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={jumpToPage}
                    className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100"
                  >
                    Jump
                  </button>
                </div>
              )}
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover font-medium"
              >
                Open original ↗
              </a>
            </section>

            {/* All pages stacked */}
            <div ref={containerRef} className="space-y-4">
              {numPages ? (
                Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                  <div key={p} id={`page-${p}`} className="relative">
                    <div className="absolute -top-5 left-2 sm:left-0 text-[10px] text-meadow-500 font-medium bg-meadow-50 px-1.5 py-0.5 rounded">
                      Page {p} / {numPages}
                    </div>
                    <PdfPageImage pdfUrl={current.url} pageNumber={p} maxWidth={900} />
                  </div>
                ))
              ) : (
                <div className="text-center text-meadow-500 py-8 text-sm">
                  Opening PDF…
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
