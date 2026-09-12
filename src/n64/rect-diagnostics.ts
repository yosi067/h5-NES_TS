/** Cumulative CPU/WebGL wall timings, not GPU timings or VI-aligned samples. */
export const RECT_METHODS = ['RenderTexRect', 'RenderFillRect', 'DrawSimple2DTexture', 'DrawSimpleRect'] as const;

export function readRectDiagnostics(search: string, raw: unknown, now = performance.now()) {
  const enabled = new URLSearchParams(search).get('n64RectDiagnostics') === '1';
  const unavailable = { status: enabled ? 'waiting-or-unsupported-runtime' : 'disabled', rows: [], ageMs: null };
  if (!enabled || !raw || typeof raw !== 'object') return unavailable;
  const data = raw as { version?: number; recordedAtMs?: number; values?: unknown };
  if (data.version !== 1 || typeof data.recordedAtMs !== 'number' || !Number.isFinite(data.recordedAtMs)
    || !Array.isArray(data.values) || data.values.length !== 32
    || !data.values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return unavailable;
  const values = data.values as number[];
  const ageMs = Math.max(0, now - data.recordedAtMs);
  return {
    status: ageMs > 3000 ? 'stale' : 'receiving', version: 1,
    scope: 'cumulative-since-runtime-start; CPU/WebGL wall time; instrumentation overhead included',
    recordedAtMs: data.recordedAtMs, ageMs,
    rows: RECT_METHODS.map((method, i) => {
      const [totalMs, queryMs, stateMs, attribMs, drawMs, restoreMs, calls, queryCalls] = values.slice(i * 8, i * 8 + 8);
      return { method, totalMs, queryMs, stateMs, attribMs, drawMs, restoreMs,
        otherMs: Math.max(0, totalMs - queryMs - stateMs - attribMs - drawMs - restoreMs), calls, queryCalls };
    }),
  };
}

declare global {
  var __n64RectPhases: unknown;
  var __n64CullStateCacheEnabled: boolean | undefined;
}
