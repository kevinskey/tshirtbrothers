import { useEffect, useState } from 'react';
type Summary = { saved: number; paired: number; missing_actual: number; invalid_estimate: number; mape: number | null; bias: number | null; outliers: number };
type Sample = { id: number; name: string; estimated: number | null; actual: number | null; width: number | null; height: number | null; complexity: string; coverage: number | null; coverage_group: string; size: string; error_pct: number | null; outlier: boolean };
type Report = Summary & { groups: Record<string, (Summary & { value: string })[]>; samples: Sample[]; calibration: { review_ready: boolean; message: string; missing: { axis: string; group: string; needed: number }[] } };
const pct = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;
export default function EmbroideryAccuracy({ revision, onOpen }: { revision: string; onOpen: (id: number) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ complexity: '', coverage_group: '', size: '' });
  const [outliers, setOutliers] = useState(false);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setReport(null);
    fetch('/api/admin/stitch-estimator/saved/accuracy', { headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` }, signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to load accuracy records. Sign in or retry.'); return r.json(); })
      .then(setReport).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [revision, refresh]);
  const rows = report?.samples.filter(s => Object.entries(filters).every(([key, value]) => !value || s[key as keyof Sample] === value) && (!outliers || s.outlier)) || [];
  return <details className="border-t bg-gray-50 p-5 sm:p-7"><summary className="cursor-pointer text-lg font-bold">Estimate accuracy &amp; calibration samples</summary>
    <p className="mt-3 text-sm text-gray-600">All saved designs, across quotes. Error = (estimate − actual) ÷ actual. Positive bias means overestimation; negative means underestimation. Coverage describes visible artwork, not digitized thread density.</p>
    <button type="button" onClick={() => setRefresh(v => v + 1)} className="my-3 text-sm font-semibold text-orange-700">Refresh accuracy</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!report && !error && <p role="status">Loading saved samples…</p>}
    {report && <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Saved / paired', `${report.saved} / ${report.paired}`], ['Average absolute error', pct(report.mape)], ['Signed average bias', pct(report.bias)], ['Outliers (>30% error)', report.outliers]].map(([label, value]) => <div key={label} className="rounded-lg border bg-white p-3"><dt className="text-xs text-gray-600">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>)}</dl>
      <p className="mt-3 text-sm">Missing actual counts: {report.missing_actual}. Actual counts with unusable estimates: {report.invalid_estimate}. Metrics use valid pairs only; no pairs display —.</p>
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{report.calibration.review_ready ? 'Collection target met; independent validation still required. ' : 'Representative calibration data not yet established. '}{report.calibration.message}</p>
      <p className="mt-3 text-xs text-gray-600">Use distinct production designs; repeated artwork can skew averages. Simple: lettering or basic shapes. Moderate: several shapes/colors. Complex: fine detail, small lettering or layered artwork. Record actual counts only for the saved dimensions and matching artwork.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">{Object.entries(report.groups).map(([axis, groups]) => <div key={axis}><label className="block text-sm font-semibold">{axis === 'coverage_group' ? 'Artwork coverage' : axis === 'size' ? 'Finished size (longest side)' : 'Artwork complexity'}<select value={filters[axis as keyof typeof filters]} onChange={e => { setFilters({ ...filters, [axis]: e.target.value }); setPage(0); }} className="my-2 block w-full rounded border p-2"><option value="">All groups</option>{groups.map(g => <option key={g.value} value={g.value}>{g.value} ({g.paired} paired)</option>)}</select></label><ul className="text-xs text-gray-600">{groups.map(g => <li key={g.value}>{g.value}: {g.paired} paired · error {pct(g.mape)} · bias {pct(g.bias)}</li>)}</ul></div>)}</div>
      <p className="mt-3 text-xs">Coverage: sparse &lt;35%, mixed 35–&lt;70%, dense ≥70%. Size: small ≤4″, medium &gt;4–8″, large &gt;8″. Groups summarize all records; filters select the table below.</p>
      {!!report.calibration.missing.length && <p className="mt-3 text-sm">Additional actual examples needed to reach the collection target: {report.calibration.missing.map(g => `${g.group} (${g.axis.replace('_group', '')}): ${g.needed}`).join('; ')}. One design may cover several groups.</p>}
      <label className="my-3 flex gap-2 text-sm"><input type="checkbox" checked={outliers} onChange={e => { setOutliers(e.target.checked); setPage(0); }} /> Show review outliers only (fixed &gt;30% absolute error, not a statistical test)</label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Design', 'Size / coverage', 'Complexity', 'Estimated / actual', 'Signed error'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.slice(page * 20, page * 20 + 20).map(s => <tr key={s.id} className={s.outlier ? 'bg-amber-50' : 'bg-white'}><td className="p-2"><button type="button" className="text-orange-700 underline" onClick={() => onOpen(s.id)}>#{s.id} {s.name}</button></td><td className="p-2">{s.width ?? '—'} × {s.height ?? '—'}″ / {s.coverage ?? '—'}%</td><td className="p-2">{s.complexity}</td><td className="p-2">{s.estimated?.toLocaleString() ?? '—'} / {s.actual?.toLocaleString() ?? '—'}</td><td className="p-2">{pct(s.error_pct)}{s.outlier ? ' · review' : ''}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className="py-3 text-sm">No saved designs match these filters. Save estimates and record matching digitized counts to build the comparison set.</p>}
      <div className="mt-3 flex gap-4 text-sm"><button type="button" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>{rows.length} designs · page {page + 1}</span><button type="button" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </details>;
}
