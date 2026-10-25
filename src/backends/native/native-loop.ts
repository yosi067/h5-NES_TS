/**
 * 自製 WASM 核心（FC / GB / GG / SFC）的固定步長幀迴圈。
 */
import { runtime } from '../../app/runtime';
import { drainWasmAudioToWorklet, syncAudioWorkletState } from '../../audio/audio-output';
import { perfNow, recordEmulation, recordRender } from '../../features/perf-monitor';
import { captureNativeRewind, rewindHeld, runFastForwardNativeFrames, stepNativeRewind } from '../../features/speed';
import { renderFrame } from '../lifecycle';
import { createSnesFrameDiagnostics } from './snes-diagnostics';

/** 各主機的實機幀率：FC NTSC 60.0988、GB 59.7275、GG 59.92 (3579545 / 228 / 262)。 */
function targetFpsFor(coreType: string): number {
  return coreType === 'gb' ? 59.7275 : coreType === 'gg' ? 59.92 : 60.0988;
}


export function startNativeLoop(): void {
  if (runtime.animationId !== null) {
    cancelAnimationFrame(runtime.animationId);
  }

  runtime.isRunning = true;
  syncAudioWorkletState();

  const coreType = runtime.nes?.getCoreType() || 'nes';
  const TARGET_FRAME_TIME = 1000 / targetFpsFor(coreType);
  const diagnostics = createSnesFrameDiagnostics(coreType);
  let lastFrameTime = performance.now();
  let accumulator = 0;

  const frameLoop = (currentTime: number): void => {
    if (!runtime.nes || !runtime.ctx || !runtime.imageData || !runtime.isRunning) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    accumulator += deltaTime;

    if (accumulator > TARGET_FRAME_TIME * 3) {
      accumulator = TARGET_FRAME_TIME;
    }

    const emulationStart = perfNow();
    let emulatedFrames = 0;
    while (accumulator >= TARGET_FRAME_TIME) {
      if (rewindHeld && stepNativeRewind()) {
        accumulator -= TARGET_FRAME_TIME;
        continue;
      }
      runtime.nes.frame();
      emulatedFrames++;
      if (coreType === 'nes' && runtime.activeGamePresentation) runtime.activeGamePresentationFrame++;
      diagnostics?.afterFrame();

      drainWasmAudioToWorklet();
      captureNativeRewind();
      emulatedFrames += runFastForwardNativeFrames(coreType);

      accumulator -= TARGET_FRAME_TIME;
    }

    recordEmulation(emulationStart, emulatedFrames);

    const renderStart = perfNow();
    renderFrame();
    recordRender(renderStart);
    runtime.animationId = requestAnimationFrame(frameLoop);
  };

  runtime.animationId = requestAnimationFrame(frameLoop);
}
