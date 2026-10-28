// Collections tab — the groupings a store sorts its products into.
//
// Called "collections" in the UI and `store_categories` in the database.
// The storefront word is the one shoppers see on the page, so it is the one
// the owner is shown.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, X } from 'lucide-react';
import { type BoCategory, deleteCategory, fetchCategories, saveCategory } from './api';

export default function CategoriesTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [categories, setCategories] = useState<BoCategory[] | null>(null);
  const [editing, setEditing] = useState<Partial<BoCategory> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { categories: rows } = await fetchCategories(slug, authHeaders);
      setCategories(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load collections');
      setCategories([]);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  async function remove(category: BoCategory) {
    // Deleting a collection only unfiles its products; nothing is lost, so
    // this asks once rather than making the owner type the name.
    const count = category.product_count ?? 0;
    const warning = count
      ? `Delete "${category.name}"? ${count} product${count === 1 ? '' : 's'} will stay in your shop but lose this grouping.`
      : `Delete "${category.name}"?`;
    if (!window.confirm(warning)) return;

    try {
      await deleteCategory(slug, category.id, authHeaders);
      toast.success(`Deleted "${category.name}"`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  if (categories === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Collections</h2>
          <p className="text-sm text-gray-500">
            Group products so shoppers can browse them — "Fall 2026", "Sets",
            "Accessories". A product can be in more than one.
          </p>
        </div>
        <button onClick={() => setEditing({ name: '', sort_order: categories.length })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!categories.length && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          No collections yet. Create one, then assign products to it from the
          Products tab.
        </div>
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{c.name}</p>
              <p className="text-sm text-gray-500">
                <span className="font-mono text-xs text-gray-400">{c.slug}</span>
                {' · '}{c.product_count ?? 0} product{(c.product_count ?? 0) === 1 ? '' : 's'}
                {c.active ? '' : ' · hidden'}
              </p>
            </div>
            <button onClick={() => setEditing(c)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900">
              Edit
            </button>
            <button onClick={() => remove(c)} aria-label={`Delete ${c.name}`}
              className="p-2 text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditCategoryModal
          slug={slug} authHeaders={authHeaders} category={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditCategoryModal({ slug, authHeaders, category, onClose, onSaved }: {
  slug: string;
  authHeaders: Record<string, string>;
  category: Partial<BoCategory>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(category.name ?? '');
  const [description, setDescription] = useState(category.description ?? '');
  const [imageUrl, setImageUrl] = useState(category.image_url ?? '');
  const [active, setActive] = useState(category.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError('Give the collection a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveCategory(slug, {
        // Only send id when editing — omitting it is what makes the server
        // insert rather than update.
        ...(category.id ? { id: category.id } : {}),
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        sort_order: category.sort_order ?? 0,
        active,
      }, authHeaders);
      toast.success(category.id ? `Saved "${name.trim()}"` : `Created "${name.trim()}"`);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="font-bold text-gray-900">{category.id ? 'Edit collection' : 'New collection'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Image URL</span>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300" />
            Show this collection in the shop
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none';
