import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, Trash2, FolderOpen, Loader2, Check } from 'lucide-react';
import {
  fetchArtCategories,
  fetchAdminArtLibrary,
  createArtCategory,
  updateArtCategory,
  deleteArtCategory,
  bulkSetArtCategory,
  type ArtCategory,
  type ArtDesign,
} from '@/lib/api';

// Admin catalog manager for the public-facing Art Library. Left column lists
// categories with counts + add/rename/delete; right column shows designs in
// the active category with checkbox multi-select and a "Move to" action.

const ALL = '__all__';

export default function ArtLibraryAdmin() {
  const qc = useQueryClient();
  const [active, setActive] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [newCat, setNewCat] = useState('');
  const [creating, setCreating] = useState(false);

  // Categories list (with counts).
  const categoriesQ = useQuery({
    queryKey: ['admin', 'art-categories'],
    queryFn: fetchArtCategories,
  });

  // Designs grid.
  const designsQ = useQuery({
    queryKey: ['admin', 'art-library', active, search, page],
    queryFn: () => fetchAdminArtLibrary({
      category: active === ALL ? undefined : active,
      q: search || undefined,
      page,
      limit: 60,
    }),
  });

  useEffect(() => { setPage(1); }, [active, search]);
  useEffect(() => { setSelected(new Set()); }, [active, page]);

  const categories = categoriesQ.data ?? [];
  const totalCount = useMemo(
    () => categories.reduce((n, c) => n + c.count, 0),
    [categories],
  );

  // ── Mutations ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data: { name: string; display_name?: string | null }) => createArtCategory(data),
    onSuccess: () => {
      setNewCat(''); setCreating(false);
      qc.invalidateQueries({ queryKey: ['admin', 'art-categories'] });
    },
    onError: (err: Error) => alert('Create failed: ' + err.message),
  });

  const renameMut = useMutation({
    mutationFn: (vars: { name: string; new_name: string }) => updateArtCategory(vars.name, { new_name: vars.new_name }),
    onSuccess: (data) => {
      setEditingCat(null);
      qc.invalidateQueries({ queryKey: ['admin', 'art-categories'] });
      qc.invalidateQueries({ queryKey: ['admin', 'art-library'] });
      if (active !== ALL) setActive(data.name);
    },
    onError: (err: Error) => alert('Rename failed: ' + err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteArtCategory(name, 'general'),
    onSuccess: (_d, name) => {
      qc.invalidateQueries({ queryKey: ['admin', 'art-categories'] });
      qc.invalidateQueries({ queryKey: ['admin', 'art-library'] });
      if (active === name) setActive(ALL);
    },
    onError: (err: Error) => alert('Delete failed: ' + err.message),
  });

  const bulkMut = useMutation({
    mutationFn: (vars: { ids: number[]; category: string }) => bulkSetArtCategory(vars.ids, vars.category),
    onSuccess: (data) => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'art-categories'] });
      qc.invalidateQueries({ queryKey: ['admin', 'art-library'] });
      alert(`Moved ${data.updated} design${data.updated === 1 ? '' : 's'}.`);
    },
    onError: (err: Error) => alert('Move failed: ' + err.message),
  });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900">Art Library Catalog</h2>
        <p className="text-xs text-gray-500 hidden sm:block">Organize your Add Art panel — categories, counts, bulk-move.</p>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        {/* Categories panel */}
        <aside className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Categories</span>
            <button
              onClick={() => setCreating((v) => !v)}
              className="text-red-700 hover:text-red-800"
              title="New category"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {creating && (
            <div className="p-2 border-b border-gray-100 bg-red-50/30 space-y-1">
              <input
                type="text"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="category slug (e.g. weddings)"
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5"
                style={{ fontSize: '16px' }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCat.trim()) createMut.mutate({ name: newCat.trim() });
                  if (e.key === 'Escape') { setCreating(false); setNewCat(''); }
                }}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => newCat.trim() && createMut.mutate({ name: newCat.trim() })}
                  disabled={!newCat.trim() || createMut.isPending}
                  className="flex-1 text-xs font-semibold bg-red-600 text-white px-2 py-1 rounded disabled:bg-gray-300"
                >
                  {createMut.isPending ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewCat(''); }}
                  className="text-xs font-medium text-gray-600 px-2 py-1 rounded hover:bg-gray-100"
                >Cancel</button>
              </div>
            </div>
          )}
          <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-auto">
            <li>
              <button
                onClick={() => setActive(ALL)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${active === ALL ? 'bg-red-50 text-red-700 font-semibold' : ''}`}
              >
                <span><FolderOpen className="w-3.5 h-3.5 inline mr-1.5" />All</span>
                <span className="text-xs text-gray-500">{totalCount}</span>
              </button>
            </li>
            {categoriesQ.isLoading && (
              <li className="px-3 py-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading…</li>
            )}
            {categories.map((c) => {
              const isActive = c.name === active;
              const isEditing = editingCat === c.name;
              return (
                <li key={c.name}>
                  {isEditing ? (
                    <div className="px-2 py-1.5 flex gap-1 bg-gray-50">
                      <input
                        type="text"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="flex-1 text-sm border border-gray-200 rounded px-1.5 py-1"
                        style={{ fontSize: '16px' }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editDraft.trim()) renameMut.mutate({ name: c.name, new_name: editDraft.trim() });
                          if (e.key === 'Escape') setEditingCat(null);
                        }}
                      />
                      <button
                        onClick={() => editDraft.trim() && renameMut.mutate({ name: c.name, new_name: editDraft.trim() })}
                        className="text-green-700 hover:text-green-800 p-1"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className={`flex items-center group ${isActive ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <button
                        onClick={() => setActive(c.name)}
                        className={`flex-1 text-left px-3 py-2 text-sm flex items-center justify-between ${isActive ? 'text-red-700 font-semibold' : ''}`}
                      >
                        <span className="truncate">{c.display_name || c.name}</span>
                        <span className="text-xs text-gray-500">{c.count}</span>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 pr-1.5 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingCat(c.name); setEditDraft(c.name); }}
                          className="text-gray-400 hover:text-gray-700 p-1"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (c.name === 'general') { alert('Can\'t delete the general fallback category.'); return; }
                            if (confirm(`Delete "${c.name}"? Its ${c.count} design${c.count === 1 ? '' : 's'} will be moved to general.`)) {
                              deleteMut.mutate(c.name);
                            }
                          }}
                          className="text-gray-400 hover:text-rose-600 p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Designs panel */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search designs by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                style={{ fontSize: '16px' }}
              />
            </div>
            {selected.size > 0 && (
              <BulkMoveBar
                count={selected.size}
                categories={categories}
                onMove={(target) => bulkMut.mutate({ ids: Array.from(selected), category: target })}
                onClear={() => setSelected(new Set())}
                pending={bulkMut.isPending}
              />
            )}
          </div>

          <div className="p-3">
            {designsQ.isLoading ? (
              <div className="py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : (designsQ.data?.designs.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-gray-400">No designs in this category.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {designsQ.data!.designs.map((d) => (
                    <DesignTile
                      key={d.id}
                      design={d}
                      selected={selected.has(d.id)}
                      onToggle={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
                {designsQ.data && designsQ.data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border border-gray-200 rounded disabled:opacity-40 hover:border-red-400"
                    >← Previous</button>
                    <span className="text-gray-500">
                      Page {designsQ.data.page} of {designsQ.data.totalPages} · {designsQ.data.total} designs
                    </span>
                    <button
                      disabled={page >= designsQ.data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 border border-gray-200 rounded disabled:opacity-40 hover:border-red-400"
                    >Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DesignTile({
  design, selected, onToggle,
}: {
  design: ArtDesign;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
        selected ? 'border-red-500 ring-2 ring-red-200' : 'border-gray-200 hover:border-red-400'
      }`}
    >
      <img
        src={design.thumbnail_url || design.image_url}
        alt={design.name}
        loading="lazy"
        className="w-full h-full object-contain bg-gray-50"
      />
      {selected && (
        <div className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md">
          <Check className="w-4 h-4" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-2 py-1 truncate">
        {design.name}
      </div>
    </button>
  );
}

function BulkMoveBar({
  count, categories, onMove, onClear, pending,
}: {
  count: number;
  categories: ArtCategory[];
  onMove: (category: string) => void;
  onClear: () => void;
  pending: boolean;
}) {
  const [pick, setPick] = useState('');
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
      <span className="text-sm font-semibold text-red-700">{count} selected</span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
        style={{ fontSize: '16px' }}
      >
        <option value="">Move to…</option>
        {categories.map((c) => <option key={c.name} value={c.name}>{c.display_name || c.name}</option>)}
      </select>
      <button
        disabled={!pick || pending}
        onClick={() => { onMove(pick); setPick(''); }}
        className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded disabled:bg-gray-300"
      >
        {pending ? 'Moving…' : 'Apply'}
      </button>
      <button
        onClick={onClear}
        className="text-xs font-medium text-gray-600 hover:text-gray-800"
      >Clear</button>
    </div>
  );
}
