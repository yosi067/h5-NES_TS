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
  const source = readFileSync(resolve(process.cwd(), 'public/audio-worklet.js'), 'utf8');
  vm.runInNewContext(source, {
    AudioWorkletProcessor: AudioWorkletProcessorMock,
    registerProcessor: (_name: string, implementation: new () => WorkletProcessor) => {
      ProcessorClass = implementation;
    },
  });
  return new ProcessorClass!();
}

function render(samples: Float32Array, channels: 1 | 2): Float32Array[][] {
  const processor = createProcessor();
  processor.port.onmessage?.({ data: { type: 'state', running: true, muted: false } });
  const primingFrames = 1024;
  const primingSamples = channels === 2
    ? new Float32Array(primingFrames * 2)
    : new Float32Array(primingFrames);
  primingSamples.set(samples);
  processor.port.onmessage?.({ data: { type: 'samples', samples: primingSamples, channels } });
  const outputs = [[new Float32Array(samples.length / channels), new Float32Array(samples.length / channels)]];
  processor.process([], outputs);
  return outputs;
}

describe('emulator audio worklet', () => {
  it('duplicates mono FC samples to both output channels', () => {
    const outputs = render(new Float32Array([0.25, -0.5]), 1);
    expect(Array.from(outputs[0][0].slice(0, 2))).toEqual([0.25, -0.5]);
    expect(Array.from(outputs[0][1].slice(0, 2))).toEqual([0.25, -0.5]);
  });

  it('preserves interleaved SFC stereo samples', () => {
    const outputs = render(new Float32Array([0.25, -0.25, 0.5, -0.5]), 2);
    expect(Array.from(outputs[0][0].slice(0, 2))).toEqual([0.25, 0.5]);
    expect(Array.from(outputs[0][1].slice(0, 2))).toEqual([-0.25, -0.5]);
  });

  it('reports underruns and dropped chunks only when asked', () => {
    const processor = createProcessor();
    const posted: unknown[] = [];
    (processor.port as { postMessage?: (data: unknown) => void }).postMessage = (data) => posted.push(data);
    const send = (data: unknown) => processor.port.onmessage?.({ data });
    send({ type: 'state', running: true, muted: false });

    // 25 個區塊超過上限 24，最舊的一塊會被丟掉。
    for (let index = 0; index < 25; index++) send({ type: 'samples', samples: new Float32Array(64), channels: 1 });
    expect(posted).toHaveLength(0);

    // 24 × 64 = 1536 幀可播放；輸出 2048 幀必定見底一次。
    processor.process([], [[new Float32Array(2048), new Float32Array(2048)]]);
    send({ type: 'stats' });
    expect(posted).toEqual([{ type: 'stats', bufferedFrames: 0, underruns: 1, droppedChunks: 1 }]);
  });
});
