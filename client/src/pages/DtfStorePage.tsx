import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Minus, Plus, Upload, Loader2, CheckCircle2, AlertTriangle, ArrowUpCircle,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

/* ────────────────────────────────────────────────────────────────────── */
/*  Types — mirror server/routes/gangsheetStore.js                        */
/* ────────────────────────────────────────────────────────────────────── */

type TierKey = 'standard' | 'rush' | 'hot_rush';
type TierAvailability = { available: boolean; reason?: string };
type DtfConfig = {
  rates: Record<TierKey, number>;          // cents / ft
  tiers: Record<TierKey, TierAvailability>;
  min_ft: number;
  max_ft: number;
  shipping_flat_cents: number;
  promises: Record<TierKey, string>;
};

// fileName is display-only (never sent to the server) — carried along so a
// sessionStorage-restored upload (see UPLOAD_STASH_KEY below) can render the
// same "File uploaded" UI, original name and all, without re-fetching.
type UploadedFile = { file_key: string; width_px: number; height_px: number; fileName?: string };

type ShipAddress = { line1: string; city: string; state: string; zip: string };

// width_px/height_px are deliberately absent — the server now derives both
// from the /upload-issued file_key itself (embedded in the key as
// <uuid>-<width>x<height>.png) rather than trusting client-sent values.
type CheckoutBody = {
  length_ft: number;
  tier: TierKey;
  delivery: 'pickup' | 'ship';
  file_key: string;
  name: string;
  email: string;
  note?: string;
  ship_address?: ShipAddress;
  attested: boolean;
};

const TIER_ORDER: readonly TierKey[] = ['standard', 'rush', 'hot_rush'];
const TIER_LABEL: Record<TierKey, string> = { standard: 'Standard', rush: 'Rush', hot_rush: 'Hot Rush' };

// Where the confirmation page picks up the tier promise text. DtfSuccessPage
// reads this from sessionStorage only — no network fetch — so it can stay
// "dumb" per spec while still showing a real promise instead of nothing.
const SUCCESS_STASH_KEY = 'dtf_last_order';

// Survives a Stripe redirect-out-and-back (hitting the browser back button
// from Checkout) so the customer doesn't have to re-upload a 100 MB file.
// Cleared right before we hand off to Stripe, and ignored (not just left
// stale) once it's more than 2h old.
const UPLOAD_STASH_KEY = 'dtf_upload_stash';
const UPLOAD_STASH_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Loose "did you fat-finger it" check, not full RFC 5322 — mirrors the
// server's EMAIL_RE in server/routes/gangsheetStore.js's /checkout.
const EMAIL_RE = /.+@.+\..+/;

// Umami custom event, if the tracker loaded (adblock / script failure = no-op).
// Copied from InstantQuotePage.tsx rather than imported — page components in
// this app don't import helpers from each other.
function trackEvent(event: string, data?: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { track: (e: string, d?: Record<string, unknown>) => void };
  };
  try { w.umami?.track(event, data); } catch { /* analytics must never break the page */ }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Probes a raster file's pixel dimensions client-side (no upload needed).
// Returns null if the browser can't decode it as an image — callers should
// treat that as "let the server be the judge" rather than a hard failure.
function probeImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Page                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export default function DtfStorePage() {
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading, isError: configError } = useQuery<DtfConfig>({
    queryKey: ['dtf-config'],
    queryFn: async () => {
      const r = await fetch('/api/gangsheet-store/config');
      if (!r.ok) throw new Error('Failed to load pricing');
      return r.json();
    },
    staleTime: 60 * 1000,
  });

  // Length + tier default once config resolves — null sentinels gate the
  // form render until we know real min/max/availability instead of
  // guessing fallback numbers that might not match the shop's settings.
  const [lengthFt, setLengthFt] = useState<number | null>(null);
  const [tier, setTier] = useState<TierKey | null>(null);
  useEffect(() => {
    if (!config) return;
    setLengthFt((prev) => (prev === null ? clamp(5, config.min_ft, config.max_ft) : prev));
    setTier((prev) => {
      if (prev !== null) return prev;
      return TIER_ORDER.find((t) => config.tiers[t].available) ?? 'standard';
    });
  }, [config]);

  const [delivery, setDelivery] = useState<'pickup' | 'ship'>('pickup');
  const [shipAddr, setShipAddr] = useState<ShipAddress>({ line1: '', city: '', state: '', zip: '' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bumpSuggestion, setBumpSuggestion] = useState<{ ft: number; extraCents: number } | null>(null);

  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Restore a still-fresh upload stash on mount — covers the back-button
  // path from Stripe Checkout, where the browser re-renders this page from
  // scratch with no client-side state, but the file is still sitting in
  // Spaces under the same file_key.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(UPLOAD_STASH_KEY);
      if (!raw) return;
      const stash = JSON.parse(raw) as {
        file_key?: unknown; width_px?: unknown; height_px?: unknown; fileName?: unknown; at?: unknown;
      };
      if (
        typeof stash.file_key !== 'string' || typeof stash.width_px !== 'number'
        || typeof stash.height_px !== 'number' || typeof stash.at !== 'number'
      ) return;
      if (Date.now() - stash.at >= UPLOAD_STASH_MAX_AGE_MS) {
        sessionStorage.removeItem(UPLOAD_STASH_KEY);
        return;
      }
      setUploadedFile({
        file_key: stash.file_key,
        width_px: stash.width_px,
        height_px: stash.height_px,
        fileName: typeof stash.fileName === 'string' ? stash.fileName : undefined,
      });
    } catch { /* sessionStorage unavailable (private mode etc.) — non-fatal */ }
  }, []);

  // Umami dtf-length-set, debounced 800ms after the value settles. The ref
  // tracks the previous *non-null* length so the initial null -> config
  // default population (not a user action) never fires an event — only
  // subsequent, user-driven changes do.
  const prevLengthRef = useRef<number | null>(null);
  useEffect(() => {
    if (lengthFt === null) return;
    if (prevLengthRef.current === null) {
      prevLengthRef.current = lengthFt;
      return;
    }
    if (prevLengthRef.current === lengthFt) return;
    const ft = lengthFt;
    const t = setTimeout(() => trackEvent('dtf-length-set', { ft }), 800);
    prevLengthRef.current = lengthFt;
    return () => clearTimeout(t);
  }, [lengthFt]);

  async function handleFileSelected(file: File) {
    setUploadError(null);
    setBumpSuggestion(null);
    setUploadedFile(null);

    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setUploadError('File must be a PNG');
      return;
    }

    const dims = await probeImageDimensions(file);
    if (dims && Math.abs(dims.width - 6600) > 132) {
      setUploadError(`Sheet must be 6,600 px wide (22" at 300 DPI); got ${dims.width} px`);
      return;
    }

    setUploading(true);
    trackEvent('dtf-upload');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/gangsheet-store/upload', { method: 'POST', body: form });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Upload failed');
      const uploaded: UploadedFile = {
        file_key: body.file_key, width_px: body.width_px, height_px: body.height_px, fileName: file.name,
      };
      setUploadedFile(uploaded);
      try {
        sessionStorage.setItem(UPLOAD_STASH_KEY, JSON.stringify({ ...uploaded, at: Date.now() }));
      } catch { /* sessionStorage unavailable (private mode etc.) — non-fatal */ }

      const currentFt = lengthFt ?? 0;
      if (config && uploaded.height_px > currentFt * 3600) {
        const neededFt = Math.ceil(uploaded.height_px / 3600);
        if (neededFt > config.max_ft) {
          // Bumping to config.max_ft still wouldn't fit the file — a bump
          // button here would be an un-actionable dead end, so tell the
          // customer to split the sheet instead (server enforces the same
          // ceiling in /upload, this is the client-side mirror of it).
          setUploadError(`Your file is ${neededFt} ft long — our max sheet is ${config.max_ft} ft. Split it into two sheets.`);
        } else {
          const clampedFt = clamp(neededFt, config.min_ft, config.max_ft);
          const rate = config.rates[tier ?? 'standard'];
          setBumpSuggestion({ ft: clampedFt, extraCents: Math.max(0, (clampedFt - currentFt) * rate) });
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }

  function applyBump() {
    if (!bumpSuggestion) return;
    setLengthFt(bumpSuggestion.ft);
    setBumpSuggestion(null);
  }

  async function handleCheckout() {
    if (!config || lengthFt === null || tier === null || !uploadedFile) return;
    setCheckingOut(true);
    setCheckoutError(null);
    trackEvent('dtf-checkout-start', { ft: lengthFt, tier });

    // Stash the promise text for the (deliberately dumb, no-fetch)
    // success page to display after the Stripe round-trip.
    try {
      sessionStorage.setItem(SUCCESS_STASH_KEY, JSON.stringify({ tier, promise: config.promises[tier] }));
    } catch { /* sessionStorage unavailable (private mode etc.) — non-fatal */ }

    const body: CheckoutBody = {
      length_ft: lengthFt,
      tier,
      delivery,
      file_key: uploadedFile.file_key,
      name,
      email,
      attested: agree,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(delivery === 'ship' ? { ship_address: shipAddr } : {}),
    };

    try {
      const r = await fetch('/api/gangsheet-store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const respBody = await r.json();
      if (!r.ok) throw new Error(respBody.error || 'Checkout failed');
      try { sessionStorage.removeItem(UPLOAD_STASH_KEY); } catch { /* non-fatal */ }
      window.location.href = respBody.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed');
      setCheckingOut(false);
      // A cutoff/availability race is the likely cause of a checkout 400 —
      // refresh tier availability so the pills reflect reality immediately.
      queryClient.invalidateQueries({ queryKey: ['dtf-config'] });
    }
  }

  const rateCents = config && tier ? config.rates[tier] : 0;
  const lineTotalCents = (lengthFt ?? 0) * rateCents;
  const shippingCents = delivery === 'ship' ? (config?.shipping_flat_cents ?? 0) : 0;
  const totalCents = lineTotalCents + shippingCents;

  const shipFieldsFilled = shipAddr.line1.trim() && shipAddr.city.trim() && shipAddr.state.trim() && shipAddr.zip.trim();
  const emailValid = EMAIL_RE.test(email.trim());
  const canCheckout = !!uploadedFile
    && agree
    && emailValid
    && !checkingOut
    && !uploading
    && (delivery !== 'ship' || !!shipFieldsFilled);

  const heroRate = config ? money(config.rates.standard) : null;

  return (
    <Layout>
      <Seo
        title="DTF Transfers by the Foot · Order Gang Sheets Online · TShirt Brothers"
        description="Upload your print-ready art and order a 22-inch DTF gang sheet by the foot. Standard, Rush, and Hot Rush turnaround — priced and printed in Fairburn, GA."
        path="/dtf"
      />

      {/* Hero — dark band, same shape as SalePage's. */}
      <section className="bg-gray-900 text-white">
        <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-10 text-center">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-orange-400">DTF Gang Sheets</p>
          <h1 className="mt-1 font-display text-2xl sm:text-4xl font-bold">
            DTF Transfers by the Foot — 22&quot; gang sheets
            {heroRate && <>, <span className="text-orange-500">{heroRate}/ft</span></>}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-gray-300">
            Upload transparent PNG art at print size — what you upload is exactly what prints.
          </p>
        </div>
      </section>

      <main className="container mx-auto max-w-4xl px-4 py-6 pb-28 lg:pb-10">
        {configLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {configError && (
          <p className="py-16 text-center text-sm text-gray-500">
            Couldn&apos;t load pricing right now — refresh the page, or{' '}
            <Link to="/quote" className="text-orange-700 underline">get a quote instead</Link>.
          </p>
        )}

        {config && lengthFt !== null && tier !== null && (
          <div className="space-y-6">
            {/* ── Length stepper ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">How long is your sheet?</h2>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLengthFt((v) => clamp((v ?? 0) - 1, config.min_ft, config.max_ft))}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-300 text-gray-700 hover:border-orange-400 hover:text-orange-700 disabled:opacity-40"
                  disabled={lengthFt <= config.min_ft}
                  aria-label="Decrease length"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={config.min_ft}
                  max={config.max_ft}
                  value={lengthFt}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n)) setLengthFt(clamp(n, config.min_ft, config.max_ft));
                  }}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-2.5 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ fontSize: '16px' }}
                  aria-label="Length in feet"
                />
                <button
                  type="button"
                  onClick={() => setLengthFt((v) => clamp((v ?? 0) + 1, config.min_ft, config.max_ft))}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-300 text-gray-700 hover:border-orange-400 hover:text-orange-700 disabled:opacity-40"
                  disabled={lengthFt >= config.max_ft}
                  aria-label="Increase length"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <p className="ml-2 text-sm text-gray-600">
                  22&quot; × <strong className="text-gray-900">{lengthFt} ft</strong>
                </p>
              </div>
              <p className="mt-2 text-xs text-gray-500">{config.min_ft}–{config.max_ft} ft per sheet.</p>
            </section>

            {/* ── Tier pills ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">Turnaround</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TIER_ORDER.map((t) => {
                  const info = config.tiers[t];
                  const selected = tier === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!info.available}
                      onClick={() => { setTier(t); trackEvent('dtf-tier-pick', { tier: t }); }}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        !info.available
                          ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
                          : selected
                            ? 'border-orange-600 bg-orange-50 shadow-sm'
                            : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/40'
                      }`}
                    >
                      <span className="block font-display text-sm font-bold text-gray-900">{TIER_LABEL[t]}</span>
                      <span className="block text-xs text-gray-600">{money(config.rates[t])}/ft</span>
                      <span className="mt-1 block text-[11px] text-gray-500">{config.promises[t]}</span>
                      {!info.available && info.reason && (
                        <span className="mt-1 block text-[11px] font-semibold text-red-600">{info.reason}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Delivery pills ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">Delivery</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDelivery('pickup')}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    delivery === 'pickup' ? 'border-orange-600 bg-orange-50' : 'border-gray-300 hover:border-orange-400'
                  }`}
                >
                  <span className="block font-display text-sm font-bold text-gray-900">Pickup</span>
                  <span className="block text-xs text-gray-500">Free · Fairburn, GA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDelivery('ship')}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    delivery === 'ship' ? 'border-orange-600 bg-orange-50' : 'border-gray-300 hover:border-orange-400'
                  }`}
                >
                  <span className="block font-display text-sm font-bold text-gray-900">Ship</span>
                  <span className="block text-xs text-gray-500">+{money(config.shipping_flat_cents)} flat</span>
                </button>
              </div>
              {delivery === 'ship' && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Address line"
                    value={shipAddr.line1}
                    onChange={(e) => setShipAddr((s) => ({ ...s, line1: e.target.value }))}
                    className="sm:col-span-2 rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{ fontSize: '16px' }}
                  />
                  <input
                    type="text"
                    placeholder="City"
                    value={shipAddr.city}
                    onChange={(e) => setShipAddr((s) => ({ ...s, city: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{ fontSize: '16px' }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="State"
                      value={shipAddr.state}
                      onChange={(e) => setShipAddr((s) => ({ ...s, state: e.target.value }))}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                      style={{ fontSize: '16px' }}
                    />
                    <input
                      type="text"
                      placeholder="ZIP"
                      value={shipAddr.zip}
                      onChange={(e) => setShipAddr((s) => ({ ...s, zip: e.target.value }))}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Upload dropzone ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">Upload your art</h2>
              <ul className="mt-1 text-xs text-gray-500">
                <li>PNG · transparent background · 300 DPI · 22&quot; / 6,600 px wide · max 100 MB</li>
              </ul>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 transition hover:border-orange-400 hover:bg-orange-50/30"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                    <span>Uploading…</span>
                  </>
                ) : uploadedFile ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="font-semibold text-gray-700">
                      File uploaded — {uploadedFile.width_px} × {uploadedFile.height_px} px
                    </span>
                    {uploadedFile.fileName && (
                      <span className="text-xs text-gray-500">{uploadedFile.fileName}</span>
                    )}
                    <span className="text-xs text-gray-400">Click to replace</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span>Click or drop a PNG here</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleFileSelected(file);
                  }}
                />
              </label>
              {uploadError && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {uploadError}
                </p>
              )}
              {bumpSuggestion && (
                <button
                  type="button"
                  onClick={applyBump}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-orange-400 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-800 hover:bg-orange-100"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Bump to {bumpSuggestion.ft} ft (+{money(bumpSuggestion.extraCents)})
                </button>
              )}
            </section>

            {/* ── Transparent-background checklist ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">
                  My file is a transparent-background PNG at print size. What I upload is exactly what prints.
                </span>
              </label>
            </section>

            {/* ── Tier-promise table ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">Turnaround options</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-1 pr-4 font-semibold">Tier</th>
                      <th className="pb-1 pr-4 font-semibold">Rate</th>
                      <th className="pb-1 font-semibold">Promise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TIER_ORDER.map((t) => (
                      <tr key={t} className="border-t border-gray-100">
                        <td className="py-1.5 pr-4 font-semibold text-gray-900">{TIER_LABEL[t]}</td>
                        <td className="py-1.5 pr-4 text-gray-600">{money(config.rates[t])}/ft</td>
                        <td className="py-1.5 text-gray-600">{config.promises[t]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Contact info ── */}
            <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="font-display text-base sm:text-lg font-bold text-gray-900">Your info</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ fontSize: '16px' }}
                />
                <div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{ fontSize: '16px' }}
                  />
                  {email.trim() !== '' && !emailValid && (
                    <p className="mt-1 text-xs text-red-600">Enter a valid email address</p>
                  )}
                </div>
                <textarea
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="sm:col-span-2 rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </section>

            {/* ── Cross-link to pressing quote ── */}
            <p className="text-center text-xs text-gray-500">
              Want us to press these for you? $3/shirt — <Link to="/quote" className="text-orange-700 underline">start a quote</Link>.
            </p>
          </div>
        )}
      </main>

      {/* ── Price summary — sticks to the bottom of the viewport on mobile,
          sits inline in normal flow on lg+. ── */}
      {config && lengthFt !== null && tier !== null && (
        <div className="sticky bottom-0 z-30 border-t-2 border-orange-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:static lg:border-t-0 lg:bg-transparent lg:shadow-none lg:px-0 lg:py-0">
          <div className="container mx-auto max-w-4xl lg:px-4 lg:pb-10">
            <div className="rounded-2xl border-2 border-orange-500 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-gray-700">
                <span>{lengthFt} ft × {money(rateCents)} = <strong className="text-gray-900">{money(lineTotalCents)}</strong></span>
                {shippingCents > 0 && <span>Shipping: {money(shippingCents)}</span>}
                <span className="font-display text-lg font-bold text-gray-900">Total: {money(totalCents)}</span>
              </div>
              {checkoutError && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {checkoutError}
                </p>
              )}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={!canCheckout}
                className="mt-3 w-full rounded-xl bg-orange-600 px-6 py-3.5 text-base font-bold text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {checkingOut ? 'Redirecting to checkout…' : 'Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
