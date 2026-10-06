// The embroidery quote form — shared between the Embroidery tab's request
// list and the Quotes workflow (quote detail drawer), so working an
// embroidery job never requires leaving the quote.
//
// Pricing is the Lighthouse contract sheet x the house markup, computed
// SERVER-side (lib/embroideryPricing.js). The preview below is a dryRun
// call to the same endpoint that saves — one engine, zero drift — so what
// the admin sees is byte-identical to what the customer will be emailed.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Paperclip, FileText } from 'lucide-react';
import {
  fetchEmbroideryRequestsByQuote,
  createEmbroideryPaymentLink,
  sendEmbroideryQuote,
  previewEmbroideryQuote,
  uploadEmbroideryRequestFile,
  type EmbroideryRequest,
  type EmbroideryQuoteInput,
  type EmbroideryPriceLine,
} from '@/lib/api';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('could not read file'));
    r.readAsDataURL(file);
  });
}

// One hidden-input attach button — used for the per-design DST and PDF slots.
function AttachButton({ accept, label, busy, onFile }: {
  accept: string; label: string; busy: boolean; onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Paperclip className="h-3 w-3" aria-hidden />}
        {label}
      </button>
    </>
  );
}

export const EMBROIDERY_STATUS_STYLES: Record<string, string> = {
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  ready_to_quote: 'bg-purple-100 text-purple-800',
  quoted: 'bg-green-100 text-green-800',
};

const RUSH_OPTIONS = [
  { key: 'standard',  label: 'Standard (5–7 days)' },
  { key: 'four_day',  label: '4 days (+25%)' },
  { key: 'two_three', label: '2–3 days (+50%)' },
  { key: 'next_day',  label: 'Next day (+75%)' },
  { key: 'same_day',  label: 'Same day (+100%)' },
] as const;

export function embroideryMoney(cents: number) {
  const v = (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return cents < 0 ? `−${v}` : v;
}

export function EmbroideryQuoteForm({ request }: { request: EmbroideryRequest }) {
  const qc = useQueryClient();
  const reqItems = request.items ?? [];
  const multiGarment = request.garment_mode === 'tsb' && reqItems.length > 0;

  // One row per DESIGN — each has its own stitch count and run quantity
  // (two placements on one shirt = two runs). Seeded from design_count, with
  // a DST-parsed stitch count prefilling the first row when we have one.
  const [designRows, setDesignRows] = useState<Array<{ label: string; stitches: string; qty: string }>>(() =>
    Array.from({ length: Math.max(request.design_count || 1, 1) }, (_, i) => {
      // Stitch count prefill order: a count parsed from an attached DST wins,
      // then the request-level count (from a customer-supplied stitch file).
      const attached = request.design_files?.[i]?.stitch_count;
      return {
        label: request.design_files?.[i]?.label
          || ((request.design_count || 1) > 1 ? `Design ${i + 1}` : ''),
        stitches: attached ? String(attached)
          : i === 0 && request.stitch_count ? String(request.stitch_count) : '',
        qty: String(request.quantity || 1),
      };
    }));
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
  // Custom pricing lines — label + dollars, negative = discount/credit.
  const [extraRows, setExtraRows] = useState<Array<{ label: string; amount: string }>>([]);
  // Digitizer deliverables (DST + PDF profile) attach per design.
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sending is gated server-side until the digitization payment clears (or a
  // customer stitch file made digitizing moot); everything else works now.
  const canSend = !!(request.digitization_paid_at || request.stitch_file_url);

  async function attachFile(di: number, kind: 'pdf' | 'dst', file: File) {
    setUploading(`${di}:${kind}`);
    setUploadError(null);
    try {
      const b64 = await fileToBase64(file);
      const res = await uploadEmbroideryRequestFile(request.id, kind === 'pdf'
        ? { designIndex: di, pdfBase64: b64, pdfName: file.name }
        : { designIndex: di, dstBase64: b64, dstName: file.name });
      if (kind === 'dst' && res.parsedStitchCount) {
        setDesignRows((prev) => prev.map((r, j) => j === di ? { ...r, stitches: String(res.parsedStitchCount) } : r));
      }
      // Prefix match covers both the Embroidery tab list and the per-quote
      // lookup in the quote drawer.
      qc.invalidateQueries({ queryKey: ['embroidery-requests'] });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  const designs = designRows.map((d) => ({
    label: d.label.trim() || undefined,
    stitchCount: parseInt(d.stitches.replace(/[^0-9]/g, ''), 10) || 0,
    quantity: parseInt(d.qty.replace(/[^0-9]/g, ''), 10) || 0,
  }));
  const designsOk = designs.every((d) => d.stitchCount > 0 && d.quantity > 0);
  const stitchCount = designs.reduce((t, d) => t + d.stitchCount, 0);
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

  // Custom lines: a row counts once it has a label and a non-zero amount; a
  // half-filled row holds the preview so a typo can't ship as $0.
  const extraLines = extraRows.map((r) => ({
    label: r.label.trim(),
    amountCents: Math.round((parseFloat(r.amount) || 0) * 100),
  }));
  const extrasOk = extraRows.length === 0
    || extraLines.every((l) => l.label !== '' && Number.isInteger(l.amountCents) && l.amountCents !== 0);

  const input: EmbroideryQuoteInput = {
    stitchCount, quantity, garmentCentsPerPiece, garments, rush, isCap, capBack,
    designs: designs.map((d) => ({ label: d.label, stitchCount: d.stitchCount, quantity: d.quantity })),
    extraLines: extraLines.length > 0 ? extraLines : undefined,
  };

  // Debounced server-side preview — the engine lives in exactly one place.
  // Unpriced garments no longer hold the preview hostage (Kevin 2026-10-05,
  // "pricing should show here"): the embroidery math shows immediately and
  // unpriced garments simply aren't in it yet. Sending stays gated below.
  useEffect(() => {
    if (!designsOk || quantity <= 0 || !extrasOk) { setPreview(null); setPreviewError(null); return; }
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
  }, [quantity, garmentCentsPerPiece, rush, isCap, capBack, request.id, JSON.stringify(garments), JSON.stringify(designs), JSON.stringify(extraLines)]);

  const send = useMutation({
    mutationFn: () => sendEmbroideryQuote(request.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['embroidery-requests'] }),
  });

  // Fresh digitization checkout link — the intake session dies after 24h,
  // and without payment the quote email above stays locked.
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const payLink = useMutation({
    mutationFn: () => createEmbroideryPaymentLink(request.id),
    onSuccess: async (d) => {
      setPayLinkUrl(d.url);
      try { await navigator.clipboard.writeText(d.url); } catch { /* shown below regardless */ }
    },
  });

  const field = 'mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm';

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5">
          {designRows.map((d, di) => {
            const attached = request.design_files?.[di];
            return (
            <div key={di} className="space-y-1">
            <div className="flex flex-wrap items-end gap-2">
              {designRows.length > 1 && (
                <label className="text-xs font-medium text-gray-700">
                  Design
                  <input type="text" value={d.label}
                    onChange={(e) => setDesignRows((prev) => prev.map((r, j) => j === di ? { ...r, label: e.target.value } : r))}
                    className={`${field} w-32`} />
                </label>
              )}
              <label className="text-xs font-medium text-gray-700">
                Stitch count
                <input type="text" inputMode="numeric" value={d.stitches}
                  onChange={(e) => setDesignRows((prev) => prev.map((r, j) => j === di ? { ...r, stitches: e.target.value } : r))}
                  placeholder="e.g. 7500" className={`${field} w-28`} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Run qty
                <input type="text" inputMode="numeric" value={d.qty}
                  onChange={(e) => setDesignRows((prev) => prev.map((r, j) => j === di ? { ...r, qty: e.target.value } : r))}
                  className={`${field} w-16`} />
              </label>
              {designRows.length > 1 && (
                <button type="button" onClick={() => setDesignRows((prev) => prev.filter((_, j) => j !== di))}
                  className="pb-1.5 text-xs text-gray-400 hover:text-red-600">remove</button>
              )}
            </div>
            {/* Digitizer deliverables for THIS design: the DST goes to the
                machine, the PDF profile goes to the customer with the quote. */}
            <div className="flex flex-wrap items-center gap-2 pl-0.5">
              <AttachButton accept=".dst,.pes,.emb,.exp,.jef,.vp3,.xxx,.hus" label="Attach DST"
                busy={uploading === `${di}:dst`} onFile={(f) => attachFile(di, 'dst', f)} />
              <AttachButton accept=".pdf,application/pdf" label="Attach PDF profile"
                busy={uploading === `${di}:pdf`} onFile={(f) => attachFile(di, 'pdf', f)} />
              {attached?.dst_url && (
                <a href={attached.dst_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                  <Paperclip className="h-3 w-3" aria-hidden />{attached.dst_name || 'stitch file'}
                </a>
              )}
              {attached?.pdf_url && (
                <a href={attached.pdf_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                  <FileText className="h-3 w-3" aria-hidden />{attached.pdf_name || 'PDF profile'}
                </a>
              )}
            </div>
            </div>
            );
          })}
          {uploadError && <p className="text-[11px] text-red-600">{uploadError}</p>}
          <button type="button"
            onClick={() => setDesignRows((prev) => prev.length >= 6 ? prev : [...prev, { label: `Design ${prev.length + 1}`, stitches: '', qty: qty }])}
            className="text-xs font-medium text-orange-600 hover:underline">+ add design</button>
        </div>
        <label className="text-xs font-medium text-gray-700">
          Garment qty
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
          <span className="pb-1.5 text-xs text-gray-500">Own garment — 2% spoilage terms apply</span>
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
                {it.product_name}{it.style_number ? ` (${it.style_number})` : ''}
                {it.color ? ` · ${it.color}` : ''} × {it.quantity}
                {it.sizes ? ` [${Object.entries(it.sizes).map(([k, v]) => `${k}:${v}`).join(' ')}]` : ''}
                {' · '}{it.placement.replace(/_/g, ' ')} · {it.desired_size}
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
          {!garmentsReady && <p className="text-[11px] text-amber-600">Unpriced garments aren't in the total yet — price every garment before emailing the quote.</p>}
        </div>
      )}

      {/* Custom pricing lines — anything the Lighthouse sheet doesn't model:
          art charges, extra placements, discounts (negative amounts). They're
          priced by the same server engine so the saved quote and the email
          carry them verbatim. */}
      <div className="mt-3 space-y-1.5">
        {extraRows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-gray-700">
              Line item
              <input type="text" value={r.label} placeholder="e.g. Art charge — 1 hr"
                onChange={(e) => setExtraRows((prev) => prev.map((row, j) => j === i ? { ...row, label: e.target.value } : row))}
                className={`${field} w-56`} />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Amount $ (− for discount)
              <input type="text" inputMode="decimal" value={r.amount} placeholder="e.g. 40.00"
                onChange={(e) => setExtraRows((prev) => prev.map((row, j) => j === i ? { ...row, amount: e.target.value } : row))}
                className={`${field} w-28`} />
            </label>
            <button type="button" onClick={() => setExtraRows((prev) => prev.filter((_, j) => j !== i))}
              className="pb-1.5 text-xs text-gray-400 hover:text-red-600">remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setExtraRows((prev) => [...prev, { label: '', amount: '' }])}
          className="text-xs font-medium text-orange-600 hover:underline">+ add pricing line</button>
        {!extrasOk && <p className="text-[11px] text-amber-600">Every custom line needs a label and a non-zero amount before the preview appears.</p>}
      </div>

      {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
      {preview && (
        <div className="mt-3 rounded border border-gray-200 bg-white p-2 text-xs">
          {preview.lines.map((l, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="text-gray-600">{l.label}</span>
              <span className={l.retailCents < 0 ? 'text-green-700' : ''}>{embroideryMoney(l.retailCents)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total to customer</span><span>{embroideryMoney(preview.totalCents)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-gray-400">
            <span>Our vendor cost (Lighthouse)</span><span>{embroideryMoney(preview.costCents)}</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
        {!canSend && (
          <span className="text-[11px] text-amber-600">
            Awaiting digitization payment — files and preview work now; the email unlocks when it clears.
          </span>
        )}
        {!canSend && (
          <button
            type="button"
            disabled={payLink.isPending}
            onClick={() => payLink.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          >
            {payLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {payLinkUrl ? 'Copy payment link again' : 'Get payment link'}
          </button>
        )}
        <button type="button" disabled={!preview || !canSend || !garmentsReady || send.isPending} onClick={() => send.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
          Email this quote
        </button>
      </div>
      {send.isError && <p className="mt-2 text-xs text-red-600">{(send.error as Error).message}</p>}
      {payLink.isError && <p className="mt-2 text-xs text-red-600">{(payLink.error as Error).message}</p>}
      {payLinkUrl && (
        <p className="mt-2 break-all rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
          Payment link copied to clipboard — text or email it to the customer:{' '}
          <a href={payLinkUrl} target="_blank" rel="noreferrer" className="underline">{payLinkUrl}</a>
        </p>
      )}
    </div>
  );
}

// Drop-in section for the quote detail drawer: when the quote has been
// converted to an embroidery request (embroidery_requests.quote_id), the
// whole embroidery workflow — DST/PDF attachments, stitch counts, pricing
// lines, preview, send — lives right here instead of a separate tab.
export function QuoteEmbroiderySection({ quoteId }: { quoteId: number }) {
  const q = useQuery({
    queryKey: ['embroidery-requests', 'by-quote', quoteId],
    queryFn: () => fetchEmbroideryRequestsByQuote(quoteId),
  });

  const requests = (q.data ?? []).filter((r) => r.status !== 'superseded');
  if (requests.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Embroidery</p>
      <div className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Request #{r.id}</strong>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${EMBROIDERY_STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {r.status.replace(/_/g, ' ')}
              </span>
              {r.quote_cents != null && <span className="text-xs text-gray-600">quoted {embroideryMoney(r.quote_cents)}</span>}
            </div>
            <p className="mt-1 text-xs text-gray-700">
              qty {r.quantity} · {r.desired_size} · {r.placement.replace(/_/g, ' ')}
              {' · '}{r.garment_mode === 'own' ? 'own garment' : r.garment_choice}
            </p>
            {r.notes && <p className="mt-0.5 text-xs italic text-gray-500">{r.notes}</p>}
            <EmbroideryQuoteForm request={r} />
          </div>
        ))}
      </div>
    </div>
  );
}
