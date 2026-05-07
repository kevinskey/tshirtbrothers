import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, RotateCcw } from 'lucide-react';

/* Server row shapes mirror server/routes/instantQuote.js admin response.
   NUMERIC fields come back as strings via node-postgres; we keep them as-is
   in state and let the inputs coerce, then string-convert when saving. */

interface Garment {
  id?: number;
  name: string;
  quality_tier: string;
  base_cost: number | string;
  image_url: string | null;
  active: boolean;
  sort_order: number;
}
interface PrintMethod {
  id?: number;
  name: string;
  setup_fee_per_color: number | string;
  base_per_piece_cost: number | string;
  charges_per_color: boolean;
  active: boolean;
  sort_order: number;
}
interface QuantityTier {
  id?: number;
  min_qty: number;
  max_qty: number | null;
  discount_pct: number | string;
  sort_order: number;
}
interface Settings {
  markup_multiplier: number | string;
  rush_surcharge_pct: number | string;
  rush_threshold_days: number;
  standard_turnaround: number;
  rush_turnaround: number;
}
interface Pricing {
  garments: Garment[];
  print_methods: PrintMethod[];
  quantity_tiers: QuantityTier[];
  settings: Settings;
}

const ENDPOINT = '/api/admin/instant-quote-pricing';
const getToken = () => localStorage.getItem('tsb_token') || '';
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

export default function InstantQuotePricingAdmin() {
  const [data, setData] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(ENDPOINT, { headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to load');
      setData(await r.json());
      setDirty(false);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const r = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
      const fresh = await r.json();
      setData({
        garments: fresh.garments,
        print_methods: fresh.print_methods,
        quantity_tiers: fresh.quantity_tiers,
        settings: fresh.settings,
      });
      setDirty(false);
      flash('ok', 'Pricing saved. Calculator picks up changes within ~1 minute.');
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof Pricing>(key: K, value: Pricing[K]) {
    if (!data) return;
    setData({ ...data, [key]: value });
    setDirty(true);
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;
  }
  if (!data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Failed to load pricing.</div>;
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Instant Quote Pricing</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Drives the live calculator at <code>/instant-quote</code>. Changes save atomically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button
            type="button"
            onClick={load}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" /> Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${
          toast.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>{toast.text}</div>
      )}

      {/* SETTINGS */}
      <Card title="Global Settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <NumberField
            label="Markup multiplier"
            value={data.settings.markup_multiplier}
            step="0.01"
            help="Total = subtotal × this. 2.0 = 100% markup."
            onChange={(v) => setField('settings', { ...data.settings, markup_multiplier: v })}
          />
          <NumberField
            label="Rush surcharge"
            value={data.settings.rush_surcharge_pct}
            step="0.01"
            help="As a fraction. 0.25 = +25%."
            onChange={(v) => setField('settings', { ...data.settings, rush_surcharge_pct: v })}
          />
          <NumberField
            label="Standard turnaround (days)"
            value={data.settings.standard_turnaround}
            step="1"
            onChange={(v) => setField('settings', { ...data.settings, standard_turnaround: Number(v) })}
          />
          <NumberField
            label="Rush turnaround (days)"
            value={data.settings.rush_turnaround}
            step="1"
            onChange={(v) => setField('settings', { ...data.settings, rush_turnaround: Number(v) })}
          />
          <NumberField
            label="Rush threshold (days)"
            value={data.settings.rush_threshold_days}
            step="1"
            help="If customer wants it faster than this, surcharge applies."
            onChange={(v) => setField('settings', { ...data.settings, rush_threshold_days: Number(v) })}
          />
        </div>
      </Card>

      {/* GARMENTS */}
      <Card
        title="Garments"
        action={
          <AddButton onClick={() =>
            setField('garments', [
              ...data.garments,
              { name: '', quality_tier: 'Standard', base_cost: 0, image_url: null, active: true, sort_order: 0 },
            ])
          } />
        }
      >
        <Grid cols="minmax(140px,1fr) 140px 120px 70px 70px 36px" headers={['Name', 'Quality tier', 'Base cost', 'Sort', 'Active', '']}>
          {data.garments.map((g, i) => (
            <RowGrid key={g.id ?? `new-g-${i}`} cols="minmax(140px,1fr) 140px 120px 70px 70px 36px">
              <InputText value={g.name} onChange={(v) => updateAt(data, setField, 'garments', i, { name: v })} />
              <Select value={g.quality_tier} options={['Standard', 'Premium', 'Ultra']} onChange={(v) => updateAt(data, setField, 'garments', i, { quality_tier: v })} />
              <InputNumber value={g.base_cost} step="0.01" onChange={(v) => updateAt(data, setField, 'garments', i, { base_cost: v })} />
              <InputNumber value={g.sort_order} step="1" onChange={(v) => updateAt(data, setField, 'garments', i, { sort_order: Number(v) })} />
              <Toggle value={g.active} onChange={(v) => updateAt(data, setField, 'garments', i, { active: v })} />
              <DeleteRow onClick={() => setField('garments', data.garments.filter((_, idx) => idx !== i))} />
            </RowGrid>
          ))}
        </Grid>
      </Card>

      {/* PRINT METHODS */}
      <Card
        title="Print methods"
        action={
          <AddButton onClick={() =>
            setField('print_methods', [
              ...data.print_methods,
              { name: '', setup_fee_per_color: 0, base_per_piece_cost: 0, charges_per_color: false, active: true, sort_order: 0 },
            ])
          } />
        }
      >
        <Grid cols="minmax(140px,1fr) 110px 110px 90px 70px 70px 36px" headers={['Name', 'Setup fee', 'Per piece', 'Per color?', 'Sort', 'Active', '']}>
          {data.print_methods.map((m, i) => (
            <RowGrid key={m.id ?? `new-m-${i}`} cols="minmax(140px,1fr) 110px 110px 90px 70px 70px 36px">
              <InputText value={m.name} onChange={(v) => updateAt(data, setField, 'print_methods', i, { name: v })} />
              <InputNumber value={m.setup_fee_per_color} step="0.01" onChange={(v) => updateAt(data, setField, 'print_methods', i, { setup_fee_per_color: v })} />
              <InputNumber value={m.base_per_piece_cost} step="0.01" onChange={(v) => updateAt(data, setField, 'print_methods', i, { base_per_piece_cost: v })} />
              <Toggle value={m.charges_per_color} onChange={(v) => updateAt(data, setField, 'print_methods', i, { charges_per_color: v })} />
              <InputNumber value={m.sort_order} step="1" onChange={(v) => updateAt(data, setField, 'print_methods', i, { sort_order: Number(v) })} />
              <Toggle value={m.active} onChange={(v) => updateAt(data, setField, 'print_methods', i, { active: v })} />
              <DeleteRow onClick={() => setField('print_methods', data.print_methods.filter((_, idx) => idx !== i))} />
            </RowGrid>
          ))}
        </Grid>
        <p className="mt-2 text-xs text-gray-500">
          When <strong>Per color?</strong> is on (Screen Print), setup fee is multiplied by colors × locations. Otherwise it's a per-design fee × locations (Embroidery).
        </p>
      </Card>

      {/* QUANTITY TIERS */}
      <Card
        title="Quantity tiers"
        action={
          <AddButton onClick={() =>
            setField('quantity_tiers', [
              ...data.quantity_tiers,
              { min_qty: 0, max_qty: 0, discount_pct: 0, sort_order: 0 },
            ])
          } />
        }
      >
        <Grid cols="110px 170px 120px 70px 36px" headers={['Min qty', 'Max qty (blank = open)', 'Discount %', 'Sort', '']}>
          {data.quantity_tiers.map((q, i) => (
            <RowGrid key={q.id ?? `new-q-${i}`} cols="110px 170px 120px 70px 36px">
              <InputNumber value={q.min_qty} step="1" onChange={(v) => updateAt(data, setField, 'quantity_tiers', i, { min_qty: Number(v) })} />
              <input
                type="number"
                value={q.max_qty == null ? '' : q.max_qty}
                step="1"
                onChange={(e) => updateAt(data, setField, 'quantity_tiers', i, { max_qty: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="(open-ended)"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <div className="flex items-center gap-1">
                <InputNumber
                  value={Number(q.discount_pct) * 100}
                  step="0.5"
                  onChange={(v) => updateAt(data, setField, 'quantity_tiers', i, { discount_pct: Number(v) / 100 })}
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
              <InputNumber value={q.sort_order} step="1" onChange={(v) => updateAt(data, setField, 'quantity_tiers', i, { sort_order: Number(v) })} />
              <DeleteRow onClick={() => setField('quantity_tiers', data.quantity_tiers.filter((_, idx) => idx !== i))} />
            </RowGrid>
          ))}
        </Grid>
      </Card>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function updateAt<K extends 'garments' | 'print_methods' | 'quantity_tiers'>(
  data: Pricing,
  setField: <KK extends keyof Pricing>(key: KK, value: Pricing[KK]) => void,
  key: K,
  i: number,
  patch: Partial<Pricing[K][number]>,
) {
  const next = [...data[key]] as Pricing[K];
  next[i] = { ...next[i]!, ...patch } as Pricing[K][number];
  setField(key, next);
}

/* ── primitive components ────────────────────────────────────────────── */

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Grid({ cols, headers, children }: { cols: string; headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        <div
          className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1"
          style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px' }}
        >
          {headers.map((h, i) => <div key={i}>{h}</div>)}
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}

function RowGrid({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-md border border-gray-100 bg-gray-50/40 px-2 py-1.5"
      style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', alignItems: 'center' }}
    >
      {children}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Plus className="h-3.5 w-3.5" /> Add row
    </button>
  );
}

function InputText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
    />
  );
}
function InputNumber({ value, step, onChange }: { value: number | string; step: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      value={value === '' || value == null ? '' : (value as number | string)}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400"
    />
  );
}
function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex h-6 w-10 items-center rounded-full transition ${value ? 'bg-green-500' : 'bg-gray-300'}`}
      aria-pressed={value}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}
function DeleteRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
      aria-label="Delete row"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function NumberField({
  label, value, step, help, onChange,
}: { label: string; value: number | string; step: string; help?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</span>
      <input
        type="number"
        value={value as number | string}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      {help && <span className="mt-1 block text-[11px] text-gray-500">{help}</span>}
    </label>
  );
}
