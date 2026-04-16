import { useEffect, useMemo, useRef, useState } from 'react';
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

type PageText = { page: number; text: string };
type OutlineItem = { title: string; page: number | null };

export default function SpiritualsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [current, setCurrent] = useState<CurrentPdf | null>(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageTexts, setPageTexts] = useState<PageText[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState('');
  const [showToc, setShowToc] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/spirituals/pdf', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setCurrent(data.file))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Load the PDF, build a searchable text index + table of contents
  useEffect(() => {
    if (!current?.url) return;
    let cancelled = false;
    (async () => {
      try {
        setIndexing(true);
        setIndexProgress({ done: 0, total: 0 });
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url: current.url }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        setIndexProgress({ done: 0, total: doc.numPages });

        // 1) Build text index for each page (used for search)
        const texts: PageText[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          if (cancelled) return;
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          const text = content.items
            .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          texts.push({ page: p, text });
          setIndexProgress({ done: p, total: doc.numPages });
        }
        if (!cancelled) setPageTexts(texts);

        // 2) PDF outline (bookmarks) if present
        try {
          const raw = await doc.getOutline();
          if (raw && raw.length > 0) {
            const flat: OutlineItem[] = [];
            const walk = async (items: any[]) => {
              for (const it of items) {
                let pageNum: number | null = null;
                try {
                  const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
                  if (Array.isArray(dest) && dest[0]) {
                    pageNum = (await doc.getPageIndex(dest[0])) + 1;
                  }
                } catch { /* noop */ }
                flat.push({ title: it.title, page: pageNum });
                if (it.items && it.items.length > 0) await walk(it.items);
              }
            };
            await walk(raw);
            if (!cancelled) setOutline(flat);
          }
        } catch { /* outline not available */ }
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || 'Failed to open PDF');
      } finally {
        if (!cancelled) {
          setIndexing(false);
          setIndexProgress(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [current?.url]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || pageTexts.length === 0) return [];
    const matches: { page: number; snippet: string }[] = [];
    for (const pt of pageTexts) {
      const lower = pt.text.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx >= 0) {
        // Build a short snippet around the first hit
        const start = Math.max(0, idx - 40);
        const end = Math.min(pt.text.length, idx + q.length + 80);
        let snippet = pt.text.slice(start, end).trim();
        if (start > 0) snippet = '…' + snippet;
        if (end < pt.text.length) snippet = snippet + '…';
        matches.push({ page: pt.page, snippet });
      }
    }
    return matches;
  }, [query, pageTexts]);

  function scrollToPage(n: number) {
    const el = document.getElementById(`page-${n}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
            {/* Sticky search + controls */}
            <section className="sticky top-14 sm:top-16 z-20 bg-meadow-50/95 backdrop-blur border border-meadow-200 rounded-xl p-3 sm:p-4 mb-4 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-meadow-500 flex-shrink-0">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={indexing ? 'Indexing PDF…' : 'Search titles, lyrics, words…'}
                    disabled={indexing && pageTexts.length === 0}
                    className="flex-1 text-sm bg-transparent border-0 focus:outline-none placeholder:text-meadow-400"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="text-xs text-meadow-500 hover:text-meadow-900 px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {outline.length > 0 && (
                  <button
                    onClick={() => setShowToc((v) => !v)}
                    className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100 whitespace-nowrap"
                  >
                    {showToc ? 'Hide' : 'Contents'} ({outline.length})
                  </button>
                )}
                <a
                  href={current.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover font-medium whitespace-nowrap"
                >
                  Open ↗
                </a>
              </div>

              {indexing && indexProgress && indexProgress.total > 0 && (
                <div className="mt-2 text-[11px] text-meadow-500">
                  Building search index… {indexProgress.done} / {indexProgress.total} pages
                </div>
              )}

              {/* Search results */}
              {query && searchResults.length > 0 && (
                <div className="mt-3 border-t border-meadow-100 pt-3 max-h-[40vh] overflow-y-auto">
                  <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-2">
                    {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
                  </div>
                  <ul className="space-y-1">
                    {searchResults.map((r) => (
                      <li key={r.page}>
                        <button
                          onClick={() => scrollToPage(r.page)}
                          className="w-full text-left p-2 rounded hover:bg-meadow-100 flex items-start gap-3"
                        >
                          <span className="text-[11px] text-meadow-600 font-semibold flex-shrink-0 w-14">
                            Page {r.page}
                          </span>
                          <span className="text-xs text-meadow-700 truncate flex-1">
                            <Highlight text={r.snippet} query={query} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {query && !indexing && searchResults.length === 0 && (
                <div className="mt-3 border-t border-meadow-100 pt-3 text-xs text-meadow-500">
                  No matches for "{query}"
                </div>
              )}

              {/* Outline / Contents */}
              {showToc && outline.length > 0 && (
                <div className="mt-3 border-t border-meadow-100 pt-3 max-h-[40vh] overflow-y-auto">
                  <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-2">Table of contents</div>
                  <ul className="space-y-0.5">
                    {outline.map((o, i) => (
                      <li key={i}>
                        <button
                          onClick={() => { if (o.page) { scrollToPage(o.page); setShowToc(false); } }}
                          disabled={!o.page}
                          className="w-full text-left p-1.5 rounded hover:bg-meadow-100 flex items-baseline gap-2 disabled:opacity-50"
                        >
                          <span className="text-xs text-meadow-800 flex-1 truncate">{o.title}</span>
                          {o.page && <span className="text-[11px] text-meadow-500 tabular-nums">p. {o.page}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <div className="text-[11px] text-meadow-500 px-2 mb-3">
              {current.filename} · {numPages ? `${numPages} pages · ` : ''}
              {(current.size / 1024 / 1024).toFixed(1)} MB · uploaded {new Date(current.uploaded_at).toLocaleDateString()}
            </div>

            {/* All pages stacked */}
            <div ref={containerRef} className="space-y-4">
              {numPages ? (
                Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                  <div key={p} id={`page-${p}`} className="relative scroll-mt-24">
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

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-sun-200 text-meadow-900 px-0.5 rounded">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
