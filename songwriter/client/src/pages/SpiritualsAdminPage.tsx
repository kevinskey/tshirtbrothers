import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Spiritual } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';

type Draft = {
  number: number | null;
  title: string;
  lyrics: string;
  page_start?: number | null;
  page_end?: number | null;
};

export default function SpiritualsAdminPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [existing, setExisting] = useState<Spiritual[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [source, setSource] = useState('');
  const [sourceFile, setSourceFile] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    refreshExisting();
  }, []);

  async function refreshExisting() {
    try {
      const summaries = await api.listSpirituals();
      // fetch full for summaries would be heavy; summaries are enough for admin listing
      setExisting(summaries as unknown as Spiritual[]);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const r = await api.uploadSpiritualsPdf(f);
      setRawText(r.raw_text || '');
      setPasteText(r.raw_text || '');

      if (r.entries.length === 0) {
        toast.error(
          r.raw_text
            ? `Extracted ${r.character_count} chars from ${r.pages} pages but couldn't split into entries. Review the raw text below and use "Parse pasted text" after cleanup, or add entries manually.`
            : `No text extracted from the PDF. It may be a scanned/image-only PDF that needs OCR.`
        );
        setShowRaw(true);
      } else {
        toast.success(`Parsed ${r.entries.length} entries from ${r.pages} pages`);
      }

      setDrafts(r.entries.map((e: any) => ({
        number: e.number ?? null,
        title: e.title || '',
        lyrics: e.lyrics || '',
        page_start: e.page_start ?? null,
        page_end: e.page_end ?? null,
      })));
      setSourceFile(r.source_file);
      if (!source) setSource(r.filename);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function parsePastedText() {
    if (!pasteText.trim()) { toast.message('Paste some text first'); return; }
    setParsing(true);
    try {
      const r = await api.parseSpiritualsText(pasteText);
      toast.success(`Found ${r.entries.length} entries`);
      setDrafts(r.entries.map((e: any) => ({
        number: e.number ?? null,
        title: e.title || '',
        lyrics: e.lyrics || '',
        page_start: e.page_start ?? null,
        page_end: e.page_end ?? null,
      })));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(i: number, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function removeDraft(i: number) {
    setDrafts((ds) => ds.filter((_, idx) => idx !== i));
  }

  function addEmptyDraft() {
    setDrafts((ds) => [...ds, { number: null, title: '', lyrics: '' }]);
  }

  function mergeWithPrevious(i: number) {
    if (i === 0) return;
    setDrafts((ds) => {
      const next = [...ds];
      next[i - 1] = {
        ...next[i - 1],
        lyrics: `${next[i - 1].lyrics}\n\n${next[i].title}\n${next[i].lyrics}`.trim(),
      };
      next.splice(i, 1);
      return next;
    });
  }

  async function saveAll() {
    if (drafts.length === 0) { toast.message('Nothing to save'); return; }
    const valid = drafts.filter((d) => d.title.trim() && d.lyrics.trim());
    if (valid.length === 0) { toast.error('All drafts are missing a title or lyrics'); return; }
    if (valid.length < drafts.length) {
      if (!confirm(`Skip ${drafts.length - valid.length} drafts that are missing a title or lyrics?`)) return;
    }
    setSaving(true);
    try {
      const r = await api.bulkSaveSpirituals({
        entries: valid.map((d) => ({
          number: d.number,
          title: d.title.trim(),
          lyrics: d.lyrics.trim(),
          page_start: d.page_start ?? null,
          page_end: d.page_end ?? null,
        })),
        source,
        source_file: sourceFile,
        replace_all: replaceAll,
      });
      toast.success(`Saved ${r.inserted} spirituals`);
      setDrafts([]);
      setPasteText('');
      refreshExisting();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOne(id: number) {
    if (!confirm('Delete this spiritual? This cannot be undone.')) return;
    try {
      await api.deleteSpiritual(id);
      toast.success('Deleted');
      refreshExisting();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="branches"
        eyebrow="🛠 Admin"
        title="Manage spirituals"
        subtitle="Upload a PDF, review the parsed entries, and save them to the collection."
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-4 text-sm">
          <Link to="/app/spirituals" className="text-meadow-500 hover:text-meadow-800">← Back to spirituals</Link>
        </div>

        {/* Upload */}
        <section className="bg-white border border-meadow-200 rounded-xl p-5 mb-6">
          <h2 className="font-serif text-xl font-bold text-meadow-900 mb-3">1. Upload a PDF</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={uploading}
            className="block w-full text-sm text-meadow-800 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-meadow-700 file:text-meadow-50 file:font-medium hover:file:bg-meadow-800 file:cursor-pointer"
          />
          {uploading && <p className="text-xs text-accent mt-2">Uploading and parsing…</p>}
          {sourceFile && (
            <p className="text-xs text-meadow-500 mt-2">
              Uploaded: <a href={sourceFile} target="_blank" rel="noreferrer" className="underline">{sourceFile}</a>
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-meadow-100">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-meadow-900">Or paste text</h3>
              {rawText && (
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="text-xs text-meadow-600 hover:text-meadow-900 underline"
                >
                  {showRaw ? 'Hide' : 'Show'} extracted text ({rawText.length.toLocaleString()} chars)
                </button>
              )}
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the spirituals text here (numbered '1. Title' or ALL CAPS titles work best)"
              rows={showRaw ? 20 : 6}
              className="w-full text-sm bg-meadow-50 border border-meadow-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent font-mono"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={parsePastedText}
                disabled={parsing || !pasteText.trim()}
                className="px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full text-sm font-medium disabled:opacity-40"
              >
                {parsing ? 'Parsing…' : 'Parse pasted text'}
              </button>
              {rawText && (
                <button
                  onClick={() => setPasteText(rawText)}
                  className="px-3 py-2 text-xs text-meadow-600 hover:text-meadow-900"
                >
                  Restore raw text
                </button>
              )}
            </div>
            {showRaw && rawText && (
              <p className="text-xs text-meadow-500 mt-2">
                Tip: if the parser couldn't find titles automatically, edit the text above to add numbered prefixes
                like "<span className="font-mono bg-white px-1">1. Title</span>" before each song, or surround titles with blank lines and ALL-CAPS formatting.
              </p>
            )}
          </div>
        </section>

        {/* Review */}
        {drafts.length > 0 && (
          <section className="bg-white border border-meadow-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-serif text-xl font-bold text-meadow-900">
                2. Review {drafts.length} parsed {drafts.length === 1 ? 'entry' : 'entries'}
              </h2>
              <button
                onClick={addEmptyDraft}
                className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100"
              >
                + Add blank
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-1">Source / compiler</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Johnson 1925"
                  className="w-full text-sm bg-meadow-50 border border-meadow-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-meadow-700 mt-5">
                <input
                  type="checkbox"
                  checked={replaceAll}
                  onChange={(e) => setReplaceAll(e.target.checked)}
                />
                Replace entire collection (delete all existing first)
              </label>
            </div>

            <ul className="space-y-3">
              {drafts.map((d, i) => (
                <li key={i} className="border border-meadow-100 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2 flex-wrap">
                    <input
                      type="number"
                      value={d.number ?? ''}
                      onChange={(e) => updateDraft(i, { number: e.target.value ? Number(e.target.value) : null })}
                      placeholder="#"
                      className="w-16 text-sm bg-meadow-50 border border-meadow-200 rounded px-2 py-1.5 focus:outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      value={d.title}
                      onChange={(e) => updateDraft(i, { title: e.target.value })}
                      placeholder="Title"
                      className="flex-1 min-w-[180px] text-base font-serif font-semibold bg-meadow-50 border border-meadow-200 rounded px-3 py-1.5 focus:outline-none focus:border-accent"
                    />
                    {i > 0 && (
                      <button
                        onClick={() => mergeWithPrevious(i)}
                        title="Merge into previous entry"
                        className="text-xs text-meadow-500 hover:text-meadow-900 px-2"
                      >
                        ↑ Merge
                      </button>
                    )}
                    <button
                      onClick={() => removeDraft(i)}
                      className="text-xs text-red-600 hover:text-red-800 px-2"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold">Score pages</label>
                    <input
                      type="number"
                      value={d.page_start ?? ''}
                      onChange={(e) => updateDraft(i, { page_start: e.target.value ? Number(e.target.value) : null })}
                      placeholder="start"
                      className="w-20 text-xs bg-meadow-50 border border-meadow-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                    />
                    <span className="text-xs text-meadow-400">→</span>
                    <input
                      type="number"
                      value={d.page_end ?? ''}
                      onChange={(e) => updateDraft(i, { page_end: e.target.value ? Number(e.target.value) : null })}
                      placeholder="end"
                      className="w-20 text-xs bg-meadow-50 border border-meadow-200 rounded px-2 py-1 focus:outline-none focus:border-accent"
                    />
                    {sourceFile && d.page_start && (
                      <a
                        href={`${sourceFile}#page=${d.page_start}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-meadow-500 hover:text-meadow-900 underline ml-2"
                      >
                        Open page ↗
                      </a>
                    )}
                  </div>
                  <textarea
                    value={d.lyrics}
                    onChange={(e) => updateDraft(i, { lyrics: e.target.value })}
                    rows={6}
                    className="w-full text-sm bg-meadow-50 border border-meadow-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent font-serif"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 flex gap-2">
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-5 py-2 bg-accent text-meadow-900 rounded-full font-medium hover:bg-accent-hover disabled:opacity-40"
              >
                {saving ? 'Saving…' : `Save all ${drafts.length}`}
              </button>
              <button
                onClick={() => setDrafts([])}
                className="px-4 py-2 text-sm text-meadow-600 hover:text-meadow-900"
              >
                Discard
              </button>
            </div>
          </section>
        )}

        {/* Existing */}
        <section className="bg-white border border-meadow-200 rounded-xl p-5">
          <h2 className="font-serif text-xl font-bold text-meadow-900 mb-3">
            Currently in the collection ({existing.length})
          </h2>
          {existing.length === 0 ? (
            <p className="text-sm text-meadow-500">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {existing.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-meadow-100 last:border-0">
                  <div className="text-sm text-meadow-800">
                    {s.number ? <span className="text-meadow-400">{s.number}. </span> : null}
                    {s.title}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/app/spirituals?open=${s.id}`)}
                      className="text-xs text-meadow-500 hover:text-meadow-900"
                    >
                      View
                    </button>
                    <button
                      onClick={() => deleteOne(s.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
