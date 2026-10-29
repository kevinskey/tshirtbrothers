import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Loader2, Calculator } from 'lucide-react';

type Estimate = {
  estimated_stitches: number; low_stitches: number; high_stitches: number;
  color_count_estimate: number; coverage_pct: number; width_in: number; height_in: number;
  breakdown: { fill: number; satin: number; running: number; underlay: number };
};
const count = (value: number) => value.toLocaleString();

export default function StitchEstimator() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [width, setWidth] = useState('3.5');
  const [height, setHeight] = useState('');
  const [spacing, setSpacing] = useState('0.42');
  const [result, setResult] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const reset = () => { setResult(null); setError(''); setCopied(false); };
  async function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); reset();
    if (!file) { setError('Choose a PNG first.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Choose a PNG smaller than 8 MB.'); return; }
    const form = new FormData();
    form.append('file', file); form.append('width_in', width); form.append('spacing_mm', spacing);
    if (height) form.append('height_in', height);
    setBusy(true);
    try {
      const response = await fetch('/api/admin/stitch-estimator', {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
        body: form, signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again to estimate.' : data.error || 'Unable to estimate this PNG.');
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to estimate. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-orange-100 bg-orange-50 p-5 sm:p-7">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-700"><Calculator size={18} /> TSB PRODUCTION TOOLS</div>
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">PNG stitch estimator</h1>
      <p className="mt-2 max-w-xl text-sm text-gray-600">Upload your artwork, set its finished size, and get an estimated embroidery stitch range.</p>
    </div>
    <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-2">
      <form onSubmit={estimate} className="space-y-5">
        <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
          <label className="block rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-5">
            <span className="flex items-center gap-2 font-semibold text-gray-900"><Upload size={20} /> Choose PNG artwork</span>
            <span className="mt-1 block text-xs text-gray-600">Up to 8 MB / 12 megapixels. Transparent backgrounds work best.</span>
            <input type="file" accept="image/png,.png" required className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-100 file:px-3 file:py-2 file:font-semibold file:text-orange-800" onChange={e => { setFile(e.target.files?.[0] || null); reset(); }} />
          </label>
          {preview && <div className="flex h-48 items-center justify-center rounded-xl border bg-gray-100 p-4"><img src={preview} alt="Selected embroidery artwork" className="max-h-full max-w-full object-contain" /></div>}
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-semibold">Width (inches)<input type="number" required min="0.25" max="20" step="0.01" value={width} onChange={e => { setWidth(e.target.value); reset(); }} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base" /></label>
            <label className="text-sm font-semibold">Height (optional)<input type="number" min="0.25" max="20" step="0.01" placeholder="Auto" value={height} onChange={e => { setHeight(e.target.value); reset(); }} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base" /></label>
          </div>
          <p className="text-xs text-gray-500">Leave height blank to keep proportions. Dimensions apply to the entire PNG canvas; trim extra transparent space first.</p>
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-gray-600">Advanced settings</summary><label className="mt-3 block">Stitch spacing (mm)<input type="number" required min="0.25" max="1.2" step="0.01" value={spacing} onChange={e => { setSpacing(e.target.value); reset(); }} className="ml-3 w-24 rounded-lg border p-2" /></label></details>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600">{busy ? <Loader2 className="animate-spin" size={20} /> : <Calculator size={20} />}{busy ? 'Estimating stitches…' : 'Estimate stitches'}</button>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </form>
      <div aria-live="polite" aria-busy={busy}>
        {result ? <div className="rounded-xl bg-slate-900 p-6 text-white">
          <p className="text-sm text-orange-300">Estimated stitch count</p>
          <p className="mt-2 text-5xl font-bold tracking-tight">{count(result.estimated_stitches)}</p>
          <p className="mt-3 text-sm text-slate-300">Likely range: <strong className="text-white">{count(result.low_stitches)}–{count(result.high_stitches)}</strong></p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-700 pt-5 text-sm">
            <div><dt className="text-slate-400">Finished size</dt><dd className="mt-1">{result.width_in}″ × {result.height_in}″</dd></div>
            <div><dt className="text-slate-400">Artwork coverage</dt><dd className="mt-1">{result.coverage_pct}%</dd></div>
            <div><dt className="text-slate-400">Approx. color groups</dt><dd className="mt-1">{result.color_count_estimate}</dd></div>
          </dl>
          <details className="mt-5 text-sm"><summary className="cursor-pointer text-slate-300">Stitch breakdown</summary><dl className="mt-3 space-y-2">{Object.entries(result.breakdown).map(([key, value]) => <div key={key} className="flex justify-between capitalize"><dt>{key}</dt><dd>{count(value)}</dd></div>)}</dl></details>
          <button type="button" className="mt-6 w-full rounded-lg border border-slate-500 py-2 text-sm hover:bg-slate-800" onClick={async () => { try { await navigator.clipboard.writeText(`${file?.name}: estimated ${count(result.estimated_stitches)} stitches (${count(result.low_stitches)}–${count(result.high_stitches)}), ${result.width_in} × ${result.height_in} inches. Preliminary PNG estimate; confirm with digitized file.`); setCopied(true); } catch { setError('Copy unavailable in this browser. Select the displayed results instead.'); } }}>{copied ? 'Copied for quote notes' : 'Copy estimate for quote notes'}</button>
        </div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-7 text-center"><Calculator size={36} className="mb-4 text-orange-400" /><h2 className="font-semibold text-gray-900">Your estimate appears here</h2><p className="mt-2 text-sm text-gray-500">Choose a PNG and its finished embroidery size to begin.</p></div>}
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Preliminary estimate only. Digitizing choices, fabric and underlay affect the final stitch count. Confirm against the digitized file before final pricing. This tool does not create a DST file.</p>
        <Link to="/admin?section=embroidery" className="mt-5 inline-block text-sm font-semibold text-orange-700 hover:underline">Back to embroidery jobs &amp; quotes →</Link>
      </div>
    </div>
  </section>;
}
