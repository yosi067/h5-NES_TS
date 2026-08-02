import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'artifacts', 'snes-rom-manifest.json');
const wasmPath = path.join(root, 'src', 'wasm', 'nes_wasm_bg.wasm');
const outputPath = path.join(root, 'artifacts', 'snes-smoke-report.json');
const frameCount = Number(process.env.SNES_SMOKE_FRAMES ?? 600);
const sampleRate = 32_000;
const selectedFile = process.env.SNES_SMOKE_FILE ?? null;
const includeDebugState = process.env.SNES_SMOKE_DEBUG === '1';
const baselinePath = process.env.SNES_SMOKE_BASELINE ?? null;
const checkpointFrames = new Set(
  (process.env.SNES_SMOKE_CHECKPOINTS ?? '0,1,2,60,600')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value >= 0),
);

function hashBytes(hash, bytes) {
  hash.update(bytes);
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readMemory(emu, ptr, length, Type) {
  if (length === 0) return new Type();
  const memory = emu.getWasmMemory();
  return new Type(memory.buffer, ptr, length);
}

async function readCatalogRom(file) {
  const filePath = path.join(root, 'roms', file);
  if (path.extname(file).toLowerCase() !== '.zip') {
    try {
      return new Uint8Array(await readFile(filePath));
    } catch {
      return null;
    }
  }

  try {
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const member = Object.values(zip.files)
      .filter(entry => !entry.dir && ['.sfc', '.smc', '.fig'].includes(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name))[0];
    return member ? new Uint8Array(await member.async('uint8array')) : null;
  } catch {
    return null;
  }
}

function createResult(game, status, fields = {}) {
  return {
    name: game.name,
    file: game.file,
    enhancement: game.enhancement,
    nativeCoreSupported: game.nativeCoreSupported,
    status,
    ...fields,
  };
}

function captureCheckpoint(emu) {
  const checkpoint = JSON.parse(emu.debugCheckpoint());
  const framebuffer = readMemory(emu, emu.getFrameBufferPtr(), emu.getFrameBufferLen(), Uint8Array);
  const audio = readMemory(emu, emu.getAudioBufferPtr(), emu.getAudioBufferLen(), Float32Array);
  const audioBytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  const saveState = emu.exportSaveState();

  return {
    frame: checkpoint.frame,
    state: checkpoint,
    framebuffer: {
      bytes: framebuffer.byteLength,
      sha256: digestBytes(framebuffer),
    },
    audio: {
      samples: audio.length,
      nonZero: [...audio].filter(value => value !== 0).length,
      sha256: digestBytes(audioBytes),
    },
    saveState: {
      encodedBytes: saveState.length,
      sha256: digestBytes(Buffer.from(saveState, 'utf8')),
    },
  };
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const wasmBytes = await readFile(wasmPath);
initSync({ module: wasmBytes });

const results = [];
const games = selectedFile
  ? manifest.games.filter(game => game.file === selectedFile)
  : manifest.games;
if (selectedFile && games.length === 0) {
  throw new Error(`SNES_SMOKE_FILE did not match a manifest entry: ${selectedFile}`);
}
for (const game of games) {
  const rom = await readCatalogRom(game.file);
  if (!rom) {
    results.push(createResult(game, 'missing-rom'));
    continue;
  }

  const emu = new EmuWasm();
  try {
    const loaded = emu.loadSnesRom(rom);
    if (!loaded) {
      const status = game.nativeCoreSupported ? 'load-failed' : 'fallback-required';
      results.push(createResult(game, status, {
        romBytes: rom.length,
        coreType: emu.getCoreType(),
      }));
      continue;
    }

    if (!game.nativeCoreSupported) {
      results.push(createResult(game, 'unexpected-native-support', {
        romBytes: rom.length,
        coreType: emu.getCoreType(),
      }));
      continue;
    }

    emu.setAudioSampleRate(sampleRate);
    const checkpoints = [];
    const captureIfRequested = () => {
      const checkpoint = captureCheckpoint(emu);
      if (checkpointFrames.has(checkpoint.frame)) checkpoints.push(checkpoint);
    };
    captureIfRequested();
    emu.setButton(0, 3, true);
    emu.frame();
    emu.setButton(0, 3, false);
    captureIfRequested();

    const framebufferHash = createHash('sha256');
    const audioHash = createHash('sha256');
    let framebufferNonZero = 0;
    let framebufferChangedFrames = 0;
    let previousFramebuffer = null;
    let audioSamples = 0;
    let audioNonZero = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
      emu.frame();
      captureIfRequested();

      const framebuffer = readMemory(emu, emu.getFrameBufferPtr(), emu.getFrameBufferLen(), Uint8Array);
      hashBytes(framebufferHash, framebuffer);
      const framebufferSnapshot = Buffer.from(framebuffer);
      if (previousFramebuffer && !previousFramebuffer.equals(framebufferSnapshot)) {
        framebufferChangedFrames += 1;
      }
      previousFramebuffer = framebufferSnapshot;
      if (frame === frameCount - 1) {
        for (const value of framebuffer) {
          if (value !== 0) framebufferNonZero += 1;
        }
      }

      const audioLength = emu.getAudioBufferLen();
      const audio = readMemory(emu, emu.getAudioBufferPtr(), audioLength, Float32Array);
      hashBytes(audioHash, new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
      for (const value of audio) {
        if (value !== 0) audioNonZero += 1;
      }
      audioSamples += audioLength;
      emu.consumeAudioSamples();
    }

    const state = emu.exportSaveState();
    const debugAtCheckpoint = includeDebugState ? emu.debugState() : undefined;
    const stateBefore = emu.getFrameBufferLen() > 0
      ? Buffer.from(readMemory(emu, emu.getFrameBufferPtr(), emu.getFrameBufferLen(), Uint8Array))
      : Buffer.alloc(0);
    emu.frame();
    const stateAdvanced = Buffer.from(readMemory(emu, emu.getFrameBufferPtr(), emu.getFrameBufferLen(), Uint8Array));
    const imported = emu.importSaveState(state);
    const stateExact = imported && emu.exportSaveState() === state;
    const debugAfterImport = includeDebugState ? emu.debugState() : undefined;
    emu.frame();
    const stateRestored = Buffer.from(readMemory(emu, emu.getFrameBufferPtr(), emu.getFrameBufferLen(), Uint8Array));
    const debugAfterReplay = includeDebugState ? emu.debugState() : undefined;
    const sram = emu.exportSram();
    const sramRoundTrip = sram.length === 0 ? true : emu.importSram(sram);
    const debugText = [debugAtCheckpoint, debugAfterImport, debugAfterReplay]
      .filter(Boolean)
      .join('\n');
    const sa1Evidence = game.enhancement === 'SA-1' ? {
      executedAtCheckpoint: checkpoints.some(checkpoint => (
        checkpoint.state.sa1?.running
        && (checkpoint.state.sa1.pc !== 0 || checkpoint.state.sa1.pb !== 0)
      )),
      dmaEvents: (debugText.match(/SA1DMASTART/g) ?? []).length,
      timerIrqEvents: (debugText.match(/SA1TIMERIRQ/g) ?? []).length,
      interruptEvents: (debugText.match(/SA1(?:IRQ|NMI)/g) ?? []).length,
      bmapSnapshots: new Set(
        checkpoints
          .map(checkpoint => JSON.stringify(checkpoint.state.sa1?.bmaps ?? [])),
      ).size,
    } : null;
    const acceptanceWarnings = [];
    if (framebufferNonZero === 0) acceptanceWarnings.push('zero-framebuffer');
    if (audioNonZero === 0) acceptanceWarnings.push('zero-audio');
    if (framebufferChangedFrames === 0) acceptanceWarnings.push('static-framebuffer');
    if (debugText.includes('BRK CRASH')) acceptanceWarnings.push('brk');
    if (/CPU:.*stopped=true/.test(debugText)) acceptanceWarnings.push('cpu-stopped');
    if (/PPU: force_blank=true/.test(debugText)) acceptanceWarnings.push('persistent-force-blank');
    if (game.enhancement === 'SA-1' && !sa1Evidence.executedAtCheckpoint) {
      acceptanceWarnings.push('sa1-no-execution');
    }
    const acceptancePassed = acceptanceWarnings.length === 0;

    results.push(createResult(game, acceptancePassed ? 'ok' : 'acceptance-warning', {
      romBytes: rom.length,
      coreType: emu.getCoreType(),
      screen: `${emu.getScreenWidth()}x${emu.getScreenHeight()}`,
      frameCount,
      framebufferBytes: emu.getFrameBufferLen(),
      framebufferHash: framebufferHash.digest('hex'),
      framebufferNonZero,
      framebufferChangedFrames,
      audioSamples,
      audioNonZero,
      audioHash: audioHash.digest('hex'),
      saveStateBytes: Buffer.byteLength(state),
      saveStateImported: imported,
      saveStateExact: stateExact,
      frameChangedAfterCheckpoint: !stateBefore.equals(stateAdvanced),
      saveStateRoundTrip: imported && stateExact && stateAdvanced.equals(stateRestored),
      acceptance: {
        passed: acceptancePassed,
        warnings: acceptanceWarnings,
      },
      ...(sa1Evidence ? { sa1Evidence } : {}),
      ...(includeDebugState ? { debugAtCheckpoint, debugAfterImport, debugAfterReplay } : {}),
      sramBytes: sram.length,
      sramRoundTrip,
      checkpoints,
    }));
  } catch (error) {
    results.push(createResult(game, 'exception', {
      romBytes: rom.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    emu.free();
  }
}

const statusCounts = Object.fromEntries(
  [...new Set(results.map(result => result.status))].sort().map(status => [
    status,
    results.filter(result => result.status === status).length,
  ]),
);
const report = {
  frameCount,
  sampleRate,
  checkpointSchema: 2,
  checkpointFrames: [...checkpointFrames].sort((left, right) => left - right),
  manifestCount: manifest.count,
  statusCounts,
  results,
};

if (baselinePath) {
  const baseline = JSON.parse(await readFile(path.resolve(root, baselinePath), 'utf8'));
  const comparable = result => ({
    file: result.file,
    status: result.status,
    framebufferHash: result.framebufferHash ?? null,
    audioHash: result.audioHash ?? null,
    saveStateRoundTrip: result.saveStateRoundTrip ?? null,
    sramRoundTrip: result.sramRoundTrip ?? null,
    sa1Evidence: result.sa1Evidence ?? null,
    checkpoints: result.checkpoints ?? [],
  });
  const expected = JSON.stringify((baseline.results ?? []).map(comparable));
  const actual = JSON.stringify(results.map(comparable));
  report.determinism = {
    baseline: path.relative(root, path.resolve(root, baselinePath)),
    passed: expected === actual,
  };
  if (!report.determinism.passed) {
    report.determinism.mismatch = 'checkpoint-or-output-hash-difference';
  }
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outputPath)} (${results.length} ROMs)`);
console.log(JSON.stringify(statusCounts, null, 2));

if (results.some(result => ['missing-rom', 'load-failed', 'unexpected-native-support', 'exception'].includes(result.status))
  || report.determinism?.passed === false) {
  process.exitCode = 1;
}