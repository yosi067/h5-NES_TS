import { describe, expect, it, vi } from 'vitest';
import { audioOutputDiagnosticsEnabled, createAudioOutputDiagnostics } from '../src/n64/audio-output-diagnostics';

describe('N64 output diagnostics reception/export (logic only)', () => {
  it('expires awaiting and received reports, resets counters and rate on replacement port', () => {
    let clock = 0;
    const d = createAudioOutputDiagnostics(true, () => clock);
    const makePort = () => Object.assign(new EventTarget(), { start: vi.fn(), postMessage: vi.fn() });
    const old = makePort(), next = makePort();
    const attach = (port: typeof old, rate: number) => d.attach({ port: port as unknown as MessagePort,
      sampleRate: rate, mode: 'audio-worklet', contextState: 'running', generation: rate });
    attach(old, 48000); clock = 5001;
    expect(d.snapshot().status).toBe('render-report-timeout');
    attach(next, 44100);
    const report = (port: typeof old, sequence: number, sampleRate: number) => port.dispatchEvent(new MessageEvent('message', { data: {
      type: 'n64-audio-output', version: 1, mode: 'audio-worklet', sequence, sampleRate,
      renderedFrames: sampleRate * sequence, underflowFrames: 441, longestGapFrames: 441,
    } }));
    report(old, 8, 48000);
    expect(d.snapshot().latest).toBeNull();
    report(next, 1, 44100);
    expect(d.snapshot()).toMatchObject({ status: 'receiving', session: 2, sampleRate: 44100, underflowMs: 10 });
    clock += 5001;
    expect(d.snapshot().status).toBe('render-report-stale');
    d.attach({ port: null, mode: 'script-processor', sampleRate: 44100, lastError: 'processorerror' });
    expect(d.snapshot()).toMatchObject({ latest: null, bridge: { lastError: 'processorerror' } });
    attach(old, 48000); report(old, 1, 48000);
    expect(d.snapshot()).toMatchObject({ session: 3, latest: { sequence: 1 } });
    d.dispose();
  });
  it('detaches on fallback and forwards lifecycle only on changes', () => {
    const port = Object.assign(new EventTarget(), { start: vi.fn(), postMessage: vi.fn() });
    const d = createAudioOutputDiagnostics(true);
    d.attach({ port: port as unknown as MessagePort, sampleRate: 48000, mode: 'audio-worklet' });
    d.setLifecycle(false, false);
    d.setLifecycle(false, false);
    expect(port.postMessage).toHaveBeenCalledTimes(3);
    d.attach({ port: null, sampleRate: 44100, mode: 'script-processor' });
    port.dispatchEvent(new MessageEvent('message', { data: {
      type: 'n64-audio-output', version: 1, mode: 'audio-worklet', sampleRate: 48000,
      sequence: 1, renderedFrames: 48000, underflowFrames: 480, longestGapFrames: 240,
    } }));
    expect(d.snapshot()).toMatchObject({ latest: null, status: 'output-counters-unavailable' });
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'diagnostics', enabled: false });
  });
  it('requires an independent explicit opt-in', () => {
    expect(audioOutputDiagnosticsEnabled('?n64Benchmark=1')).toBe(false);
    expect(audioOutputDiagnosticsEnabled('?n64AudioDiagnostics=1')).toBe(true);
    const d = createAudioOutputDiagnostics(false);
    d.attach();
    expect(d.snapshot().status).toBe('disabled');
  });
  it('exports missing capabilities rather than zero underruns', () => {
    const d = createAudioOutputDiagnostics(true);
    d.attach();
    expect(d.snapshot().status).toBe('unsupported-runtime-rebuild-required');
    d.attach({ port: null, sampleRate: 44100, mode: 'script-processor' });
    expect(d.snapshot()).toMatchObject({ mode: 'script-processor', sampleRate: 44100,
      status: 'output-counters-unavailable', latest: null, underflowMs: null });
  });
  it('attaches once, exports render-derived values, and removes its listener on stop', () => {
    const port = Object.assign(new EventTarget(), { start: vi.fn(), postMessage: vi.fn() });
    const d = createAudioOutputDiagnostics(true);
    const bridge = { port: port as unknown as MessagePort, sampleRate: 48000, mode: 'audio-worklet' as const };
    d.attach(bridge);
    d.attach(bridge);
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    port.dispatchEvent(new MessageEvent('message', { data: {
      type: 'n64-audio-output', version: 1, mode: 'audio-worklet', sampleRate: 48000,
      sequence: 1, renderedFrames: 48000, underflowFrames: 480, longestGapFrames: 240,
    } }));
    expect(d.snapshot()).toMatchObject({ status: 'receiving', underflowMs: 10, longestGapMs: 5 });
    expect(JSON.parse(JSON.stringify(d.snapshot())).latest.sequence).toBe(1);
    d.dispose();
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'diagnostics', enabled: false });
  });
});