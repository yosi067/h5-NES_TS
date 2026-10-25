/**
 * 模擬執行的開始、暫停與畫面繪製（依目前後端分派）。
 */
import { runtime } from '../app/runtime';
import { drainWasmAudioToWorklet, resumeAudio, syncAudioWorkletState } from '../audio/audio-output';
import { isFbNeoActive, isMupenN64Active, isSnes9xActive } from './active';
import { snes9xBackend } from './emulatorjs-backend';
import { renderFbNeoFrame, startFbNeoEmulation } from './fbneo/fbneo-backend';
import { n64Controls } from './n64/n64-backend';
import { NES_OVERSCAN_TOP, renderGamePresentation } from './native/native-render';
import { captureNativeRewind, rewindHeld, runFastForwardNativeFrames, stepNativeRewind } from '../features/speed';

// ===== 模擬器控制 =====

/**
 * 開始模擬
 */
export function startEmulation(): void {
  resumeAudio();
  if (isSnes9xActive()) {
    runtime.isRunning = true;
    snes9xBackend?.resume();
    return;
  }
  if (isMupenN64Active()) {
    runtime.isRunning = true;
    syncAudioWorkletState();
    n64Controls?.resume();
    return;
  }

  if (isFbNeoActive()) {
    startFbNeoEmulation();
    return;
  }

  if (runtime.animationId !== null) {
    cancelAnimationFrame(runtime.animationId);
  }

  runtime.isRunning = true;
  syncAudioWorkletState();

  // 根據核心類型選擇幀率
  // NES NTSC: 60.0988 fps, Game Boy: 59.7275 fps, Game Gear: 59.92 fps (3579545 / 228 / 262)
  const coreType = runtime.nes?.getCoreType() || 'nes';
  const targetFps = coreType === 'gb' ? 59.7275 : coreType === 'gg' ? 59.92 : 60.0988;
  const TARGET_FRAME_TIME = 1000 / targetFps;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  let bootDiagFrameCount = 0;

  let blackFrameCount = 0;
  let lastBlackLogFrame = 0;
  let wasBlackScreen = false;

  const frameLoop = (currentTime: number): void => {
    if (!runtime.nes || !runtime.ctx || !runtime.imageData || !runtime.isRunning) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    accumulator += deltaTime;
    
    if (accumulator > TARGET_FRAME_TIME * 3) {
      accumulator = TARGET_FRAME_TIME;
    }

    while (accumulator >= TARGET_FRAME_TIME) {
      if (rewindHeld && stepNativeRewind()) {
        accumulator -= TARGET_FRAME_TIME;
        continue;
      }
      runtime.nes.frame();
      bootDiagFrameCount++;
      if (coreType === 'nes' && runtime.activeGamePresentation) runtime.activeGamePresentationFrame++;
      // Boot diagnostic: dump state at key frames to find when BRK crash happens
      if (coreType === 'snes' && (bootDiagFrameCount <= 10 ||
          bootDiagFrameCount === 15 || bootDiagFrameCount === 20 ||
          bootDiagFrameCount === 30 || bootDiagFrameCount === 60)) {
        try {
          const state = runtime.nes.debugState();
          console.log(`[BOOT DIAG] Frame ${bootDiagFrameCount}:\n${state}`);
        } catch(e) { /* ignore */ }
      }

      // SNES 黑屏自動偵測：採樣 framebuffer 中心區域
      if (coreType === 'snes' && bootDiagFrameCount > 60) {
        try {
          const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;
          const ptr = runtime.nes.getFrameBufferPtr();
          const len = runtime.nes.getFrameBufferLen();
          const fb = new Uint8Array(memory.buffer, ptr, len);
          // 採樣畫面中央 10 行 x 32 列
          let nonBlackPixels = 0;
          const totalSamples = 10 * 32;
          for (let row = 0; row < 10; row++) {
            const y = 60 + row * 10; // 從 y=60 開始每隔 10 行取樣
            for (let col = 0; col < 32; col++) {
              const x = 16 + col * 7; // 從 x=16 開始每隔 7 列取樣
              const i = (y * 256 + x) * 4;
              if (i + 3 < len && (fb[i] > 2 || fb[i+1] > 2 || fb[i+2] > 2)) {
                nonBlackPixels++;
              }
            }
          }
          const isBlack = nonBlackPixels < totalSamples * 0.05; // <5% 非黑像素
          if (isBlack) {
            blackFrameCount++;
            // 連續 30 幀以上黑屏且距上次 log 超過 120 幀才報告
            if (blackFrameCount >= 30 && (bootDiagFrameCount - lastBlackLogFrame) > 120) {
              lastBlackLogFrame = bootDiagFrameCount;
              const colorState = (runtime.nes as any).debugPpuColorState?.() || 'N/A';
              const state = runtime.nes.debugState();
              console.warn(`[BLACK SCREEN DETECT] Frame ${bootDiagFrameCount} (${blackFrameCount} consecutive black frames)\n${colorState}\n${state}`);
            }
            if (!wasBlackScreen) {
              wasBlackScreen = true;
              const colorState = (runtime.nes as any).debugPpuColorState?.() || 'N/A';
              console.warn(`[BLACK SCREEN START] Frame ${bootDiagFrameCount}\n${colorState}`);
            }
          } else {
            if (wasBlackScreen && blackFrameCount >= 10) {
              console.log(`[BLACK SCREEN END] Frame ${bootDiagFrameCount} (was black for ${blackFrameCount} frames)`);
            }
            blackFrameCount = 0;
            wasBlackScreen = false;
          }
        } catch(e) { /* ignore sampling errors */ }
      }

      drainWasmAudioToWorklet();
      captureNativeRewind();
      runFastForwardNativeFrames(coreType);

      // === SoM diagnostic: DSP voice + CGRAM + framebuffer color monitoring ===
      if (coreType === 'snes') {
        // DSP voice dump every ~300 frames for audio diagnosis
        if (bootDiagFrameCount % 300 === 1 && bootDiagFrameCount < 3000) {
          try {
            const dspInfo = (runtime.nes as any).debugDspVoices?.();
            if (dspInfo) console.log(`[DSP VOICES] Frame ${bootDiagFrameCount}:\n${dspInfo}`);
          } catch(e) { /* ignore */ }
        }

        // Detect abnormal framebuffer (green screen) every 60 frames
        if (bootDiagFrameCount % 60 === 0 && bootDiagFrameCount > 120) {
          try {
            const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;
            const ptr = runtime.nes.getFrameBufferPtr();
            const len = runtime.nes.getFrameBufferLen();
            const fb = new Uint8Array(memory.buffer, ptr, len);
            let rSum = 0, gSum = 0, bSum = 0, samples = 0;
            for (let row = 0; row < 8; row++) {
              const y = 30 + row * 25;
              for (let col = 0; col < 16; col++) {
                const x = 16 + col * 14;
                const i = (y * 256 + x) * 4;
                if (i + 3 < len) {
                  rSum += fb[i]; gSum += fb[i+1]; bSum += fb[i+2];
                  samples++;
                }
              }
            }
            if (samples > 0) {
              const avgR = rSum / samples, avgG = gSum / samples, avgB = bSum / samples;
              // Detect green-dominant screen (green > 1.5x red and green > 1.5x blue)
              if (avgG > 40 && avgG > avgR * 1.5 && avgG > avgB * 1.5) {
                const colorState = (runtime.nes as any).debugPpuColorState?.() || 'N/A';
                const cgram = (runtime.nes as any).debugCgram?.(32) || 'N/A';
                console.warn(`[GREEN SCREEN DETECT] Frame ${bootDiagFrameCount} avgRGB=(${avgR.toFixed(1)},${avgG.toFixed(1)},${avgB.toFixed(1)})\n${colorState}\nCGRAM[0-31]:\n${cgram}`);
              }
            }
          } catch(e) { /* ignore */ }
        }
      }

      accumulator -= TARGET_FRAME_TIME;
    }

    renderFrame();
    runtime.animationId = requestAnimationFrame(frameLoop);
  };

  runtime.animationId = requestAnimationFrame(frameLoop);
}


/**
 * 停止模擬
 */
export function stopEmulation(): void {
  runtime.isRunning = false;
  syncAudioWorkletState();
  if (isSnes9xActive()) {
    snes9xBackend?.pause();
    return;
  }
  if (isMupenN64Active()) {
    void n64Controls?.pause().catch((error) => console.warn('[N64] 暫停失敗:', error));
    return;
  }

  if (runtime.animationId !== null) {
    cancelAnimationFrame(runtime.animationId);
    runtime.animationId = null;
  }
}


/**
 * 渲染一幀到畫布
 */
export function renderFrame(): void {
  if (isMupenN64Active() || isSnes9xActive()) return;
  if (isFbNeoActive()) {
    renderFbNeoFrame();
    return;
  }
  if (!runtime.nes || !runtime.ctx || !runtime.imageData) return;

  // 重要：每次都重新取得 WASM memory 參考
  // 因為 WASM 記憶體增長後 buffer 會變為 detached
  const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;

  // 從 WASM 記憶體讀取 RGBA 畫面資料
  const ptr = runtime.nes.getFrameBufferPtr();
  const len = runtime.nes.getFrameBufferLen();
  const frameBuffer = new Uint8Array(memory.buffer, ptr, len);

  if (runtime.nes.getCoreType() === 'nes') {
    const rowStride = runtime.nes.getScreenWidth() * 4;
    const visibleStart = NES_OVERSCAN_TOP * rowStride;
    runtime.imageData.data.set(frameBuffer.subarray(visibleStart, visibleStart + runtime.imageData.data.length));
  } else {
    runtime.imageData.data.set(frameBuffer);
  }
  runtime.ctx.putImageData(runtime.imageData, 0, 0);
  renderGamePresentation();
  if (runtime.textOverlay && runtime.nes) {
    try { runtime.textOverlay.render(runtime.nes, NES_OVERSCAN_TOP); }
    catch (error) {
      console.error('[中文化] 顯示失敗，保留原遊戲繼續執行', error);
      runtime.textOverlay.dispose(); runtime.textOverlay = null;
      runtime.nes.enableTextObserver(false);
    }
  }
}
