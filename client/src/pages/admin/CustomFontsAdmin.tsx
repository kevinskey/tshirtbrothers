/**
 * Admin Custom Fonts management. Upload .ttf / .otf / .woff / .woff2 files,
 * see the list, delete. Lives at AdminPage's `fonts` section.
 *
 * Upload flow:
 *   1. <input type=file> → user picks a font file
 *   2. FileReader → base64
 *   3. POST /api/admin/custom-fonts { family_name, display_name?, category, file_base64 }
 *   4. Server validates magic bytes + size, uploads to Spaces, inserts row
 *   5. Re-fetch list + force-refresh the FontPicker's cached fonts so
 *      they show up in the picker without a page reload
 *
 * Family-name conflict: server returns 409. We surface the error inline.
 */

import { useEffect, useState } from 'react';
import { Trash2, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { refreshCustomFonts } from '@/components/design-studio/useCustomFonts';
import { FONT_CATEGORIES } from '@/components/design-studio/fontCatalog';

interface CustomFontRow {
  id: number;
  family_name: string;
  display_name: string | null;
  file_url: string;
  file_size: number | null;
  category: string;
  uploader_user_id: number | null;
  created_at: string;
}

const MAX_SIZE_MB = 5;

export function CustomFontsAdmin() {
  const [rows, setRows] = useState<CustomFontRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<string>('custom');
  const [file, setFile] = useState<File | null>(null);

  function getAuthToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('tsb_token');
  }

  async function fetchList() {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/custom-fonts', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Failed to load custom fonts');
      const data = await res.json();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !familyName.trim() || uploading) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_SIZE_MB} MB.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const base64 = await readAsBase64(file);
      const token = getAuthToken();
      const res = await fetch('/api/admin/custom-fonts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          family_name: familyName.trim(),
          display_name: displayName.trim() || undefined,
          category,
          file_base64: base64,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      // Reset form, refetch list, and force-refresh the FontPicker's
      // module-level cache so the new font appears immediately.
      setFamilyName('');
      setDisplayName('');
      setCategory('custom');
      setFile(null);
      await fetchList();
      await refreshCustomFonts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? Designs that already reference this font will continue to render — the file stays on Spaces — but it disappears from the picker.`)) {
      return;
    }
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/custom-fonts/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Delete failed');
      await fetchList();
      await refreshCustomFonts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Custom Fonts</h2>
      <p className="text-sm text-gray-600 mb-6">
        Upload .ttf / .otf / .woff / .woff2 fonts you've licensed for redistribution. They'll appear in the design studio's font picker for all customers.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload form */}
      <form onSubmit={handleUpload} className="mb-8 rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Upload a font</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Family name (used as font-family in CSS)</span>
            <input
              type="text"
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. Brushstroke Bold"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Shown in the picker if different"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FONT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">File (.ttf / .otf / .woff / .woff2)</span>
            <input
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!file || !familyName.trim() || uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Uploading…' : 'Upload Font'}
        </button>
      </form>

      {/* Existing fonts list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Uploaded fonts ({rows.length})</h3>
        </header>
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">No custom fonts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Family</th>
                <th className="px-4 py-2 font-medium">Display name</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Uploaded</th>
                <th className="px-4 py-2 font-medium">Preview</th>
                <th className="px-4 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.family_name}</td>
                  <td className="px-4 py-3 text-gray-700">{r.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{r.category}</td>
                  <td className="px-4 py-3 text-gray-600">{formatSize(r.file_size)}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-lg" style={{ fontFamily: r.family_name }}>
                    The quick brown fox
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id, r.family_name)}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
