import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyReport } from './embroideryAccuracy.js';
const sample = (id, estimate, actual, extra = {}) => ({ id, name: `Design ${id}`, actual_stitches: actual, data: { estimated_stitches: estimate, width_in: 3.5, height_in: 2, coverage_pct: 50, calibration: { complexity: 'simple' }, ...extra } });
test('absolute error cannot cancel; signed bias uses actual denominator', () => {
  const r = accuracyReport([sample(1, 150, 100), sample(2, 50, 100)]);
  assert.equal(r.mape, 50); assert.equal(r.bias, 0); assert.equal(r.paired, 2); assert.equal(r.outliers, 2);
  assert.equal(r.calibration.applied, false);
});
test('empty, missing, zero, nonfinite and malformed estimates do not pollute paired metrics', () => {
  assert.equal(accuracyReport([]).mape, null);
  const r = accuracyReport([sample(1, 100, null), sample(2, 0, 100), sample(3, 'bad', 100), sample(4, Infinity, 100), sample(5, 130, 100), sample(6, 100, 0)]);
  assert.equal(r.saved, 6); assert.equal(r.paired, 1); assert.equal(r.missing_actual, 2); assert.equal(r.invalid_estimate, 3);
  assert.equal(r.bias, 30); assert.equal(r.outliers, 0);
});
test('groups preserve unknown metadata and use coverage/longest-side boundaries', () => {
  const r = accuracyReport([sample(1, '100', '100', { width_in: 4, coverage_pct: 35 }), sample(2, 100, 100, { width_in: 8, coverage_pct: 70 }), sample(3, 100, 100, { width_in: 9, coverage_pct: 34.9 }), sample(4, 100, 100, { width_in: null, coverage_pct: null, calibration: null })]);
  assert.deepEqual(r.samples.map(s => s.size), ['small', 'medium', 'large', 'unclassified']);
  assert.deepEqual(r.samples.map(s => s.coverage_group), ['mixed', 'dense', 'sparse', 'unclassified']);
  assert.equal(r.samples[3].complexity, 'unclassified'); assert.equal(r.groups.complexity[0].paired, 3);
  assert.equal(r.calibration.review_ready, false); assert.ok(r.calibration.missing.length);
});
test('all records count beyond recent list, collection target never fits factors', () => {
  const r = accuracyReport(Array.from({ length: 36 }, (_, i) => sample(i + 1, 100, 100, { width_in: [3, 6, 9][i % 3], coverage_pct: [20, 50, 80][i % 3], calibration: { complexity: ['simple', 'moderate', 'complex'][i % 3] } })));
  assert.equal(r.paired, 36); assert.equal(r.calibration.review_ready, true); assert.equal(r.calibration.applied, false);
  assert.equal(r.calibration.missing.length, 0);
});
