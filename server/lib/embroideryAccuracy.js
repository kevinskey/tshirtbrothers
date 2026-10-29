// Observational metrics only: never modifies estimator output or pricing.
const positive = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
export const complexities = ['simple', 'moderate', 'complex'];
export function accuracyReport(records) {
  const samples = records.map(row => {
    const d = row.data || {};
    const valid = positive(d.estimated_stitches) && positive(row.actual_stitches);
    const coverage = d.coverage_pct;
    const width = positive(d.width_in) ? Number(d.width_in) : null;
    const height = positive(d.height_in) ? Number(d.height_in) : null;
    const complexity = complexities.includes(d.calibration?.complexity) ? d.calibration.complexity : 'unclassified';
    return { id: row.id, name: row.name, estimated: positive(d.estimated_stitches) ? Number(d.estimated_stitches) : null,
      actual: positive(row.actual_stitches) ? Number(row.actual_stitches) : null, width, height,
      complexity, coverage: coverage != null && Number.isFinite(Number(coverage)) && Number(coverage) >= 0 && Number(coverage) <= 100 ? Number(coverage) : null,
      size: width && height ? (Math.max(width, height) <= 4 ? 'small' : Math.max(width, height) <= 8 ? 'medium' : 'large') : 'unclassified',
      error_pct: valid ? (Number(d.estimated_stitches) - Number(row.actual_stitches)) / Number(row.actual_stitches) * 100 : null };
  }).map(s => ({ ...s, coverage_group: s.coverage == null ? 'unclassified' : s.coverage < 35 ? 'sparse' : s.coverage < 70 ? 'mixed' : 'dense', outlier: s.error_pct != null && Math.abs(s.error_pct) > 30 }));
  const summarize = rows => {
    const paired = rows.filter(s => s.error_pct != null);
    const n = paired.length;
    return { saved: rows.length, paired: n, missing_actual: rows.filter(s => s.actual == null).length,
      invalid_estimate: rows.filter(s => s.actual != null && s.estimated == null).length,
      mape: n ? paired.reduce((v, s) => v + Math.abs(s.error_pct), 0) / n : null,
      bias: n ? paired.reduce((v, s) => v + s.error_pct, 0) / n : null,
      outliers: paired.filter(s => s.outlier).length };
  };
  const groups = {};
  for (const [key, values] of Object.entries({ complexity: [...complexities, 'unclassified'], coverage_group: ['sparse', 'mixed', 'dense', 'unclassified'], size: ['small', 'medium', 'large', 'unclassified'] })) {
    groups[key] = values.map(value => ({ value, ...summarize(samples.filter(s => s[key] === value)) }));
  }
  const missing = Object.entries(groups).flatMap(([axis, rows]) => rows.filter(r => r.value !== 'unclassified' && r.paired < 5).map(r => ({ axis, group: r.value, needed: 5 - r.paired })));
  return { ...summarize(samples), groups, samples, calibration: { applied: false, review_ready: samples.filter(s => s.error_pct != null).length >= 30 && !missing.length,
    missing, message: 'No correction factors applied. Collection target: 30 independent designs, at least 5 actual counts in each group; this is a review gate, not proof of accuracy. Confirm matching artwork, size and digitizing settings, then validate on held-out designs before fitting or pricing.' } };
}
