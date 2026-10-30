import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import {
  fetchShelfStock, saveShelfStock, updateShelfStock, deleteShelfStock,
  type ShelfStock,
} from '@/lib/api';

// What's physically on the shelf in Fairburn — leftovers, overruns, samples,
// odd sizes. TSB orders blanks per job and doesn't stock to a par level, so
// this deliberately has no reorder points and nothing deducts itself: every
// number is a hand edit. The one question it answers, asked while quoting,
// is "can I pull these off the shelf instead of ordering?"
//
// Counting the same style/color/size twice corrects the existing pile rather
// than adding a second row (unique index on lower(style/color/size)), so a
// second pass through the shelf fixes the first rather than doubling it.

const BLANK = { style_name: '', color: '', size: '', qty: '', note: '' };

export default function ShelfStockAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({ ...BLANK });
  const [error, setError] = useState<string | null>(null);

  const shelfQ = useQuery({ queryKey: ['admin', 'shelf-stock'], queryFn: fetchShelfStock });
  const rows = useMemo(() => shelfQ.data ?? [], [shelfQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'shelf-stock'] });

  const addMutation = useMutation({
    mutationFn: saveShelfStock,
    onSuccess: () => { setDraft({ ...BLANK }); setError(null); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const patchMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Parameters<typeof updateShelfStock>[1]) =>
      updateShelfStock(id, data),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const removeMutation = useMutation({
    mutationFn: deleteShelfStock,
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.style_name, r.color, r.size, r.note ?? ''].join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const totalPieces = rows.reduce((sum, r) => sum + r.qty, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(draft.qty);
    if (!draft.style_name.trim()) { setError('Give the garment a name — "Gildan 5000" is enough.'); return; }
    if (!Number.isFinite(qty) || qty < 0) { setError('How many? A whole number, 0 or more.'); return; }
    addMutation.mutate({
      style_name: draft.style_name.trim(),
      color: draft.color.trim(),
      size: draft.size.trim(),
      qty: Math.floor(qty),
      note: draft.note.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-orange-600" />
            Shelf Stock
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            What&apos;s physically on the shelf — leftovers, overruns, samples. Not an inventory
            system: nothing deducts itself, so adjust a count when you pull stock.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{totalPieces}</p>
          <p className="text-xs text-gray-500">pieces across {rows.length} piles</p>
        </div>
      </div>

      {/* Counting form. Style is the only required field — don't make Doc
          look up a SKU while standing at a shelf with a phone in one hand. */}
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Count a pile</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input
            value={draft.style_name}
            onChange={(e) => setDraft({ ...draft, style_name: e.target.value })}
            placeholder="Gildan 5000"
            className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <input
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            placeholder="Black"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <input
            value={draft.size}
            onChange={(e) => setDraft({ ...draft, size: e.target.value })}
            placeholder="L"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <input
            value={draft.qty}
            onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
            inputMode="numeric"
            placeholder="How many"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        <input
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="Where it came from — “overrun, Quote #214”, “sample”, “backs are clean”"
          className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
        />
        <p className="mt-2 text-xs text-gray-500">
          Counting the same style, color and size again corrects that pile instead of adding a
          second one — a second pass through the shelf fixes the first.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the shelf"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
        />
      </div>

      {shelfQ.isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {rows.length === 0
            ? 'Nothing counted yet. Walk the shelf once and add what you find — style, color, size, how many.'
            : 'Nothing on the shelf matches that.'}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Garment</th>
                <th className="px-3 py-2 text-left font-semibold">Color</th>
                <th className="px-3 py-2 text-left font-semibold">Size</th>
                <th className="px-3 py-2 text-left font-semibold">On hand</th>
                <th className="px-3 py-2 text-left font-semibold">Note</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row) => (
                <ShelfRow
                  key={row.id}
                  row={row}
                  onQty={(qty) => patchMutation.mutate({ id: row.id, qty })}
                  onNote={(note) => patchMutation.mutate({ id: row.id, note })}
                  onDelete={() => removeMutation.mutate(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// One pile. Qty and note commit on blur rather than per keystroke — this gets
// used standing at a shelf on a phone, where a request per character is both
// slow and a good way to save a half-typed number.
function ShelfRow({ row, onQty, onNote, onDelete }: {
  row: ShelfStock;
  onQty: (qty: number) => void;
  onNote: (note: string) => void;
  onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(row.qty));
  const [note, setNote] = useState(row.note ?? '');

  return (
    <tr className={row.qty === 0 ? 'bg-gray-50/60' : undefined}>
      <td className="px-3 py-2 font-medium text-gray-900">{row.style_name}</td>
      <td className="px-3 py-2 text-gray-600">{row.color || '—'}</td>
      <td className="px-3 py-2 text-gray-600 uppercase">{row.size || '—'}</td>
      <td className="px-3 py-2">
        <input
          value={qty}
          inputMode="numeric"
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = Number(qty);
            if (Number.isFinite(n) && n >= 0 && Math.floor(n) !== row.qty) onQty(Math.floor(n));
            else setQty(String(row.qty));
          }}
          className={`w-20 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-orange-500 ${
            row.qty === 0 ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-900 font-semibold'
          }`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (row.note ?? '')) onNote(note); }}
          placeholder="—"
          className="w-full min-w-[12rem] border border-transparent hover:border-gray-200 focus:border-orange-500 rounded-lg px-2 py-1 text-sm text-gray-600 focus:outline-none"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onDelete}
          aria-label={`Remove ${row.style_name} from the shelf`}
          className="p-1.5 text-gray-400 hover:text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
