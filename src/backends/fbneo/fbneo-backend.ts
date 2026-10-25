/**
 * FBNeo 街機後端：載入 ROM set、幀迴圈與畫面輸出。
 */
import { extractFbNeoRomSet, FbNeoArcadeCore, type FbNeoRomSet } from '../../arcade/fbneo-core';
import { runtime } from '../../app/runtime';
import { isAbortError, nextAnimationFrameOrTimeout, throwIfSignalAborted } from '../../app/async';
import { clearAudioQueue, enqueueAudioSamples, resumeAudio, syncAudioWorkletState } from '../../audio/audio-output';
import { isFbNeoActive } from '../active';
import { stopSnes9xBackend } from '../emulatorjs/emulatorjs-backend';
import { FBNEO_ROTATIONS } from './fbneo-games';
import type { ArcadeRotation } from './fbneo-games';
import { renderFrame, startEmulation, stopEmulation } from '../lifecycle';
import { stopN64Backend } from '../n64/n64-backend';
import { resetWasmCore } from '../native/native-core';
import { perfNow, recordEmulation, recordRender } from '../../features/perf-monitor';
import { captureFbNeoRewind, getSpeedMultiplier, rewindHeld, stepFbNeoRewind } from '../../features/speed';
import { mergeArcadeInputSources, pollArcadeGamepads } from '../../input/arcade-input';
import { hideRomSelector } from '../../session/game-loader';
import { onGameStarted } from '../../session/game-session';
import { updateArcadeButtonCount, updateControllerLayout } from '../../ui/controller-layout';
import { showAppAlert, showToast } from '../../ui/dialogs';
import { updateGameLoading } from '../../ui/loading-overlay';

export let fbneoCore: FbNeoArcadeCore | null = null;

let currentFbNeoRomSet: FbNeoRomSet | null = null;

let arcadeSourceWidth = 320;

let arcadeSourceHeight = 240;

export let arcadeRotation: ArcadeRotation = 'none';


export function stopFbNeoBackend(): void {
  fbneoCore = null;
  currentFbNeoRomSet = null;
  runtime.arcadeInputP1 = 0;
  runtime.arcadeInputP2 = 0;
  runtime.arcadeGamepadInputP1 = 0;
  runtime.arcadeGamepadInputP2 = 0;
  if (runtime.activeBackend === 'fbneo') runtime.activeBackend = 'wasm';
}


export async function startFbNeoGame(
  archiveName: string,
  zipData: ArrayBuffer,
  loadingSequence: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!runtime.canvas || !runtime.ctx) return;
  let coreInstance: FbNeoArcadeCore | null = null;

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  runtime.activeBackend = 'fbneo';
  runtime.arcadeInputP1 = 0;
  runtime.arcadeInputP2 = 0;
  runtime.arcadeGamepadInputP1 = 0;
  runtime.arcadeGamepadInputP2 = 0;
  clearAudioQueue();

  try {
    throwIfSignalAborted(signal);
    coreInstance = new FbNeoArcadeCore();
    fbneoCore = coreInstance;
    const romSet = await extractFbNeoRomSet(archiveName, zipData);
    throwIfSignalAborted(signal);
    currentFbNeoRomSet = romSet;
    runtime.currentRomFilename = archiveName;

    const validity = await coreInstance.checkRomValidity(romSet);
    throwIfSignalAborted(signal);
    if (!validity.ok) {
      runtime.activeBackend = 'wasm';
      console.error(`[FBNeo] ROM 校驗失敗:\n${validity.log}`);
      await showAppAlert(`FBNeo 無法識別 ${archiveName}\n\n${validity.log}`);
      return;
    }

    const loaded = await coreInstance.loadGame(romSet.gameName);
    throwIfSignalAborted(signal);
    if (!loaded) {
      runtime.activeBackend = 'wasm';
      const log = coreInstance.getLog();
      await showAppAlert(`FBNeo 載入 ${archiveName} 失敗\n\n${log}`);
      return;
    }

    const { width, height } = coreInstance.getResolution();
    arcadeSourceWidth = width;
    arcadeSourceHeight = height;
    arcadeRotation = FBNEO_ROTATIONS[romSet.gameName] ?? 'none';
    const canvasWidth = arcadeRotation === 'none' ? width : height;
    const canvasHeight = arcadeRotation === 'none' ? height : width;
    runtime.canvas.width = canvasWidth;
    runtime.canvas.height = canvasHeight;
    runtime.canvas.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
    runtime.ctx.imageSmoothingEnabled = false;
    runtime.imageData = runtime.ctx.createImageData(canvasWidth, canvasHeight);

    hideRomSelector();
    updateControllerLayout();
    runtime.powerLed?.classList.add('on');
    updateGameLoading(loadingSequence, '正在準備遊戲畫面…');
    await warmUpFbNeoVideo(coreInstance, signal);
    throwIfSignalAborted(signal);
    updateArcadeButtonCount(coreInstance.getFireButtonCount());
    renderFbNeoFrame();
    await nextAnimationFrameOrTimeout();
    console.log(`[FBNeo] ${romSet.gameName} loaded: ${width}x${height}${arcadeRotation === 'none' ? '' : ` rotated-${arcadeRotation}`}`);
    showToast(`FBNeo: ${romSet.gameName} OK`);
    startEmulation();
    onGameStarted();
  } catch (error) {
    if (fbneoCore === coreInstance) {
      runtime.activeBackend = 'wasm';
      stopFbNeoBackend();
    }
    if (isAbortError(error)) return;
    console.error('[FBNeo] 啟動失敗:', error);
    await showAppAlert(error instanceof Error ? error.message : 'FBNeo 啟動失敗');
  }
}


export function startFbNeoEmulation(): void {
  if (!fbneoCore || !runtime.ctx || !runtime.imageData) return;
  if (runtime.animationId !== null) {
    cancelAnimationFrame(runtime.animationId);
  }

  resumeAudio();
  runtime.isRunning = true;
  syncAudioWorkletState();
  const targetFrameTime = 1000 / 60;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  let guardedFrames = 180;

  const frameLoop = (currentTime: number): void => {
    if (!fbneoCore || !runtime.ctx || !runtime.imageData || !runtime.isRunning || !isFbNeoActive()) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    accumulator = Math.min(accumulator + deltaTime, targetFrameTime * 3);

    const emulationStart = perfNow();
    let emulatedFrames = 0;
    while (accumulator >= targetFrameTime) {
      if (rewindHeld && stepFbNeoRewind()) {
        accumulator -= targetFrameTime;
        continue;
      }
      pollArcadeGamepads();
      const player1 = mergeArcadeInputSources(runtime.arcadeInputP1, runtime.arcadeGamepadInputP1);
      const player2 = mergeArcadeInputSources(runtime.arcadeInputP2, runtime.arcadeGamepadInputP2);
      fbneoCore.stepFrame(player1, player2);
      emulatedFrames++;
      enqueueAudioSamples(fbneoCore.consumeAudioSamples());
      captureFbNeoRewind();
      // 快轉：多跑的幀只丟棄聲音，避免音訊佇列爆量。
      for (let extra = getSpeedMultiplier() - 1; extra > 0; extra--) {
        fbneoCore.stepFrame(player1, player2);
        emulatedFrames++;
        fbneoCore.consumeAudioSamples();
        captureFbNeoRewind();
      }
      accumulator -= targetFrameTime;
    }

    recordEmulation(emulationStart, emulatedFrames);

    const renderStart = perfNow();
    const frameBuffer = fbneoCore.getFrameBufferView();
    if (guardedFrames <= 0 || isPresentableFbNeoFrame(frameBuffer)) {
      renderFrame();
    }
    recordRender(renderStart);
    if (guardedFrames > 0) guardedFrames--;
    runtime.animationId = requestAnimationFrame(frameLoop);
  };

  runtime.animationId = requestAnimationFrame(frameLoop);
}


function isPresentableFbNeoFrame(frameBuffer: Uint8Array): boolean {
  let sampledPixels = 0;
  let nonBlackPixels = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  for (let offset = 0; offset < frameBuffer.length; offset += 64) {
    const red = frameBuffer[offset];
    const green = frameBuffer[offset + 1];
    const blue = frameBuffer[offset + 2];
    sampledPixels++;
    if (red > 4 || green > 4 || blue > 4) nonBlackPixels++;
    redTotal += red;
    greenTotal += green;
    blueTotal += blue;
  }

  if (sampledPixels === 0 || nonBlackPixels < sampledPixels * 0.02) return false;
  const averageRed = redTotal / sampledPixels;
  const averageGreen = greenTotal / sampledPixels;
  const averageBlue = blueTotal / sampledPixels;
  const greenFlash = averageGreen > 36
    && averageGreen > averageRed * 1.55
    && averageGreen > averageBlue * 1.55;
  return !greenFlash;
}


async function warmUpFbNeoVideo(core: FbNeoArcadeCore, signal?: AbortSignal): Promise<void> {
  const deadline = performance.now() + 4_000;
  let stableSamples = 0;
  for (let frame = 0; frame < 900; frame += 6) {
    throwIfSignalAborted(signal);
    for (let step = 0; step < 6; step++) core.stepFrame(0, 0);
    core.consumeAudioSamples();

    if (frame >= 480 && isPresentableFbNeoFrame(core.getFrameBufferView())) {
      stableSamples++;
      if (stableSamples >= 5) return;
    } else {
      stableSamples = 0;
    }

    if (performance.now() >= deadline) return;
    await nextAnimationFrameOrTimeout(50);
  }
}


export function renderFbNeoFrame(): void {
  if (!fbneoCore || !runtime.ctx || !runtime.imageData) return;
  const frameBuffer = fbneoCore.getFrameBufferView();
  if (arcadeRotation !== 'none') {
    const output = runtime.imageData.data;
    for (let sourceY = 0; sourceY < arcadeSourceHeight; sourceY++) {
      for (let sourceX = 0; sourceX < arcadeSourceWidth; sourceX++) {
        const sourceIndex = (sourceY * arcadeSourceWidth + sourceX) * 4;
        const destX = arcadeRotation === 'left' ? sourceY : arcadeSourceHeight - 1 - sourceY;
        const destY = arcadeRotation === 'left' ? arcadeSourceWidth - 1 - sourceX : sourceX;
        const destIndex = (destY * arcadeSourceHeight + destX) * 4;
        output[destIndex] = frameBuffer[sourceIndex];
        output[destIndex + 1] = frameBuffer[sourceIndex + 1];
        output[destIndex + 2] = frameBuffer[sourceIndex + 2];
        output[destIndex + 3] = frameBuffer[sourceIndex + 3];
      }
    }
  } else {
    runtime.imageData.data.set(frameBuffer);
  }
  runtime.ctx.putImageData(runtime.imageData, 0, 0);
}
