import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type WorkletProcessor = {
  port: { onmessage?: (event: { data: unknown }) => void };
  process(inputs: unknown[], outputs: Float32Array[][]): boolean;
};

function createProcessor(): WorkletProcessor {
  let ProcessorClass: new () => WorkletProcessor;
  class AudioWorkletProcessorMock {
    port: WorkletProcessor['port'] = {};
  }
  const source = readFileSync(resolve(process.cwd(), 'public/n64-audio-worklet.js'), 'utf8');
  vm.runInNewContext(source, {
    AudioWorkletProcessor: AudioWorkletProcessorMock,
    Float32Array,
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