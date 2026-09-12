import { readRectDiagnostics } from './rect-diagnostics';
import type { N64AudioOutputBridge } from './audio-output-diagnostics';

/** Opt-in device-side readout: no UA-based claims about physical hardware. */
const history: unknown[] = [];
export function showN64AudioDiagnostics(audioOutput: {
  status: string; mode: string; sampleRate: number | null;
  underflowMs: number | null; longestGapMs: number | null;
  bridge?: Omit<N64AudioOutputBridge, 'port'> | null;
}, report: unknown): void {
  let panel = document.getElementById('n64-audio-diagnostics');
  if (!panel) {
    history.length = 0;
    panel = document.createElement('details');
    panel.id = 'n64-audio-diagnostics';
    panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10000;max-width:90vw;padding:8px;background:#101827ee;color:#fff;font:12px monospace;border-radius:8px';
    const summary = document.createElement('summary');
    summary.textContent = 'N64 音訊診斷';
    panel.append(summary, document.createElement('pre'), document.createElement('button'));
    document.body.append(panel);
  }
  // Existing five-second telemetry cadence; bounded to approximately 16 minutes.
  history.push(report);
  if (history.length > 200) history.shift();
  const rect = readRectDiagnostics(window.location.search, globalThis.__n64RectPhases);
  panel.querySelector('pre')!.textContent = [
    `安全連線: ${window.isSecureContext ? '是' : '否 — 此結果不能驗收 Worklet'}`,
    `${audioOutput.mode} / ${audioOutput.status}`,
    `取樣率: ${audioOutput.sampleRate ?? '未知'}`,
    `SDL: ${audioOutput.bridge?.contextState ?? '未知'} / ${audioOutput.bridge?.routeState ?? '未知'}`,
    `Context / producer / generation: ${audioOutput.bridge?.contextId ?? '—'} / ${audioOutput.bridge?.scriptProcessorId ?? '—'} / ${audioOutput.bridge?.generation ?? '—'}`,
    `Render ack: ${audioOutput.bridge?.acknowledged ?? false} / heartbeat age: ${audioOutput.bridge?.heartbeatAgeMs ?? '—'} ms`,
    `Lifecycle error: ${audioOutput.bridge?.lastError ?? 'none'}`,
    `累積缺音: ${audioOutput.underflowMs?.toFixed(1) ?? '未知'} ms`,
    `最長缺音: ${audioOutput.longestGapMs?.toFixed(1) ?? '未知'} ms`,
    `Rectangle phases: ${rect.status} / age ${rect.ageMs?.toFixed(0) ?? '—'} ms`,
    ...rect.rows.map(row => `${row.method}: ${row.calls} calls\n` +
      ` query/state/attrib/draw/restore/other 累積 ms:\n ` +
      [row.queryMs, row.stateMs, row.attribMs, row.drawMs, row.restoreMs, row.otherMs].map(v => v.toFixed(1)).join('/')),
    '含暖機，非獨立穩態測試；請匯出供分析。',
  ].join('\n');
  const button = panel.querySelector('button')!;
  button.textContent = '匯出診斷 JSON';
  button.onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ latest: report, history }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'n64-iphone-audio-diagnostics.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
}