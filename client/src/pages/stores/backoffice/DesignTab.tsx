// Design tab — how the shop LOOKS, as opposed to what it says.
//
// The Storefront tab edits the hero's words. Until this existed there was
// no way for a store's own people to change its colour, logo or imagery at
// all: those live in stores.brand_json, which only a TSB staffer could
// write. An owner could rename their banner but not make the shop look like
// their brand.
//
// Images upload straight to our bucket rather than asking for a URL. An
// owner with a logo on their desktop has nowhere to "get a link" from, and
// a tab that demands one is a tab they can't use.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Upload, X, RotateCcw } from 'lucide-react';
import {
  type BoBranding, fetchBranding, saveBranding, uploadBrandingImage,
} from './api';

// Matches the storefront fallbacks, so the preview isn't lying when the
// owner hasn't picked a colour yet.
const DEFAULT_COLOR = '#1f2a44';

const EMPTY: BoBranding = {
  primary_color: null, logo_url: null, hero_url: null,
  tagline: null, footer_note: null,
};

export default function DesignTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [saved, setSaved] = useState<BoBranding | null>(null);
  const [draft, setDraft] = useState<BoBranding>(EMPTY);
  const [storeName, setStoreName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { name, branding } = await fetchBranding(slug, authHeaders);
      setStoreName(name);
      setSaved(branding);
      setDraft(branding);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your design settings');
      setSaved(EMPTY);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Send every field, including the cleared ones — an empty string is
      // how the server is told to remove a logo.
      const { branding } = await saveBranding(slug, {
        primary_color: draft.primary_color || null,
        logo_url: draft.logo_url || null,
        hero_url: draft.hero_url || null,
        tagline: draft.tagline || null,
        footer_note: draft.footer_note || null,
      }, authHeaders);
      setSaved(branding);
      setDraft(branding);
      toast.success('Design saved — your shop is updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (saved === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  const color = draft.primary_color || DEFAULT_COLOR;

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Design</h2>
        <p className="text-sm text-gray-500">
          Your colour, logo and imagery. These apply across your whole shop —
          buttons, prices, product pages and the footer.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="space-y-6 px-5 py-5">
          {/* ── Colour ─────────────────────────────────────────────── */}
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Brand colour</span>
            <div className="flex items-center gap-3">
              {/* The native picker is the honest control here — a hex field
                  alone makes an owner go and find a colour tool. */}
              <input type="color" value={color}
                onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                aria-label="Brand colour"
                className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1" />
              <input value={draft.primary_color ?? ''} placeholder={DEFAULT_COLOR}
                onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                className={`${inputCls} max-w-[10rem] font-mono`} />
              {draft.primary_color && (
                <button onClick={() => setDraft({ ...draft, primary_color: null })}
                  className="text-sm text-gray-500 hover:text-gray-900">Use default</button>
              )}
            </div>
            <span className="mt-1 block text-xs text-gray-500">
              Used for buttons, prices and headings. Pick something with enough
              contrast against white to stay readable.
            </span>
          </div>

          <ImageField
            label="Logo" slug={slug} authHeaders={authHeaders}
            value={draft.logo_url}
            onChange={(url) => setDraft({ ...draft, logo_url: url })}
            hint="Shown at the top of your shop and in the footer. A square PNG with a transparent background works best."
            preview="contain"
          />

          <ImageField
            label="Feature image" slug={slug} authHeaders={authHeaders}
            value={draft.hero_url}
            onChange={(url) => setDraft({ ...draft, hero_url: url })}
            hint="Used on your sign-in screen and on your card in the store directory. A wide photo works best."
            preview="cover"
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Tagline</span>
            <input value={draft.tagline ?? ''} maxLength={200}
              onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
              placeholder="A few words under your store name" className={inputCls} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Footer note</span>
            <textarea value={draft.footer_note ?? ''} rows={2} maxLength={500}
              onChange={(e) => setDraft({ ...draft, footer_note: e.target.value })}
              placeholder="Anything you want at the bottom of every page — thanks, a deadline, contact details."
              className={inputCls} />
          </label>
        </div>

        {/* ── Preview ──────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 px-5 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Preview</p>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex items-center gap-3 bg-white px-4 py-4">
              {draft.logo_url
                ? <img src={draft.logo_url} alt="" className="h-12 w-12 rounded object-contain" />
                : <div className="flex h-12 w-12 items-center justify-center rounded text-sm font-bold text-white"
                    style={{ backgroundColor: color }}>
                    {(storeName || 'S').slice(0, 1).toUpperCase()}
                  </div>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-gray-900">{storeName || 'Your store'}</p>
                {draft.tagline && <p className="truncate text-sm text-gray-600">{draft.tagline}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 bg-gray-50 px-4 py-4">
              <span className="font-bold" style={{ color }}>$124.99</span>
              <span className="rounded-full px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: color }}>
                Add to cart
              </span>
            </div>
            {draft.footer_note && (
              <p className="border-t border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                {draft.footer_note}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
          {dirty && (
            <button onClick={() => setDraft(saved)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
              <RotateCcw className="w-4 h-4" /> Revert
            </button>
          )}
          <button onClick={save} disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Upload-or-paste. The file input is the primary path; the URL field stays
// for an owner whose image is already hosted somewhere.
function ImageField({ label, slug, authHeaders, value, onChange, hint, preview }: {
  label: string;
  slug: string;
  authHeaders: Record<string, string>;
  value: string | null;
  onChange: (url: string | null) => void;
  hint: string;
  preview: 'contain' | 'cover';
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      const { url } = await uploadBrandingImage(slug, dataUrl, file.name, authHeaders);
      onChange(url);
      toast.success(`${label} uploaded — remember to save`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      // Clear the input so picking the same file twice still fires onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50">
          {value
            ? <img src={value} alt=""
                // Spelled out, not interpolated: Tailwind scans source text
                // for class names, so `object-${preview}` is purged from the
                // build and the preview silently loses its fit.
                className={`h-full w-full ${preview === 'cover' ? 'object-cover' : 'object-contain'}`} />
            : <span className="text-[10px] text-gray-400">None</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(null)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-500 hover:text-red-600">
                <X className="w-4 h-4" /> Remove
              </button>
            )}
          </div>
          <input value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
            placeholder="…or paste an image URL" className={`${inputCls} text-xs`} />
          <span className="block text-xs text-gray-500">{hint}</span>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none';
