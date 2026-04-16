import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type SongVersion, type Song } from '@/lib/api';

type Props = {
  songId: number;
  open: boolean;
  onClose: () => void;
  onRestored: (song: Song) => void;
};

const REASON_LABEL: Record<string, string> = {
  autosave: 'Autosaved',
  ai_rewrite: 'Before AI rewrite',
  ai_insert: 'Before AI insert',
  pre_restore: 'Before a previous restore',
  manual: 'Manual snapshot',
};

export default function VersionHistoryPanel({ songId, open, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listVersions(songId)
      .then(setVersions)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [open, songId]);

  async function restore(v: SongVersion) {
    if (!confirm(`Restore this version from ${new Date(v.created_at).toLocaleString()}? Your current version will be saved to history first — you can undo this.`)) return;
    setRestoring(true);
    try {
      const restored = await api.restoreVersion(songId, v.id);
      toast.success('Restored — your pre-restore version is saved in history too');
      onRestored(restored);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRestoring(false);
    }
  }

  if (!open) return null;

  const preview = versions.find((v) => v.id === previewId) || null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-4 sm:pt-20 px-2 sm:px-4 bg-meadow-900/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[92dvh] sm:max-h-[75vh] bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-meadow-200 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Version list */}
        <aside className="border-r border-meadow-100 overflow-y-auto bg-meadow-50/50">
          <div className="sticky top-0 px-4 py-3 bg-sun-gradient border-b border-meadow-100 flex items-center justify-between">
            <div>
              <div className="font-serif text-lg font-bold text-meadow-900">Version history</div>
              <div className="text-[10px] text-meadow-600">Last {versions.length} snapshots</div>
            </div>
            <button onClick={onClose} className="text-meadow-500 hover:text-meadow-800 text-sm px-2 md:hidden">✕</button>
          </div>

          {loading && <div className="p-4 text-sm text-meadow-500">Loading…</div>}
          {!loading && versions.length === 0 && (
            <div className="p-4 text-sm text-meadow-500">
              No version history yet. Snapshots are taken automatically as you work.
            </div>
          )}

          <ul>
            {versions.map((v, i) => (
              <li key={v.id}>
                <button
                  onClick={() => setPreviewId(v.id)}
                  className={`w-full text-left px-4 py-3 border-b border-meadow-100 hover:bg-meadow-100 ${previewId === v.id ? 'bg-meadow-100' : ''}`}
                >
                  <div className="font-medium text-sm text-meadow-900">
                    {i === 0 ? 'Most recent' : `${i + 1} versions ago`}
                  </div>
                  <div className="text-[10px] text-meadow-500 mt-0.5">
                    {new Date(v.created_at).toLocaleString()}
                    {v.reason && <> · {REASON_LABEL[v.reason] || v.reason}</>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Preview + restore */}
        <div className="overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-meadow-100 px-5 py-3 flex items-center justify-between gap-3">
            <div className="font-serif text-lg font-bold text-meadow-900">
              {preview ? 'Preview' : 'Pick a version to preview'}
            </div>
            <div className="flex items-center gap-2">
              {preview && (
                <button
                  onClick={() => restore(preview)}
                  disabled={restoring}
                  className="px-4 py-1.5 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover text-sm font-medium disabled:opacity-40"
                >
                  {restoring ? 'Restoring…' : 'Restore this version'}
                </button>
              )}
              <button onClick={onClose} className="hidden md:inline text-meadow-500 hover:text-meadow-800 text-sm px-2">
                ✕
              </button>
            </div>
          </div>

          <div className="p-6">
            {!preview ? (
              <div className="text-sm text-meadow-400 py-16 text-center">
                Select a version from the list to preview its contents.
              </div>
            ) : (
              <>
                <input
                  type="text"
                  readOnly
                  value={preview.snapshot.title || 'Untitled'}
                  className="w-full font-serif text-3xl font-bold bg-transparent border-0 focus:outline-none mb-4 text-meadow-900"
                />
                {preview.snapshot.sections.map((s, i) => (
                  <div key={i} className="mb-5">
                    <div className="text-[10px] uppercase tracking-widest text-meadow-500 mb-1.5 font-semibold">
                      {s.label || s.type}
                    </div>
                    <div className="font-serif text-base text-meadow-800 leading-relaxed space-y-0.5">
                      {s.lines.map((l, j) => <div key={j}>{l || <span className="text-meadow-200">·</span>}</div>)}
                    </div>
                  </div>
                ))}
                {preview.snapshot.notes && (
                  <div className="mt-8 pt-4 border-t border-meadow-100">
                    <div className="text-[10px] uppercase tracking-widest text-meadow-500 mb-1 font-semibold">Notes</div>
                    <div className="text-sm text-meadow-700 whitespace-pre-wrap">{preview.snapshot.notes}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
