import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import {
  Shirt,
  Layers,
  Palette,
  Printer,
  ChevronDown,
  Loader2,
  Check,
  Zap,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────── */
/*  Types — mirror server/routes/instantQuote.js                          */
/* ────────────────────────────────────────────────────────────────────── */

type Garment = { id: number; name: string; quality_tier: string; base_cost: number; image_url: string | null };
type PrintMethod = { id: number; name: string; charges_per_color: boolean };
type QuantityTier = { id: number; min_qty: number; max_qty: number | null; discount_pct: number };
type Settings = { markup_multiplier: number; rush_surcharge_pct: number; standard_turnaround: number; rush_turnaround: number };
type OptionsResponse = { garments: Garment[]; print_methods: PrintMethod[]; quantity_tiers: QuantityTier[]; settings: Settings };

type CalcResponse = {
  per_shirt: number;
  total: number;
  turnaround_days: number;
  breakdown: {
    garment_cost_per_piece: number;
    print_cost_per_piece: number;
    num_locations: number;
    colors_per_location: number;
    base: number;
    setup: number;
    quantity_discount: number;
    discount_pct: number;
    rush_surcharge: number;
    markup_multiplier: number;
    subtotal: number;
  };
};

type Inputs = {
  quantity: number;
  garmentName: string;
  qualityTier: 'Standard' | 'Premium' | 'Ultra';
  methodName: 'Screen Print' | 'DTF' | 'DTG' | 'Embroidery';
  locations: { front: boolean; back: boolean; sleeve: boolean };
  colorsPerLocation: number;
  rush: boolean;
};

const DEFAULT_INPUTS: Inputs = {
  quantity: 25,
  garmentName: 'T-shirt',
  qualityTier: 'Standard',
  methodName: 'Screen Print',
  locations: { front: true, back: false, sleeve: false },
  colorsPerLocation: 1,
  rush: false,
};

/* ────────────────────────────────────────────────────────────────────── */
/*  Page                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export default function InstantQuotePage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);

  // 200ms debounce — calculator hits the API on every change otherwise.
  const [debouncedInputs, setDebouncedInputs] = useState(inputs);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInputs(inputs), 200);
    return () => clearTimeout(t);
  }, [inputs]);

  // Pricing options — fetched once, cached forever (admin edits invalidate
  // server-side cache; user reload picks up changes).
  const { data: options } = useQuery<OptionsResponse>({
    queryKey: ['instant-quote', 'options'],
    queryFn: async () => {
      const r = await fetch('/api/quote/options');
      if (!r.ok) throw new Error('Failed to load pricing options');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const numLocations = useMemo(
    () => Object.values(inputs.locations).filter(Boolean).length,
    [inputs.locations]
  );

  // Calculate query — runs against debouncedInputs so it doesn't fire on every keystroke.
  const calcEnabled = numLocations > 0 && debouncedInputs.quantity > 0;
  const { data: calc, isFetching: calcLoading } = useQuery<CalcResponse>({
    queryKey: ['instant-quote', 'calculate', debouncedInputs, numLocations],
    queryFn: async () => {
      const r = await fetch('/api/quote/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: debouncedInputs.quantity,
          garmentName: debouncedInputs.garmentName,
          qualityTier: debouncedInputs.qualityTier,
          methodName: debouncedInputs.methodName,
          numLocations: Object.values(debouncedInputs.locations).filter(Boolean).length,
          colorsPerLocation: debouncedInputs.colorsPerLocation,
          rush: debouncedInputs.rush,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Calculation failed');
      return body;
    },
    enabled: calcEnabled,
    placeholderData: (prev) => prev, // keep showing last result while recalculating
  });

  const update = (patch: Partial<Inputs>) => setInputs((prev) => ({ ...prev, ...patch }));

  // Garment names (deduped from options, preserving first-seen order)
  const garmentNames = useMemo(() => {
    if (!options) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of options.garments) {
      if (!seen.has(g.name)) { seen.add(g.name); out.push(g.name); }
    }
    return out;
  }, [options]);

  const isScreenPrint = inputs.methodName === 'Screen Print';
  const currentTier = useMemo(() => {
    if (!options) return null;
    return options.quantity_tiers.find(
      (t) => inputs.quantity >= t.min_qty && (t.max_qty === null || inputs.quantity <= t.max_qty)
    ) || null;
  }, [options, inputs.quantity]);

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gray-900 text-white py-12 sm:py-16 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold">Instant Quote</h1>
          <p className="mt-3 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
            Pick your garment, method, and quantity — see the price update in real time.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* ─── Sticky price card (above the fold on mobile) ─── */}
        <PriceCard
          calc={calc}
          quantity={debouncedInputs.quantity}
          loading={calcLoading}
          hasInputs={calcEnabled}
          numLocations={numLocations}
          tier={currentTier}
        />

        {/* ─── Form ─── */}
        <div className="mt-6 space-y-8">

          {/* Quantity */}
          <Section icon={<span className="text-xl">#</span>} title="How many shirts?">
            {options && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {options.quantity_tiers.map((t) => {
                  const label = t.max_qty === null ? `${t.min_qty}+` : `${t.min_qty}–${t.max_qty}`;
                  const active = currentTier?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => update({ quantity: t.min_qty })}
                      className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                        active ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                      }`}
                    >
                      {label}
                      {t.discount_pct > 0 && (
                        <div className="text-[10px] mt-0.5 text-gray-500">{Math.round(t.discount_pct * 100)}% off</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Exact quantity</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={inputs.quantity || ''}
                onChange={(e) => update({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </Section>

          {/* Garment */}
          <Section icon={<Shirt className="h-5 w-5" />} title="What kind of garment?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {garmentNames.map((name) => (
                <Chip key={name} active={inputs.garmentName === name} onClick={() => update({ garmentName: name })}>
                  {name}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Quality tier */}
          <Section icon={<Layers className="h-5 w-5" />} title="Quality tier">
            <div className="grid grid-cols-3 gap-2">
              {(['Standard', 'Premium', 'Ultra'] as const).map((q) => {
                const garment = options?.garments.find((g) => g.name === inputs.garmentName && g.quality_tier === q);
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => update({ qualityTier: q })}
                    className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                      inputs.qualityTier === q ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                    }`}
                  >
                    <div>{q}</div>
                    {garment && <div className="text-[10px] mt-0.5 text-gray-500">${garment.base_cost.toFixed(2)} cost</div>}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Print method */}
          <Section icon={<Printer className="h-5 w-5" />} title="Print method">
            <div className="grid grid-cols-2 gap-2">
              {options?.print_methods.map((m) => (
                <Chip
                  key={m.id}
                  active={inputs.methodName === m.name}
                  onClick={() => update({ methodName: m.name as Inputs['methodName'] })}
                >
                  {m.name}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Print locations */}
          <Section icon={<Palette className="h-5 w-5" />} title="Where do you want it printed?">
            <div className="grid grid-cols-3 gap-2">
              {(['front', 'back', 'sleeve'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => update({ locations: { ...inputs.locations, [loc]: !inputs.locations[loc] } })}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-medium capitalize transition ${
                    inputs.locations[loc] ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                  }`}
                >
                  {inputs.locations[loc] && <Check className="inline h-3.5 w-3.5 mr-1" />}
                  {loc}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Front + Back = 2 locations. Pick any combination.</p>
          </Section>

          {/* Colors — only for screen print */}
          {isScreenPrint && (
            <Section icon={<Palette className="h-5 w-5" />} title="How many colors per location?">
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update({ colorsPerLocation: n })}
                    className={`rounded-xl border-2 py-3 text-base font-bold transition ${
                      inputs.colorsPerLocation === n ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">More colors = higher screen-print setup fee.</p>
            </Section>
          )}

          {/* Turnaround */}
          <Section icon={<Zap className="h-5 w-5" />} title="When do you need it?">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update({ rush: false })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                  !inputs.rush ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                }`}
              >
                <div>Standard</div>
                <div className="text-[10px] mt-0.5 text-gray-500">{options?.settings.standard_turnaround ?? 10} days</div>
              </button>
              <button
                type="button"
                onClick={() => update({ rush: true })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                  inputs.rush ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                }`}
              >
                <div>Rush</div>
                <div className="text-[10px] mt-0.5 text-gray-500">
                  {options?.settings.rush_turnaround ?? 5} days · +{Math.round((options?.settings.rush_surcharge_pct ?? 0.25) * 100)}%
                </div>
              </button>
            </div>
          </Section>
        </div>

        {/* CTAs — Save + Lock-in are wired in later phases. */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => toast.message('Save Quote — coming in Phase 4')}
            disabled={!calc}
            className="w-full rounded-xl border-2 border-gray-300 px-6 py-4 text-base font-bold text-gray-700 hover:border-red-400 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Save Quote (email me)
          </button>
          <button
            type="button"
            onClick={() => toast.message('Lock In Order — coming in Phase 6 (50% deposit via Stripe)')}
            disabled={!calc}
            className="w-full rounded-xl bg-red-600 px-6 py-4 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            Lock In Order
          </button>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Estimate only. Final price confirmed after we review your artwork. Tax + shipping calculated at checkout.
        </p>
      </main>
    </Layout>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function PriceCard({
  calc, quantity, loading, hasInputs, numLocations, tier,
}: {
  calc?: CalcResponse;
  quantity: number;
  loading: boolean;
  hasInputs: boolean;
  numLocations: number;
  tier: QuantityTier | null;
}) {
  if (!hasInputs) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center text-gray-500">
        {numLocations === 0
          ? 'Pick at least one print location to see your quote.'
          : 'Fill in the form to see your quote.'}
      </div>
    );
  }
  if (!calc) {
    return (
      <div className="rounded-2xl border-2 border-gray-200 p-6 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Calculating...
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-700/70">Per shirt</div>
          <div className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
            ${calc.per_shirt.toFixed(2)}
            {loading && <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-red-400" />}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-red-700/70">Total</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
            ${calc.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-red-200">
          {calc.turnaround_days} day turnaround
        </span>
        {tier && tier.discount_pct > 0 && (
          <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-red-200">
            {Math.round(tier.discount_pct * 100)}% volume discount
          </span>
        )}
      </div>

      {/* Collapsible breakdown */}
      <details className="mt-4 group">
        <summary className="flex items-center gap-1 text-sm text-red-700 hover:text-red-800 cursor-pointer select-none list-none">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          Price breakdown
        </summary>
        <dl className="mt-3 space-y-1 text-sm">
          <Row
            label="Garment"
            sub={`$${calc.breakdown.garment_cost_per_piece.toFixed(2)} × ${quantity}`}
            value={calc.breakdown.garment_cost_per_piece * quantity}
          />
          <Row
            label="Print"
            sub={`$${calc.breakdown.print_cost_per_piece.toFixed(2)} × ${calc.breakdown.num_locations} location${calc.breakdown.num_locations === 1 ? '' : 's'} × ${quantity}`}
            value={calc.breakdown.print_cost_per_piece * calc.breakdown.num_locations * quantity}
          />
          {calc.breakdown.setup > 0 && <Row label="Setup" value={calc.breakdown.setup} />}
          {calc.breakdown.quantity_discount > 0 && (
            <Row label={`Volume discount (${Math.round(calc.breakdown.discount_pct * 100)}% off)`} value={-calc.breakdown.quantity_discount} negative />
          )}
          {calc.breakdown.rush_surcharge > 0 && <Row label="Rush surcharge (+25%)" value={calc.breakdown.rush_surcharge} />}
          <Row label={`Subtotal × ${calc.breakdown.markup_multiplier} markup`} value={calc.total} bold />
        </dl>
      </details>
    </div>
  );
}

function Row({ label, sub, value, negative, bold }: { label: string; sub?: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'pt-2 border-t border-red-200 font-bold text-gray-900' : ''}`}>
      <div>
        <span className={negative ? 'text-green-700' : ''}>{label}</span>
        {sub && <span className="ml-1 text-xs text-gray-500">{sub}</span>}
      </div>
      <span className={`tabular-nums ${negative ? 'text-green-700' : ''}`}>
        {negative ? '−' : ''}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600">{icon}</span>
        <h2 className="font-display font-bold text-base sm:text-lg text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
        active ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
      }`}
    >
      {children}
    </button>
  );
}
