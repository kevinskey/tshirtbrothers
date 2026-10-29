import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

import EmbroideryAccuracy from './EmbroideryAccuracy';
import { Upload, Loader2, Calculator } from 'lucide-react';

type SavedEstimate = { id: number; name: string; quote_id: number | null; actual_stitches: number | null; data: Estimate };
type Estimate = {
  calibration?: { complexity: string }; estimate_key: string; filename?: string; settings?: { spacing_mm: number; trim: boolean; background: string; aspect_locked?: boolean };
  artwork?: { bounds: { width: number; height: number }; original: { width: number; height: number } };
  embroidery_preview: { data_url: string; width: number; height: number; disclaimer: string };
  estimated_stitches: number; low_stitches: number; high_stitches: number;
  color_count_estimate: number; coverage_pct: number; width_in: number; height_in: number;
  breakdown: { fill: number; satin: number; running: number; underlay: number };
};
const count = (value: number) => value.toLocaleString();

export default function StitchEstimator({ quoteId, initialArtworkUrl, onApply }: { quoteId?: number | null; initialArtworkUrl?: string | null; onApply?: (count: number) => void } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [background, setBackground] = useState('remove_white_edges');
  const [trim, setTrim] = useState(true);
  const [locked, setLocked] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<SavedEstimate | null>(null);
  const [recent, setRecent] = useState<Array<{ id: number; name: string; estimated_stitches: string; actual_stitches: number | null }>>([]);
  const [quote, setQuote] = useState(String(quoteId || new URLSearchParams(window.location.search).get('quote') || ''));
  const [actual, setActual] = useState('');
  const [accuracyRevision, setAccuracyRevision] = useState(0);
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` });
  const api = async (path: string, body?: unknown) => {
    const r = await fetch(`/api/admin/stitch-estimator/saved${path}`, { headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Unable to save or load estimate.');
    return data;
  };
  const [mockupBusy, setMockupBusy] = useState(false);
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
  const reset = () => { setDirty(true); setError(''); setCopied(false); };
  async function refreshRecent() {
    try { setRecent(await api(quoteId ? `?quote_id=${quoteId}` : '')); } catch { /* estimate still works if list is unavailable */ }
  }
  async function openSaved(id: number) {
    setMockupBusy(true); setError('');
    try {
      const record: SavedEstimate = await api(`/${id}`);
      const response = await fetch(`/api/admin/stitch-estimator/saved/${id}/source`, { headers: headers() });
      if (!response.ok) throw new Error('Unable to restore original artwork.');
      const source = new File([await response.blob()], record.name, { type: 'image/png' });
      setFile(source); setResult(record.data); setSaved(record); setActual(String(record.actual_stitches || ''));
      setWidth(String(record.data.width_in)); setHeight(record.data.settings?.aspect_locked === false ? String(record.data.height_in) : ''); setLocked(record.data.settings?.aspect_locked !== false);
      setSpacing(String(record.data.settings?.spacing_mm || 0.42)); setTrim(record.data.settings?.trim !== false);
      setBackground(record.data.settings?.background || 'remove_white_edges');
      setQuote(String(record.quote_id || '')); setDirty(false);
      if (location.pathname === '/stitch-estimator') navigate(`/stitch-estimator?estimate=${id}`, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to restore estimate.'); }
    finally { setMockupBusy(false); }
  }
  useEffect(() => {
    void refreshRecent();
    const id = new URLSearchParams(window.location.search).get('estimate');
    if (id && /^\d+$/.test(id) && location.pathname === '/stitch-estimator') void openSaved(Number(id));
    else if (initialArtworkUrl) {
      fetch(initialArtworkUrl).then(async r => {
        if (!r.ok) throw new Error('Unable to load quote artwork.');
        const blob = await r.blob();
        if (!blob.type.includes('png')) throw new Error('Choose a PNG version of this quote artwork.');
        setFile(new File([blob], 'quote-artwork.png', { type: 'image/png' }));
      }).catch(err => setError(err.message));
    }
    // Initial context is restored once; later edits stay under staff control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveEstimate(): Promise<SavedEstimate> {
    if (!result || dirty) throw new Error('Estimate the current artwork and settings first.');
    if (saved) return saved;
    const record: SavedEstimate = await api('', { estimate_key: result.estimate_key, name: file?.name, quote_id: quote || null });
    setSaved(record); setResult(record.data); setAccuracyRevision(v => v + 1); void refreshRecent();
    if (location.pathname === '/stitch-estimator') navigate(`/stitch-estimator?estimate=${record.id}`, { replace: true });
    return record;
  }
  async function saveOnly() {
    setMockupBusy(true); setError('');
    try { await saveEstimate(); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save.'); }
    finally { setMockupBusy(false); }
  }
  async function recordActual() {
    if (!saved) return;
    setMockupBusy(true); setError('');
    try { const record = await api(`/${saved.id}/actual`, { actual_stitches: Number(actual) }); setSaved(record); setAccuracyRevision(v => v + 1); void refreshRecent(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to record actual count.'); }
    finally { setMockupBusy(false); }
  }
  async function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setCopied(false);
    if (!file) { setError('Choose a PNG first.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Choose a PNG smaller than 8 MB.'); return; }
    const form = new FormData();
    form.append('file', file); form.append('width_in', width); form.append('spacing_mm', spacing);
    if (!locked && height) form.append('height_in', height);
    form.append('background', background); form.append('trim', String(trim));
    setBusy(true);
    try {
      const response = await fetch('/api/admin/stitch-estimator', {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
        body: form, signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again to estimate.' : data.error || 'Unable to estimate this PNG.');
      setResult(data); setDirty(false); setSaved(null); setActual('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to estimate. Please try again.'); }
    finally { setBusy(false); }
  }
  async function useInMockup() {
    setMockupBusy(true); setError('');
    try {
      const record = await saveEstimate();
      const mockup = await api(`/${record.id}/mockup`, {});
      navigate(`/design?editMockup=${mockup.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open mockup editor.'); }
    finally { setMockupBusy(false); }
  }
  async function downloadPreview() {
    if (!result) return;
    try {
      const response = await fetch(saved ? `/api/admin/stitch-estimator/saved/${saved.id}/preview` : result.embroidery_preview.data_url, saved ? { headers: headers() } : undefined);
      if (!response.ok) throw new Error('Download unavailable.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'embroidery-preview.png'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Unable to download the preview. Please try again.'); }
  }
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-orange-100 bg-orange-50 p-5 sm:p-7">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-700"><Calculator size={18} /> TSB PRODUCTION TOOLS</div>
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">PNG stitch estimator</h1>
      <p className="mt-2 max-w-xl text-sm text-gray-600">Upload your artwork, set its finished size, and get an estimated embroidery stitch range.</p>
    </div>
    {recent.length > 0 && <div className="border-b px-5 py-3"><label className="text-sm font-semibold">Saved estimates <select disabled={mockupBusy || busy} value={saved?.id || ''} onChange={e => { if (e.target.value) void openSaved(Number(e.target.value)); }} className="ml-2 max-w-full rounded border p-2"><option value="">Choose a saved design…</option>{recent.map(r => <option key={r.id} value={r.id}>#{r.id} {r.name} · {r.estimated_stitches} stitches{r.actual_stitches ? ` · actual ${r.actual_stitches}` : ''}</option>)}</select></label></div>}
    <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-2">
      <form onSubmit={estimate} className="space-y-5">
        <fieldset disabled={busy || mockupBusy} className="space-y-5 disabled:opacity-60">
          <label className="block rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-5">
            <span className="flex items-center gap-2 font-semibold text-gray-900"><Upload size={20} /> Choose PNG artwork</span>
            <span className="mt-1 block text-xs text-gray-600">Up to 8 MB / 12 megapixels. Transparent backgrounds work best.</span>{file && <span className="mt-2 block text-xs">Selected: {file.name}</span>}
            <input type="file" accept="image/png,.png" required={!file} className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-100 file:px-3 file:py-2 file:font-semibold file:text-orange-800" onChange={e => { setFile(e.target.files?.[0] || null); reset(); }} />
          </label>
          {preview && <div className="flex h-48 items-center justify-center rounded-xl border bg-gray-100 p-4"><img src={preview} alt="Selected embroidery artwork" className="max-h-full max-w-full object-contain" /></div>}
          <label className="block text-sm font-semibold">Background<select value={background} onChange={e => { setBackground(e.target.value); reset(); }} className="mt-2 w-full rounded-lg border p-3"><option value="remove_white_edges">Remove white background at edges</option><option value="preserve">Keep all colors, including white</option></select></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={trim} onChange={e => { setTrim(e.target.checked); reset(); }} /> Trim transparent margins automatically</label>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-semibold">Width (inches)<input type="number" required min="0.25" max="20" step="0.01" value={width} onChange={e => { setWidth(e.target.value); reset(); }} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base" /></label>
            <label className="text-sm font-semibold">Height (optional)<input type="number" min="0.25" max="20" step="0.01" disabled={locked} placeholder="Auto" value={height} onChange={e => { setHeight(e.target.value); reset(); }} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base" /></label>
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={locked} onChange={e => { setLocked(e.target.checked); reset(); }} /> Lock artwork proportions</label>
          <p className="text-xs text-gray-500">With trimming on, size refers to visible artwork. Unlock proportions only to intentionally stretch the design.</p>
          <label className="block text-sm font-semibold">Link to quote number (optional)<input type="number" min="1" disabled={!!saved || !!quoteId} value={quote} onChange={e => setQuote(e.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label>
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-gray-600">Advanced settings</summary><label className="mt-3 block">Stitch spacing (mm)<input type="number" required min="0.25" max="1.2" step="0.01" value={spacing} onChange={e => { setSpacing(e.target.value); reset(); }} className="ml-3 w-24 rounded-lg border p-2" /></label></details>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600">{busy ? <Loader2 className="animate-spin" size={20} /> : <Calculator size={20} />}{busy ? 'Estimating stitches…' : 'Estimate stitches'}</button>
        </fieldset>
        {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{error.includes('session expired') && <Link className="mt-2 block font-semibold underline" to={`/auth?reason=admin&redirect=${encodeURIComponent(saved ? `/stitch-estimator?estimate=${saved.id}` : '/stitch-estimator')}`}>Sign in and resume</Link>}</div>}
      </form>
      <div aria-live="polite" aria-busy={busy}>
        {result && dirty && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Artwork or settings changed. Showing the previous result; estimate again before saving or creating a mockup.</p>}
        {result?.embroidery_preview && <div className="mb-5 overflow-hidden rounded-xl border border-gray-200">
          <div className="border-b bg-gray-50 px-4 py-3"><h2 className="font-semibold text-gray-900">Embroidery preview</h2><p className="mt-1 text-xs text-gray-500">Simulated thread texture · transparent PNG</p></div>
          <div className="flex min-h-56 items-center justify-center bg-gray-200 p-6"><img src={result.embroidery_preview.data_url} alt="Your artwork with simulated embroidery thread texture" className="max-h-80 max-w-full object-contain" /></div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <button type="button" onClick={downloadPreview} className="rounded-lg border border-orange-200 px-3 py-3 text-center text-sm font-semibold text-orange-700 hover:bg-orange-50">Download PNG</button>
            <button type="button" disabled={mockupBusy || busy || dirty} onClick={useInMockup} className="rounded-lg bg-orange-500 px-3 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">{mockupBusy ? 'Opening mockup…' : 'Use in Mockup'}</button>
          </div>
          <p className="px-4 pb-4 text-xs text-gray-500">Choose a garment and position the artwork in Design Studio. Actual thread paths depend on digitizing.</p>
        </div>}
        {result ? <div className="rounded-xl bg-slate-900 p-6 text-white">
          <p className="text-sm text-orange-300">Estimated stitch count</p>
          {result.artwork && <p className="mt-2 text-xs text-slate-400">Artwork bounds: {result.artwork.bounds.width} × {result.artwork.bounds.height} px from {result.artwork.original.width} × {result.artwork.original.height} px canvas</p>}
          <p className="mt-2 text-5xl font-bold tracking-tight">{count(result.estimated_stitches)}</p>
          <p className="mt-3 text-sm text-slate-300">Uncalibrated planning range: <strong className="text-white">{count(result.low_stitches)}–{count(result.high_stitches)}</strong></p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-700 pt-5 text-sm">
            <div><dt className="text-slate-400">Finished size</dt><dd className="mt-1">{result.width_in}″ × {result.height_in}″</dd></div>
            <div><dt className="text-slate-400">Artwork coverage</dt><dd className="mt-1">{result.coverage_pct}%</dd></div>
            <div><dt className="text-slate-400">Approx. color groups</dt><dd className="mt-1">{result.color_count_estimate}</dd></div>
          </dl>
          <details className="mt-5 text-sm"><summary className="cursor-pointer text-slate-300">Stitch breakdown</summary><dl className="mt-3 space-y-2">{Object.entries(result.breakdown).map(([key, value]) => <div key={key} className="flex justify-between capitalize"><dt>{key}</dt><dd>{count(value)}</dd></div>)}</dl></details>
          <button type="button" className="mt-6 w-full rounded-lg border border-slate-500 py-2 text-sm hover:bg-slate-800" onClick={async () => { try { await navigator.clipboard.writeText(`${result.filename || saved?.name || file?.name}: estimated ${count(result.estimated_stitches)} stitches (${count(result.low_stitches)}–${count(result.high_stitches)}), ${result.width_in} × ${result.height_in} inches. Preliminary PNG estimate; confirm with digitized file.`); setCopied(true); } catch { setError('Copy unavailable in this browser. Select the displayed results instead.'); } }}>{copied ? 'Copied for quote notes' : 'Copy estimate for quote notes'}</button>
        </div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-7 text-center"><Calculator size={36} className="mb-4 text-orange-400" /><h2 className="font-semibold text-gray-900">Your estimate appears here</h2><p className="mt-2 text-sm text-gray-500">Choose a PNG and its finished embroidery size to begin.</p></div>}
        {result && <div className="mt-4 space-y-3 rounded-xl border p-4">
          <button type="button" disabled={mockupBusy || busy || dirty || !!saved} onClick={saveOnly} className="w-full rounded-lg bg-slate-900 p-3 text-sm font-semibold text-white disabled:opacity-50">{saved ? `Saved estimate #${saved.id}` : mockupBusy ? 'Saving…' : 'Save artwork & estimate'}</button>
          {onApply && <button type="button" disabled={dirty || busy || mockupBusy} onClick={async () => { setMockupBusy(true); try { await saveEstimate(); onApply(result.estimated_stitches); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save.'); } finally { setMockupBusy(false); } }} className="w-full rounded-lg bg-orange-500 p-3 font-semibold text-white disabled:opacity-50">Apply estimated count to quote</button>}
          {saved && <div><label className="mb-3 block text-sm font-semibold">Calibration artwork complexity<select disabled={mockupBusy || busy || dirty} value={saved.data.calibration?.complexity || 'unclassified'} className="mt-2 block w-full rounded border p-2" onChange={async e => {
            const complexity = e.target.value;
            setMockupBusy(true); setError('');
            try { const record = await api(`/${saved.id}/calibration`, { complexity }); setSaved(record); setAccuracyRevision(v => v + 1); }
            catch (err) { setError(err instanceof Error ? err.message : 'Unable to classify sample.'); }
            finally { setMockupBusy(false); }
          }}><option value="unclassified">Unclassified</option><option value="simple">Simple</option><option value="moderate">Moderate</option><option value="complex">Complex</option></select></label><label className="block text-sm font-semibold">Actual digitized stitch count<input type="number" min="1" value={actual} onChange={e => setActual(e.target.value)} className="mt-2 w-full rounded border p-2" /></label><label className="mt-2 block text-xs text-gray-600">Or read the count from a DST header<input type="file" accept=".dst" className="mt-1 block max-w-full" onChange={async e => { const dst = e.target.files?.[0]; if (!dst) return; try { const header = await dst.slice(0, 512).text(); const count = header.match(/ST:\s*(\d{1,7})/); if (!count) throw new Error('DST header has no readable stitch count. Enter it manually.'); setActual(count[1] || ''); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to read DST.'); } }} /></label><button type="button" disabled={mockupBusy || busy || dirty || !actual} onClick={recordActual} className="mt-2 text-sm font-semibold text-orange-700">Record actual count</button>{saved.actual_stitches && <p className="mt-2 text-xs">Recorded: {count(saved.actual_stitches)} stitches. Difference from estimate: {((saved.actual_stitches - result.estimated_stitches) / result.estimated_stitches * 100).toFixed(1)}%.</p>}</div>}
          {!saved && <p className="text-xs text-gray-500">Save to keep the original artwork, preview and settings for later. Unsaved results are temporary.</p>}
        </div>}
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Preliminary estimate only. Digitizing choices, fabric and underlay affect the final stitch count. Confirm against the digitized file before final pricing. This tool does not create a DST file.</p>
        <Link to="/admin?section=embroidery" className="mt-5 inline-block text-sm font-semibold text-orange-700 hover:underline">Back to embroidery jobs &amp; quotes →</Link>
      </div>
    </div>
    <EmbroideryAccuracy revision={String(accuracyRevision)} onOpen={id => { if (!busy && !mockupBusy) void openSaved(id); }} />
  </section>;
}
