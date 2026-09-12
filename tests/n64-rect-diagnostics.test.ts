import { describe, expect, it } from 'vitest';
import { readRectDiagnostics, RECT_METHODS } from '../src/n64/rect-diagnostics';

const capture = () => ({ version: 1, recordedAtMs: 1000, values: Array.from({ length: 4 }, () => [21, 1, 2, 3, 4, 5, 6, 6]).flat() });

describe('rectangle phase diagnostics', () => {
  it('is strictly opt-in and does not expose stale captures when disabled', () => {
    for (const search of ['', '?n64RectDiagnostics=0', '?n64RectDiagnostics=true']) {
      expect(readRectDiagnostics(search, capture(), 1100)).toEqual({ status: 'disabled', rows: [], ageMs: null });
    }
  });
  it('decodes all four cumulative rows and derives unclassified time', () => {
    const report = readRectDiagnostics('?n64RectDiagnostics=1', capture(), 1100);
    expect(report.status).toBe('receiving');
    expect(report.ageMs).toBe(100);
    expect(report.rows.map(row => row.method)).toEqual(RECT_METHODS);
    expect(report.rows[0]).toEqual({ method: 'RenderTexRect', totalMs: 21, queryMs: 1,
      stateMs: 2, attribMs: 3, drawMs: 4, restoreMs: 5, otherMs: 6, calls: 6, queryCalls: 6 });
    expect(JSON.parse(JSON.stringify(report)).rows).toEqual(report.rows);
  });
  it('marks late reports rather than treating them as new VI-aligned measurements', () => {
    expect(readRectDiagnostics('?n64RectDiagnostics=1', capture(), 5000).status).toBe('stale');
  });
  it('rejects unavailable, malformed and nonfinite reports', () => {
    for (const raw of [undefined, {}, { ...capture(), version: 2 }, { ...capture(), recordedAtMs: NaN },
      { ...capture(), values: [1] }, { ...capture(), values: Array(32).fill(Infinity) },
      { ...capture(), values: Array(32).fill(-1) }]) {
      expect(readRectDiagnostics('?n64RectDiagnostics=1', raw, 1100).status).toBe('waiting-or-unsupported-runtime');
    }
  });
  it('copies primitive values so later publications cannot mutate export history', () => {
    const raw = capture();
    const report = readRectDiagnostics('?n64RectDiagnostics=1', raw, 1100);
    raw.values[0] = 100;
    expect(report.rows[0].totalMs).toBe(21);
  });
});
