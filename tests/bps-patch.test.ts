import { describe, expect, it } from 'vitest';
import { applyBpsPatch } from '../src/game-profiles/bps';

class FakeWorker {
  static postedSource: Uint8Array;
  static postedPatch: Uint8Array;
  static response: { outputBuffer?: ArrayBuffer; error?: string };

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: { sourceBuffer: ArrayBuffer; patchBuffer: ArrayBuffer }): void {
    FakeWorker.postedSource = new Uint8Array(message.sourceBuffer).slice();
    FakeWorker.postedPatch = new Uint8Array(message.patchBuffer).slice();
    queueMicrotask(() => this.onmessage?.({ data: FakeWorker.response } as MessageEvent));
  }

  terminate(): void {}
}

globalThis.Worker = FakeWorker as unknown as typeof Worker;

describe('applyBpsPatch', () => {
  it('copies inputs before transferring them to the worker', async () => {
    const source = Uint8Array.from([1, 2, 3]);
    const patch = Uint8Array.from([4, 5, 6]);
    const sourceBefore = source.slice();
    const patchBefore = patch.slice();
    FakeWorker.response = { outputBuffer: Uint8Array.from([1, 9, 3, 4]).buffer };

    await expect(applyBpsPatch(source, patch)).resolves.toEqual(Uint8Array.from([1, 9, 3, 4]));
    expect(source).toEqual(sourceBefore);
    expect(patch).toEqual(patchBefore);
    expect(FakeWorker.postedSource).toEqual(sourceBefore);
    expect(FakeWorker.postedPatch).toEqual(patchBefore);
  });

  it('rejects validation errors returned by the worker', async () => {
    FakeWorker.response = { error: 'Source ROM checksum mismatch' };

    await expect(applyBpsPatch(Uint8Array.from([1]), Uint8Array.from([2]))).rejects.toThrow(
      'Source ROM checksum mismatch',
    );
  });
});