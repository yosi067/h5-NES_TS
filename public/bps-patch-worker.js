importScripts(
  './rom-patcher/BinFile.js',
  './rom-patcher/HashCalculator.js',
  './rom-patcher/RomPatcher.format.bps.js',
);

self.onmessage = event => {
  try {
    const sourceFile = new BinFile(new Uint8Array(event.data.sourceBuffer));
    const patchFile = new BinFile(new Uint8Array(event.data.patchBuffer));
    patchFile.seek(0);
    if (patchFile.readString(4) !== BPS.MAGIC) {
      throw new Error('Invalid BPS patch');
    }

    const patch = BPS.fromFile(patchFile);
    const outputFile = patch.apply(sourceFile, true);
    const outputBuffer = outputFile._u8array.buffer;
    self.postMessage({ outputBuffer }, [outputBuffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};