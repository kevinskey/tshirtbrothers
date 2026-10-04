// Embroidery quote requests — the admin half of the customer path.
//
// The flow (Kevin, 2026-10-03): customer uploads art + size + placement +
// garment preference + quantity, pays the $25 digitization deposit, and a
// row lands here marked 'paid'. The shop digitizes (the linked
// embroidery_jobs row carries the DST work), comes back with the stitch
// count, and this panel sends the quote.
//
// Pricing is the Lighthouse contract sheet x the house markup, computed
// SERVER-side (lib/embroideryPricing.js). The preview below is a dryRun
// call to the same endpoint that saves — one engine, zero drift — so what
// the admin sees is byte-identical to what the customer will be emailed.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, ExternalLink } from 'lucide-react';
import {
  fetchEmbroideryRequests,
  sendEmbroideryQuote,
  previewEmbroideryQuote,
  type EmbroideryRequest,
  type EmbroideryQuoteInput,
  type EmbroideryPriceLine,
} from '@/lib/api';

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  quoted: 'bg-green-100 text-green-800',
};

const RUSH_OPTIONS = [
  { key: 'standard',  label: 'Standard (5\u20137 days)' },
  { key: 'four_day',  label: '4 days (+25%)' },
  { key: 'two_three', label: '2\u20133 days (+50%)' },
  { key: 'next_day',  label: 'Next day (+75%)' },
  { key: 'same_day',  label: 'Same day (+100%)' },
] as const;

function money(cents: number) {
  const v = (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return cents < 0 ? `\u2212${v}` : v;
}

function QuoteForm({ request }: { request: EmbroideryRequest }) {
  const qc = useQueryClient();
  const reqItems = request.items ?? [];
  const multiGarment = request.garment_mode === 'tsb' && reqItems.length > 0;

  const [stitches, setStitches] = useState('');
  const [qty, setQty] = useState(String(request.quantity || 1));
  const [garment, setGarment] = useState('');
  // Multi-garment: one retail $/pc per catalog item, keyed by index.
  const [itemPrices, setItemPrices] = useState<string[]>(() => reqItems.map(() => ''));
  const [rush, setRush] = useState('standard');
  const [isCap, setIsCap] = useState(
    request.placement === 'hat_front' || reqItems.some((it) => it.placement === 'hat_front'),
  );
  const [capBack, setCapBack] = useState(false);
  const [preview, setPreview] = useState<{ lines: EmbroideryPriceLine[]; totalCents: number; costCents: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const stitchCount = parseInt(stitches.replace(/[^0-9]/g, ''), 10) || 0;
  const quantity = parseInt(qty.replace(/[^0-9]/g, ''), 10) || 0;
  const garmentCentsPerPiece = request.garment_mode === 'own'
    ? 0
    : Math.round((parseFloat(garment) || 0) * 100);

  // Every catalog item must be priced before the quote can go out — an
  // unpriced garment silently becoming free is exactly the kind of mistake
  // this preview exists to prevent.
  const garments = multiGarment
    ? reqItems.map((it, i) => ({
        label: `${it.product_name ?? 'Garment'}${it.style_number ? ` (${it.style_number})` : ''}`,
        centsPerPiece: Math.round((parseFloat(itemPrices[i] ?? '') || 0) * 100),
        quantity: it.quantity,
      }))
    : undefined;
  const garmentsReady = !multiGarment || garments!.every((g) => g.centsPerPiece > 0);

  const input: EmbroideryQuoteInput = {
    stitchCount, quantity, garmentCentsPerPiece, garments, rush, isCap, capBack,
  };

  // Debounced server-side preview — the engine lives in exactly one place.
  useEffect(() => {
    if (stitchCount <= 0 || quantity <= 0 || !garmentsReady) { setPreview(null); setPreviewError(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await previewEmbroideryQuote(request.id, input);
        setPreview(p);
        setPreviewError(null);
      } catch (e) {
        setPreview(null);
        setPreviewError((e as Error).message);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stitchCount, quantity, garmentCentsPerPiece, rush, isCap, capBack, request.id, JSON.stringify(garments)]);

  const send = useMutation({
    mutationFn: () => sendEmbroideryQuote(request.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['embroidery-requests'] }),
  });

  const field = 'mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm';

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-700">
          Stitch count
          <input type="text" inputMode="numeric" value={stitches} onChange={(e) => setStitches(e.target.value)}
            placeholder="e.g. 7500" className={`${field} w-28`} />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Qty
          <input type="text" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
            className={`${field} w-16`} />
        </label>
        {multiGarment ? null : request.garment_mode === 'tsb' ? (
          <label className="text-xs font-medium text-gray-700">
            Garment $/pc (retail)
            <input type="text" inputMode="decimal" value={garment} onChange={(e) => setGarment(e.target.value)}
              placeholder="e.g. 24.00" className={`${field} w-24`} />
          </label>
        ) : (
          <span className="pb-1.5 text-xs text-gray-500">Own garment \u2014 2% spoilage terms apply</span>
        )}
        <label className="text-xs font-medium text-gray-700">
          Turnaround
          <select value={rush} onChange={(e) => setRush(e.target.value)} className={`${field} w-40`}>
            {RUSH_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-gray-700">
          <input type="checkbox" checked={isCap} onChange={(e) => setIsCap(e.target.checked)} /> Cap
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-gray-700">
          <input type="checkbox" checked={capBack} onChange={(e) => setCapBack(e.target.checked)} /> Cap back
        </label>
      </div>

      {multiGarment && (
        <div className="mt-3 space-y-1.5">
          {reqItems.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {it.image_url && <img src={it.image_url} alt="" className="h-7 w-7 rounded bg-gray-100 object-contain" />}
              <span className="min-w-0 flex-1 truncate text-gray-700">
                {it.product_name}{it.style_number ? ` (${it.style_number})` : ''} × {it.quantity} · {it.placement.replace(/_/g, ' ')} · {it.desired_size}
              </span>
              <label className="flex items-center gap-1 font-medium text-gray-600">
                $/pc
                <input
                  type="text" inputMode="decimal" value={itemPrices[i] ?? ''}
                  onChange={(e) => setItemPrices((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder="0.00"
                  className="w-20 rounded border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
          ))}
          {!garmentsReady && <p className="text-[11px] text-amber-600">Price every garment before the preview appears.</p>}
        </div>
      )}

      {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
      {preview && (
        <div className="mt-3 rounded border border-gray-200 bg-white p-2 text-xs">
          {preview.lines.map((l, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="text-gray-600">{l.label}</span>
              <span className={l.retailCents < 0 ? 'text-green-700' : ''}>{money(l.retailCents)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total to customer</span><span>{money(preview.totalCents)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-gray-400">
            <span>Our vendor cost (Lighthouse)</span><span>{money(preview.costCents)}</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!preview || send.isPending} onClick={() => send.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
          Email this quote
        </button>
      </div>
      {send.isError && <p className="mt-2 text-xs text-red-600">{(send.error as Error).message}</p>}
    </div>
  );
}

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
          <option value="paid">Paid \u2014 needs quote</option>
          <option value="quoted">Quoted</option>
          <option value="awaiting_payment">Awaiting payment</option>
          <option value="all">All</option>
        </select>
      </div>

      {q.isPending && <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />}
      {q.isError && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
      {q.data?.length === 0 && (
        <p className="text-sm text-gray-500">Nothing here \u2014 paid requests appear when the $25 digitization clears.</p>
      )}

      <ul className="space-y-3">
        {q.data?.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-start gap-3">
              <a href={r.artwork_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={r.artwork_url} alt="" className="h-14 w-14 rounded object-contain bg-gray-100" />
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">#{r.id} \u00b7 {r.customer_name}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                  {r.quote_cents != null && <span className="text-xs text-gray-600">quoted {money(r.quote_cents)}</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-600">
                  {r.customer_email}{r.customer_phone ? ` \u00b7 ${r.customer_phone}` : ''}
                </p>
                <p className="mt-1 text-xs text-gray-700">
                  qty {r.quantity} \u00b7 {r.desired_size} \u00b7 {r.placement.replace(/_/g, ' ')}
                  {r.placement_note ? ` (${r.placement_note})` : ''} \u00b7{' '}
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
            {r.status === 'paid' && <QuoteForm request={r} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
