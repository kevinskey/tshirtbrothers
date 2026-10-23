// Storefront tab — the words and image at the top of the shop.
//
// Content is stored as a free-form jsonb body under a slot key, so the
// server imposes no shape. That flexibility has to stop at the UI: an owner
// needs named fields, not a JSON editor. This file is where a slot's fields
// are declared, and it is the one place to edit when a new slot is added.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { type BoContentBlock, fetchContent, saveContent } from './api';

interface SlotField {
  name: string;
  label: string;
  hint?: string;
  type?: 'text' | 'textarea';
}

// The hero every storefront renders. Keep the field names stable — they are
// what the storefront components read out of the jsonb body.
const HERO_FIELDS: SlotField[] = [
  { name: 'eyebrow',  label: 'Eyebrow',    hint: 'Small line above the headline, e.g. "Fall 2026 · Now shipping"' },
  { name: 'headline', label: 'Headline',   hint: 'The big one' },
  { name: 'subcopy',  label: 'Subcopy',    type: 'textarea' },
  { name: 'cta_label', label: 'Button text' },
  { name: 'cta_href',  label: 'Button link', hint: 'Where the button goes, e.g. #shop' },
  // Not "background" any more: the LHT hero renders this in its own
  // column beside the copy rather than as a faded backdrop behind it,
  // so an owner no longer has to pick a photo whose empty space happens
  // to fall where the headline lands.
  { name: 'image_url', label: 'Hero image URL', hint: 'Shown beside the headline. Any shape works — it is cropped to a 4:3 frame from the left.' },
];

export default function StorefrontTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [block, setBlock] = useState<BoContentBlock | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { content } = await fetchContent(slug, authHeaders);
      const hero = content.find((c) => c.key === 'hero' && c.sort_order === 0) ?? null;
      setBlock(hero);
      setValues(
        Object.fromEntries(HERO_FIELDS.map((f) => [f.name, String(hero?.body?.[f.name] ?? '')])),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your storefront content');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  async function save() {
    setSaving(true);
    try {
      // Empty strings are dropped rather than stored, so a blank field means
      // "fall back to the storefront's own default" instead of rendering an
      // empty headline.
      const body = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''),
      );
      const { block: saved } = await saveContent(slug, { key: 'hero', body, sort_order: 0 }, authHeaders);
      setBlock(saved);
      toast.success('Storefront updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  const dirty = HERO_FIELDS.some(
    (f) => (values[f.name] ?? '').trim() !== String(block?.body?.[f.name] ?? ''),
  );

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold text-gray-900">Storefront</h2>
      <p className="mb-5 text-sm text-gray-500">
        The banner at the top of your shop. Leave a field blank to use your
        store's built-in wording.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        {HERO_FIELDS.map((f) => (
          <label key={f.name} className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea rows={3} className={inputCls}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
            ) : (
              <input className={inputCls}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
            )}
            {f.hint && <span className="mt-1 block text-xs text-gray-400">{f.hint}</span>}
          </label>
        ))}

        {values.image_url?.trim() && (
          <img src={values.image_url} alt="" className="h-32 w-full rounded object-cover bg-gray-100"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={() => void load()} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40">
            <RotateCcw className="w-3.5 h-3.5" /> Revert
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>

      {block?.updated_at && (
        <p className="mt-3 text-xs text-gray-400">
          Last changed {new Date(block.updated_at).toLocaleString()}
          {block.updated_by ? ` by ${block.updated_by}` : ''}
        </p>
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none';
