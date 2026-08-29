interface BpsWorkerResponse {
  outputBuffer?: ArrayBuffer;
  error?: string;
}

export function applyBpsPatch(sourceBytes: Uint8Array, patchBytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${import.meta.env.BASE_URL}bps-patch-worker.js`);
    const sourceBuffer = sourceBytes.slice().buffer;
    const patchBuffer = patchBytes.slice().buffer;

    worker.onmessage = (event: MessageEvent<BpsWorkerResponse>) => {
      worker.terminate();
      if (event.data.error || !event.data.outputBuffer) {
        reject(new Error(event.data.error || 'BPS worker returned no output'));
        return;
      }
      resolve(new Uint8Array(event.data.outputBuffer));
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(new Error(event.message || 'BPS worker failed'));
    };
    worker.postMessage({ sourceBuffer, patchBuffer }, [sourceBuffer, patchBuffer]);
  });
}