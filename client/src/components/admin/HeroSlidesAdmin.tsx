import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Image as ImageIcon, X, ArrowUp, ArrowDown } from 'lucide-react';

interface Slide {
  id: number;
  image_url: string;
  label: string | null;
  link_url: string | null;
  sort_order: number;
  active: boolean;
}

interface SpacesFile {
  key: string;
  url: string;
  size: number;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

export default function HeroSlidesAdmin() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [available, setAvailable] = useState<SpacesFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/hero-slides', { headers: authHeaders() });
      const d = await r.json();
      setSlides(d.slides || []);
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openPicker() {
    setPickerOpen(true);
    if (available.length === 0) {
      try {
        const r = await fetch('/api/admin/hero-slides/available', { headers: authHeaders() });
        const d = await r.json();
        setAvailable(d.files || []);
      } catch (err) {
        flash('err', err instanceof Error ? err.message : 'Failed to load files');
      }
    }
  }

  async function pickFromSpaces(url: string) {
    setPickerOpen(false);
    const maxOrder = slides.length ? Math.max(...slides.map((s) => s.sort_order)) : 0;
    const r = await fetch('/api/admin/hero-slides', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ image_url: url, sort_order: maxOrder + 10 }),
    });
    if (r.ok) {
      flash('ok', 'Slide added');
      load();
    } else {
      flash('err', 'Add failed');
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const up = await fetch('/api/admin/hero-slides/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ imageBase64: base64, filename: file.name }),
      });
      if (!up.ok) throw new Error('upload failed');
      const { url } = await up.json();
      await pickFromSpaces(url);
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function patch(id: number, body: Partial<Slide>) {
    const r = await fetch(`/api/admin/hero-slides/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      setSlides((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } else {
      flash('err', 'Update failed');
    }
  }

  async function remove(id: number) {
    if (!confirm('Remove this slide from the rotator? The image file stays in Spaces.')) return;
    const r = await fetch(`/api/admin/hero-slides/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) {
      setSlides((prev) => prev.filter((s) => s.id !== id));
      flash('ok', 'Removed');
    } else {
      flash('err', 'Delete failed');
    }
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const a = slides[i]!;
    const b = slides[j]!;
    // Swap sort_order via two patches (small list, fine to chain).
    patch(a.id, { sort_order: b.sort_order });
    patch(b.id, { sort_order: a.sort_order });
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Hero Slides</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Rotating images on the homepage. Active slides are shown in sort order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ImageIcon className="h-4 w-4" /> Pick from Spaces
          </button>
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-orange-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-orange-600">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload new'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${
          toast.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>{toast.text}</div>
      )}

      {slides.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          No slides yet. Upload or pick from Spaces to populate the homepage rotator.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {slides.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="aspect-[16/10] bg-gray-50 flex items-center justify-center">
                <img src={s.image_url} alt={s.label || ''} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Label (admin only)"
                    value={s.label ?? ''}
                    onChange={(e) => setSlides((prev) => prev.map((x) => x.id === s.id ? { ...x, label: e.target.value } : x))}
                    onBlur={(e) => patch(s.id, { label: e.target.value })}
                    className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional click-through URL"
                    value={s.link_url ?? ''}
                    onChange={(e) => setSlides((prev) => prev.map((x) => x.id === s.id ? { ...x, link_url: e.target.value } : x))}
                    onBlur={(e) => patch(s.id, { link_url: e.target.value })}
                    className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.active}
                      onChange={(e) => patch(s.id, { active: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    Active
                  </label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(s.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-20" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Pick from Spaces (hero-slides/)</h3>
              <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
              {available.length === 0 ? (
                <div className="col-span-full text-center text-sm text-gray-400 py-8">No files found.</div>
              ) : available.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => pickFromSpaces(f.url)}
                  className="text-left rounded-lg border border-gray-200 overflow-hidden hover:border-orange-400 hover:shadow"
                >
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    <img src={f.url} alt={f.key} className="max-h-full max-w-full object-contain" loading="lazy" />
                  </div>
                  <div className="p-2 text-[10px] text-gray-500 truncate">{f.key.replace('hero-slides/', '')}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
