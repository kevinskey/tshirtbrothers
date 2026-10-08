import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, Download, Search, Sparkles, X, RefreshCw, FileText, Copy, Lock, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

// Every file in the DO Spaces bucket, whatever uploaded it — quote artwork,
// gang sheets, embroidery, mail attachments, mockups, art library, etc.
// Backed by /api/admin/uploads (server/routes/adminUploads.js).

export interface UploadItem {
  key: string;
  name: string;
  ext: string;
  folder: string;
  size: number;
  lastModified: string | null;
  previewable: boolean;
  private: boolean;
  publicUrl: string;
  viewUrl: string;
  downloadUrl: string;
}

interface ListResponse {
  items: UploadItem[];
  total: number;
  folders: { name: string; count: number }[];
  bucketTotal: number;
  truncated: boolean;
}

const PAGE = 60;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` });

const FOLDER_LABELS: Record<string, string> = {
  'quote-designs': 'Quote uploads',
  'gangsheet-orders': 'Gang sheet orders',
  'customer-assets': 'Customer assets',
  'art-library': 'Art library',
  'designs': 'Studio designs',
  'embroidery': 'Embroidery',
  'mockups': 'Mockups',
  'store-mockups': 'Store mockups',
  'mail': 'Mail attachments',
  'marketing': 'Marketing',
  'hero-slides': 'Hero slides',
  'uploads': 'Admin uploads',
  'vendor-files': 'Vendor files',
  'cgc': 'Blanks',
  'custom-fonts': 'Fonts',
};
const folderLabel = (f: string) => FOLDER_LABELS[f] || f;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

const CHECKER = {
  backgroundImage: 'linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%), linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
};

export default function AllUploadsBrowser({ onEdit }: { onEdit: (item: UploadItem) => void | Promise<void> }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [type, setType] = useState<'graphics' | 'all'>('graphics');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'largest' | 'name'>('newest');

  const [preview, setPreview] = useState<UploadItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmKeys, setConfirmKeys] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function load(offset = 0, refresh = false) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE), type, sort });
    if (folder) params.set('folder', folder);
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (refresh) params.set('refresh', '1');
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/uploads?${params}`, { headers: authHeader() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data: ListResponse = await res.json();
      setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setFolders(data.folders);
      if (offset === 0) setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load uploads');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { load(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, debouncedQuery, type, sort]);

  const allFolderCount = useMemo(() => folders.reduce((n, f) => n + f.count, 0), [folders]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function doDelete(keys: string[]) {
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/uploads', {
        method: 'DELETE',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const gone = new Set<string>(data.deleted || []);
      setItems((prev) => prev.filter((i) => !gone.has(i.key)));
      setTotal((t) => t - gone.size);
      setSelected((prev) => new Set([...prev].filter((k) => !gone.has(k))));
      if (preview && gone.has(preview.key)) setPreview(null);
      if (data.errors?.length) toast.error(`${data.errors.length} file(s) could not be deleted`);
      else toast.success(gone.size === 1 ? 'File deleted' : `${gone.size} files deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setConfirmKeys(null);
    }
  }

  function copyLink(item: UploadItem) {
    navigator.clipboard?.writeText(item.private ? item.viewUrl : item.publicUrl)
      .then(() => toast.success(item.private ? 'Temporary link copied (expires in 1 hour)' : 'Link copied'))
      .catch(() => toast.error('Could not copy link'));
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file names, customer emails, folders..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{ fontSize: '16px' }}
          />
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
            <option value="name">By path</option>
          </select>
          <select value={type} onChange={(e) => { setType(e.target.value as typeof type); setFolder(''); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="graphics">Graphics only</option>
            <option value="all">All files</option>
          </select>
          <button onClick={() => load(0, true)} title="Refresh from storage"
            className="border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Folder chips */}
      <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
        <button onClick={() => setFolder('')}
          className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${folder === '' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All ({allFolderCount})
        </button>
        {folders.map((f) => (
          <button key={f.name} onClick={() => setFolder(f.name)}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${folder === f.name ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {folderLabel(f.name)} ({f.count})
          </button>
        ))}
      </div>

      {/* Selection bar */}
      <div className="flex items-center justify-between mb-3 text-sm text-gray-600 min-h-[36px]">
        <span>{loading ? 'Loading…' : `${total.toLocaleString()} file${total === 1 ? '' : 's'}`}</span>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span>{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium">Clear</button>
            <button onClick={() => setConfirmKeys([...selected])}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Delete selected
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="text-center py-12 bg-white rounded-xl border border-red-200 text-red-700 text-sm">{error}</div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">No files match.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map((item) => {
              const isSel = selected.has(item.key);
              return (
                <div key={item.key} className={`bg-white rounded-xl border overflow-hidden group hover:shadow-md transition ${isSel ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200'}`}>
                  <div className="aspect-square flex items-center justify-center p-2 relative cursor-pointer" style={CHECKER} onClick={() => setPreview(item)}>
                    {item.previewable ? (
                      <img src={item.viewUrl} alt={item.name} className="max-w-full max-h-full object-contain" loading="lazy" />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                        <FileText className="w-10 h-10" />
                        <span className="text-xs font-bold uppercase mt-1">{item.ext || 'file'}</span>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(item.key); }}
                      className={`absolute top-2 left-2 rounded bg-white/90 p-0.5 ${isSel ? 'text-orange-600' : 'text-gray-500 opacity-0 group-hover:opacity-100'} transition`}
                      aria-label={isSel ? 'Deselect' : 'Select'}
                    >
                      {isSel ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    {item.private && (
                      <span className="absolute top-2 right-2 bg-gray-900/70 text-white rounded px-1.5 py-0.5 text-[10px] flex items-center gap-1">
                        <Lock className="w-3 h-3" /> private
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-900 truncate" title={item.key}>{item.name}</p>
                    <p className="text-[11px] text-gray-400 truncate" title={item.folder}>{folderLabel(item.folder.split('/')[0] || '(root)')} · {fmtSize(item.size)}</p>
                    <p className="text-[11px] text-gray-400">{fmtDate(item.lastModified)}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {item.previewable && (
                        <button onClick={() => onEdit(item)} title="Edit with tools"
                          className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-md py-1 text-xs font-semibold flex items-center justify-center gap-1">
                          <Sparkles className="w-3 h-3" /> Edit
                        </button>
                      )}
                      <a href={item.downloadUrl} title="Download original"
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md py-1 text-xs font-semibold flex items-center justify-center">
                        <Download className="w-3 h-3" />
                      </a>
                      <button onClick={() => setConfirmKeys([item.key])} title="Delete"
                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-md py-1 text-xs font-semibold flex items-center justify-center">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {items.length < total && (
            <div className="flex justify-center mt-6">
              <button onClick={() => load(items.length)} disabled={loadingMore}
                className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 flex items-center gap-2">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                Load more ({(total - items.length).toLocaleString()} left)
              </button>
            </div>
          )}
        </>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold text-gray-900 truncate pr-4" title={preview.key}>{preview.name}</p>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex items-center justify-center p-4 min-h-[240px]" style={CHECKER}>
              {preview.previewable ? (
                <img src={preview.viewUrl} alt={preview.name} className="max-w-full max-h-[60vh] object-contain" />
              ) : preview.ext === 'pdf' ? (
                <iframe src={preview.viewUrl} title={preview.name} className="w-full h-[60vh] bg-white" />
              ) : (
                <div className="flex flex-col items-center text-gray-400 py-12">
                  <FileText className="w-16 h-16" />
                  <span className="text-sm mt-2">No preview for .{preview.ext || 'file'} files. Download to open it.</span>
                </div>
              )}
            </div>
            <div className="p-4 border-t text-xs text-gray-500 space-y-1">
              <p className="break-all"><span className="font-semibold text-gray-700">Path:</span> {preview.key}</p>
              <p><span className="font-semibold text-gray-700">Size:</span> {fmtSize(preview.size)} · <span className="font-semibold text-gray-700">Uploaded:</span> {fmtDate(preview.lastModified)}{preview.private ? ' · Private file' : ''}</p>
            </div>
            <div className="p-4 pt-0 flex flex-wrap gap-2">
              {preview.previewable && (
                <button onClick={() => { const p = preview; setPreview(null); onEdit(p); }}
                  className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Edit with Tools
                </button>
              )}
              <a href={preview.downloadUrl}
                className="bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Download
              </a>
              <button onClick={() => copyLink(preview)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                <Copy className="w-4 h-4" /> Copy link
              </button>
              <button onClick={() => setConfirmKeys([preview.key])}
                className="ml-auto bg-red-50 hover:bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmKeys && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmKeys(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Delete {confirmKeys.length === 1 ? 'this file' : `${confirmKeys.length} files`}?
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              This permanently removes {confirmKeys.length === 1 ? 'it' : 'them'} from storage. It cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-5">
              Any quote, order, gang sheet, mockup, or email that links to {confirmKeys.length === 1 ? 'this file' : 'these files'} will show a broken image.
            </p>
            {confirmKeys.length === 1 && <p className="text-xs text-gray-400 break-all mb-5">{confirmKeys[0]}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmKeys(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium">Cancel</button>
              <button onClick={() => doDelete(confirmKeys)} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
