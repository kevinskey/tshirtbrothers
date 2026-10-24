import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Gem, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';

/* Bling admin: the rhinestone rate card plus gallery curation for designs
   published out of StoneCut.

   NUMERIC columns come back from node-postgres as strings, same as the
   instant-quote admin — state holds them as-is and coerces on save. */

interface RateBreak { min_qty: number | string; rate: number | string }

interface Settings {
  stone_rate_breaks: RateBreak[];
  size_multipliers: Record<string, number | string>;
  press_labor_per_piece: number | string;
  digitizing_fee: number | string;
  digitizing_waived_at_qty: number | string;
  min_decoration_per_piece: number | string;
  coverage_threshold: number | string;
  coverage_upcharge_pct: number | string;
  garment_markup: number | string;
  rush_surcharge_pct: number | string;
  proof_fee: number | string;
}

interface Design {
  id: number;
  name: string;
  slug: string;
  preview_url: string | null;
  svg_url: string | null;
  stone_count: number;
  width_mm: string | number | null;
  height_mm: string | number | null;
  coverage: string | number | null;
  featured: boolean;
  created_at: string;
}

const getToken = () => localStorage.getItem('tsb_token') || '';
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });
const money = (n: number) => `$${n.toFixed(2)}`;
const mmToIn = (mm: string | number | null) =>
  mm == null ? null : `${(Number(mm) / 25.4).toFixed(1)}in`;

export default function RhinestoneAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        fetch('/api/rhinestone/admin/pricing', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/rhinestone/admin/designs', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
      ]);
      if (s) setSettings(s);
      if (Array.isArray(d)) setDesigns(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/rhinestone/admin/pricing', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          ...settings,
          stone_rate_breaks: settings.stone_rate_breaks.map((b) => ({
            min_qty: Number(b.min_qty),
            rate: Number(b.rate),
          })),
          size_multipliers: Object.fromEntries(
            Object.entries(settings.size_multipliers).map(([k, v]) => [k, Number(v)]),
          ),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSettings(await res.json());
      setMessage('Saved — /bling is now pricing off these numbers.');
    } catch (e) {
      setMessage(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeatured(d: Design) {
    const res = await fetch(`/api/rhinestone/admin/designs/${d.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ featured: !d.featured }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDesigns((prev) => prev.map((x) => (x.id === d.id ? updated : x)));
    }
  }

  // Live preview of what a representative job costs at the current numbers.
  // Mirrors services/rhinestonePricing.js — if the two ever drift, the
  // preview is the one that's wrong, so it stays deliberately simple.
  const preview = useMemo(() => {
    if (!settings) return [];
    const rate = (qty: number) => {
      let best = 0;
      for (const b of settings.stone_rate_breaks) {
        const mq = Number(b.min_qty);
        if (mq <= qty && mq >= 0) best = Math.max(best, mq);
      }
      const hit = settings.stone_rate_breaks.find((b) => Number(b.min_qty) === best);
      return hit ? Number(hit.rate) : 0;
    };
    const press = Number(settings.press_labor_per_piece);
    const floor = Number(settings.min_decoration_per_piece);
    const dig = Number(settings.digitizing_fee);
    const waive = Number(settings.digitizing_waived_at_qty);
    return [6, 12, 24, 48, 100].map((qty) => {
      const decoration = Math.max(floor, 500 * rate(qty) + press);
      const garment = 3.5 * Number(settings.garment_markup);
      const perPiece = decoration + garment;
      const oneTime = qty >= waive ? 0 : dig;
      return { qty, perPiece, effective: perPiece + oneTime / qty };
    });
  }, [settings]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading bling pricing…
      </div>
    );
  }
  if (!settings) {
    return (
      <p className="text-sm text-red-600">
        Could not load rhinestone pricing. Has <code>migrations/rhinestone_v1.sql</code> been run on
        the droplet?
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Gem className="h-5 w-5 text-fuchsia-500" /> Bling Pricing
          </h2>
          <p className="text-sm text-gray-500">
            Drives /bling and every rhinestone quote. Priced per stone, not per square inch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" /> Revert
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith('Save failed') ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </p>
      )}

      {/* Per-stone rate by pooled quantity */}
      <section>
        <h3 className="mb-2 font-semibold">Per-stone rate by quantity</h3>
        <p className="mb-3 text-xs text-gray-500">
          SS10 is the index size; the multipliers below scale the other sizes off it. Highest
          matching quantity wins. Bulk SS10 stones cost us about $0.0072 each.
        </p>
        <div className="space-y-2">
          {settings.stone_rate_breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="text-xs text-gray-500">
                qty ≥
                <input
                  type="number"
                  min={1}
                  value={b.min_qty}
                  onChange={(e) =>
                    set(
                      'stone_rate_breaks',
                      settings.stone_rate_breaks.map((row, k) =>
                        k === i ? { ...row, min_qty: e.target.value } : row,
                      ),
                    )
                  }
                  className="ml-1 w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-gray-500">
                $ / stone
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={b.rate}
                  onChange={(e) =>
                    set(
                      'stone_rate_breaks',
                      settings.stone_rate_breaks.map((row, k) =>
                        k === i ? { ...row, rate: e.target.value } : row,
                      ),
                    )
                  }
                  className="ml-1 w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                onClick={() =>
                  set('stone_rate_breaks', settings.stone_rate_breaks.filter((_, k) => k !== i))
                }
                disabled={settings.stone_rate_breaks.length <= 1}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                title="Remove break"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => set('stone_rate_breaks', [...settings.stone_rate_breaks, { min_qty: 1, rate: 0.02 }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" /> Add break
          </button>
        </div>
      </section>

      {/* Stone size multipliers */}
      <section>
        <h3 className="mb-2 font-semibold">Stone size multipliers</h3>
        <p className="mb-3 text-xs text-gray-500">
          Relative to SS10. An unlisted size falls back to 1.0 rather than being priced at zero.
        </p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(settings.size_multipliers).map(([size, mult]) => (
            <label key={size} className="text-xs text-gray-500">
              {size}
              <input
                type="number"
                step="0.05"
                min={0}
                value={mult}
                onChange={(e) =>
                  set('size_multipliers', { ...settings.size_multipliers, [size]: e.target.value })
                }
                className="ml-1 w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Flat knobs */}
      <section>
        <h3 className="mb-3 font-semibold">Fees &amp; adjustments</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Knob label="Press labor / piece" hint="Per placement. Matches the DTF press-only rate." value={settings.press_labor_per_piece} step="0.25" onChange={(v) => set('press_labor_per_piece', v)} />
          <Knob label="Digitizing fee" hint="One-time, per placement." value={settings.digitizing_fee} step="1" onChange={(v) => set('digitizing_fee', v)} />
          <Knob label="Digitizing waived at qty" hint="Pieces. 0 never waives." value={settings.digitizing_waived_at_qty} step="1" onChange={(v) => set('digitizing_waived_at_qty', v)} />
          <Knob label="Minimum decoration / piece" hint="Floor for small accents." value={settings.min_decoration_per_piece} step="0.5" onChange={(v) => set('min_decoration_per_piece', v)} />
          <Knob label="High-coverage threshold" hint="0–1 fraction of the design covered." value={settings.coverage_threshold} step="0.05" onChange={(v) => set('coverage_threshold', v)} />
          <Knob label="High-coverage upcharge" hint="Fraction, e.g. 0.15 = 15%." value={settings.coverage_upcharge_pct} step="0.05" onChange={(v) => set('coverage_upcharge_pct', v)} />
          <Knob label="Garment markup" hint="Multiplier on wholesale blank cost." value={settings.garment_markup} step="0.05" onChange={(v) => set('garment_markup', v)} />
          <Knob label="Rush surcharge" hint="Fraction of the whole order — NOT per day." value={settings.rush_surcharge_pct} step="0.05" onChange={(v) => set('rush_surcharge_pct', v)} />
          <Knob label="Physical proof fee" hint="Digital proofs are free by design." value={settings.proof_fee} step="1" onChange={(v) => set('proof_fee', v)} />
        </div>
      </section>

      {/* What it means in dollars */}
      <section>
        <h3 className="mb-2 font-semibold">At these numbers</h3>
        <p className="mb-3 text-xs text-gray-500">
          A 500-stone SS10 design on a $3.50 wholesale tee, one placement. Competitors sell finished
          bling tees at $25–$37 and transfers alone at $16–$33.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-[380px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-6">Qty</th>
                <th className="py-2 pr-6">Per piece</th>
                <th className="py-2">With fees spread</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.map((p) => (
                <tr key={p.qty}>
                  <td className="py-2 pr-6 font-medium">{p.qty}</td>
                  <td className="py-2 pr-6 tabular-nums">{money(p.perPiece)}</td>
                  <td className="py-2 tabular-nums font-semibold">{money(p.effective)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Gallery curation */}
      <section>
        <h3 className="mb-2 font-semibold">Published designs ({designs.length})</h3>
        <p className="mb-3 text-xs text-gray-500">
          Published from StoneCut. Each one is also in the art library under “Rhinestone / Bling”, so
          it can be dropped on a garment in the Design Studio and sent as a mockup. Only the featured
          ones show in the /bling gallery.
        </p>
        {designs.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing published yet. In StoneCut: <strong>File ▸ Publish to TShirt Brothers…</strong>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {designs.map((d) => (
              <div key={d.id} className="rounded-lg border border-gray-200 p-2">
                {d.preview_url && (
                  <img src={d.preview_url} alt={d.name} className="h-28 w-full bg-gray-100 object-contain" />
                )}
                <p className="mt-2 truncate text-xs font-semibold" title={d.name}>{d.name}</p>
                <p className="text-[11px] text-gray-500">
                  {d.stone_count.toLocaleString()} stones
                  {mmToIn(d.width_mm) && ` · ${mmToIn(d.width_mm)}×${mmToIn(d.height_mm)}`}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => void toggleFeatured(d)}
                    className={`flex-1 inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
                      d.featured
                        ? 'bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {d.featured ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {d.featured ? 'On /bling' : 'Hidden'}
                  </button>
                  {d.svg_url && (
                    <a
                      href={d.svg_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
                      title="Download the cut file"
                    >
                      SVG
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Knob({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | string;
  step: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
      {hint && <span className="mt-0.5 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}
