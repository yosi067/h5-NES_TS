import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type WorkletProcessor = {
  port: { onmessage?: (event: { data: unknown }) => void; postMessage: (data: unknown) => void };
  process(inputs: unknown[], outputs: Float32Array[][]): boolean;
};

function createProcessor(reports: any[] = [], rate = 48000): WorkletProcessor {
  let ProcessorClass: new () => WorkletProcessor;
  class AudioWorkletProcessorMock {
    port: WorkletProcessor['port'] = { postMessage: data => reports.push(data) };
  }
  const source = readFileSync(resolve(process.cwd(), 'public/n64-audio-worklet.js'), 'utf8');
  vm.runInNewContext(source, {
    AudioWorkletProcessor: AudioWorkletProcessorMock,
    Float32Array,
    sampleRate: rate,
    registerProcessor: (_name: string, implementation: new () => WorkletProcessor) => {
      ProcessorClass = implementation;
    },
  });
  return new ProcessorClass!();
}

function output(processor: WorkletProcessor, frames: number): Float32Array[][] {
  const outputs = [[new Float32Array(frames), new Float32Array(frames)]];
  processor.process([], outputs);
  return outputs;
}

function postSamples(processor: WorkletProcessor, frames: number, value: number): void {
  const samples = new Float32Array(frames * 2);
  samples.fill(value);
  processor.port.onmessage?.({ data: { type: 'samples', samples } });
}

describe('N64 audio worklet', () => {
  it('acknowledges lifecycle only on render and heartbeats independently of diagnostics at current rate', () => {
    const reports: any[] = [];
    const p = createProcessor(reports, 44100);
    p.port.onmessage?.({ data: { type: 'lifecycle', generation: 7 } });
    expect(reports).toEqual([]);
    output(p, 128);
    expect(reports).toEqual([{ type: 'n64-audio-heartbeat', generation: 7, sampleRate: 44100 }]);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    output(p, 44100);
    expect(reports[1]).toMatchObject({ type: 'n64-audio-heartbeat', generation: 7 });
    expect(reports[2]).toMatchObject({ type: 'n64-audio-output', sequence: 1, renderedFrames: 44100, sampleRate: 44100 });
  });
  it('excludes app pause intent without muting or changing PCM', () => {
    const reports: any[] = [];
    const p = createProcessor(reports);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    postSamples(p, 1024, 0.5);
    p.port.onmessage?.({ data: { type: 'diagnostics-state', running: false, muted: false } });
    expect(output(p, 1024)[0][0][500]).toBe(0.5);
    output(p, 48000 - 1024);
    expect(reports[0]).toMatchObject({ pausedFrames: 48000, underflowFrames: 0 });
    p.port.onmessage?.({ data: { type: 'diagnostics-state', running: true, muted: false } });
    output(p, 48000);
    expect(reports[1]).toMatchObject({ underflowFrames: 48000, underflowEvents: 1 });
  });
  it('is silent diagnostically by default and preserves identical PCM when enabled', () => {
    const reports: any[] = [];
    const normal = createProcessor(reports);
    const diagnosed = createProcessor();
    diagnosed.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    for (const p of [normal, diagnosed]) postSamples(p, 1024, 0.5);
    expect(output(diagnosed, 50000)).toEqual(output(normal, 50000));
    expect(reports).toEqual([]);
  });

  it('counts missing source frames despite decay and preserves gaps across report boundaries', () => {
    const reports: any[] = [];
    const p = createProcessor(reports);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    postSamples(p, 1024, 0.5);
    for (let i = 0; i < 750; i++) output(p, 128);
    expect(reports).toHaveLength(2);
    expect(reports[1]).toMatchObject({ sampleRate: 48000, mode: 'audio-worklet',
      renderedFrames: 96000, underflowFrames: 94976, underflowEvents: 1,
      longestGapFrames: 94976, queueMinFrames: 0, queueMaxFrames: 1024 });
    postSamples(p, 64, 1);
    output(p, 128);
    output(p, 47872);
    expect(reports[2].underflowEvents).toBe(2);
    expect(reports[2].longestGapFrames).toBe(94976);
  });

  it('excludes initial priming, pause, mute, clear and subsequent re-priming', () => {
    const reports: any[] = [];
    const p = createProcessor(reports, 44100);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    output(p, 44100);
    postSamples(p, 1024, 1);
    output(p, 1024);
    for (const message of [
      { type: 'state', running: false, muted: false },
      { type: 'state', running: true, muted: true },
      { type: 'state', running: true, muted: false },
      { type: 'clear' },
    ]) {
      p.port.onmessage?.({ data: message });
      output(p, 44100);
    }
    expect(reports.at(-1)).toMatchObject({ sampleRate: 44100, underflowFrames: 0,
      underflowEvents: 0, steadyFrames: 1024, excludedFrames: 220500,
      pausedFrames: 44100, mutedFrames: 44100, primingFrames: 132300, clearEvents: 3 });
  });

  it('counts only high-water steady drops, including partially consumed chunks', () => {
    const reports: any[] = [];
    const p = createProcessor(reports);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    postSamples(p, 4096, 1);
    postSamples(p, 4096, 1); // pre-prime drop excluded
    output(p, 128);
    postSamples(p, 4096, 1); // drops remaining 3968
    output(p, 47872);
    expect(reports[0]).toMatchObject({ droppedFrames: 3968, dropEvents: 1 });
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: false } });
    output(p, 96000);
    expect(reports).toHaveLength(1);
  });

  it('never posts per quantum or in response to state/sample messages', () => {
    const reports: any[] = [];
    const p = createProcessor(reports);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    for (let i = 0; i < 374; i++) output(p, 128);
    expect(reports).toHaveLength(0);
    output(p, 128);
    expect(reports).toHaveLength(1);
    p.port.onmessage?.({ data: { type: 'diagnostics', enabled: true } });
    postSamples(p, 1024, 1);
    expect(reports).toHaveLength(1);
  });
  it('resumes a drained queue without waiting for another priming window', () => {
    const processor = createProcessor();
    processor.port.onmessage?.({ data: { type: 'state', running: true, muted: false } });
    postSamples(processor, 1024, 0.5);
    output(processor, 1024);

    output(processor, 64);
    postSamples(processor, 128, 1);
    const resumed = output(processor, 128);

    expect(resumed[0][0][0]).toBeGreaterThan(0.2);
    expect(resumed[0][0][80]).toBeGreaterThan(0.9);
    expect(resumed[0][1][80]).toBeGreaterThan(0.9);
  });

  it('smoothly recovers after a valid prefix is followed by a source gap', () => {
    const processor = createProcessor();
    processor.port.onmessage?.({ data: { type: 'state', running: true, muted: false } });
    postSamples(processor, 1024, 0.5);
    output(processor, 1024);

    postSamples(processor, 128, 0.25);
    const gapStart = output(processor, 192);
    postSamples(processor, 128, 1);
    const resumed = output(processor, 128);

    expect(gapStart[0][0][127]).toBeCloseTo(0.25, 2);
    expect(gapStart[0][0][191]).toBeGreaterThan(0.1);
    expect(resumed[0][0][0]).toBeGreaterThan(0.1);
    expect(resumed[0][0][80]).toBeGreaterThan(0.9);
  });
});