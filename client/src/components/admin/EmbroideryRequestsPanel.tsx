// Embroidery quote requests — the admin half of the customer path.
//
// The flow (Kevin, 2026-10-03): customer uploads art + size + placement +
// garment preference + quantity, pays the $25 digitization deposit, and a
// row lands here marked 'paid'. The shop digitizes (the linked
// embroidery_jobs row carries the DST work), comes back with the stitch
// count, and this panel sends the quote.
//
// The quote form itself lives in EmbroideryQuoteForm.tsx — shared with the
// Quotes workflow, which embeds the same form in the quote detail drawer.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ExternalLink, FileText } from 'lucide-react';
import { fetchEmbroideryRequests } from '@/lib/api';
import {
  EmbroideryQuoteForm,
  EMBROIDERY_STATUS_STYLES,
  embroideryMoney,
} from './EmbroideryQuoteForm';

export default function EmbroideryRequestsPanel() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'quoted' | 'awaiting_payment'>('paid');
  const q = useQuery({
    queryKey: ['embroidery-requests', statusFilter],
    queryFn: () => fetchEmbroideryRequests(statusFilter),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Quote Requests</h3>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="ml-auto rounded border border-gray-300 px-2 py-1 text-xs" aria-label="Filter requests by status">
          <option value="paid">Paid — needs quote</option>
          <option value="quoted">Quoted</option>
          <option value="awaiting_payment">Awaiting payment</option>
          <option value="all">All</option>
        </select>
      </div>

      {q.isPending && <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />}
      {q.isError && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
      {q.data?.length === 0 && (
        <p className="text-sm text-gray-500">Nothing here — paid requests appear when the $25 digitization clears.</p>
      )}

      <ul className="space-y-3">
        {q.data?.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-start gap-3">
              {/* Stitch-file-only requests have no artwork image — the DST
                  IS the artwork, so link the tile to it instead. */}
              {r.artwork_url ? (
                <a href={r.artwork_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img src={r.artwork_url} alt="" className="h-14 w-14 rounded object-contain bg-gray-100" />
                </a>
              ) : (
                <a href={r.stitch_file_url ?? undefined} target="_blank" rel="noopener noreferrer"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400"
                  title={r.stitch_file_name ?? 'stitch file'}>
                  <FileText className="h-6 w-6" aria-hidden />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">#{r.id} · {r.customer_name}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${EMBROIDERY_STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                  {r.quote_cents != null && <span className="text-xs text-gray-600">quoted {embroideryMoney(r.quote_cents)}</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-600">
                  {r.customer_email}{r.customer_phone ? ` · ${r.customer_phone}` : ''}
                </p>
                <p className="mt-1 text-xs text-gray-700">
                  qty {r.quantity} · {r.desired_size} · {r.placement.replace(/_/g, ' ')}
                  {r.placement_note ? ` (${r.placement_note})` : ''} ·{' '}
                  {r.garment_mode === 'own' ? 'own garment' : r.garment_choice}
                </p>
                {r.notes && <p className="mt-0.5 text-xs italic text-gray-500">{r.notes}</p>}
                {r.embroidery_job_id && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-400">
                    <ExternalLink className="h-3 w-3" aria-hidden /> digitizing job #{r.embroidery_job_id}
                  </p>
                )}
              </div>
            </div>
            {(r.status === 'paid' || r.status === 'ready_to_quote' || r.status === 'awaiting_payment') && <EmbroideryQuoteForm request={r} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
