/**
 * 自製 SNES 核心的開發診斷（開機狀態、黑屏／綠屏偵測、DSP 聲道、讀檔後 PPU 狀態）。
 *
 * 只在開發模式或網址帶 ?snesDiag=1 時啟用；正式版玩家不會跑這些取樣，也不會洗主控台。
 */
import { runtime } from '../../app/runtime';

export function snesDiagnosticsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('snesDiag');
  } catch {
    return false;
  }
}


export interface SnesFrameDiagnostics {
  /** 每跑完一幀模擬呼叫一次。 */
  afterFrame(): void;
}


/** 回傳 null 代表不需要診斷（非 SNES 核心或未啟用）。 */
export function createSnesFrameDiagnostics(coreType: string): SnesFrameDiagnostics | null {
  if (coreType !== 'snes' || !snesDiagnosticsEnabled()) return null;

  let frameCount = 0;
  let blackFrameCount = 0;
  let lastBlackLogFrame = 0;
  let wasBlackScreen = false;

  const readFrameBuffer = (): { fb: Uint8Array; len: number } | null => {
    if (!runtime.nes) return null;
    const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;
    const ptr = runtime.nes.getFrameBufferPtr();
    const len = runtime.nes.getFrameBufferLen();
    return { fb: new Uint8Array(memory.buffer, ptr, len), len };
  };

  const logBootState = (): void => {
    // 在關鍵幀輸出狀態，找出開機時 BRK 當機發生的位置
    if (frameCount <= 10 || frameCount === 15 || frameCount === 20 || frameCount === 30 || frameCount === 60) {
      try {
        console.log(`[BOOT DIAG] Frame ${frameCount}:\n${runtime.nes!.debugState()}`);
      } catch { /* ignore */ }
    }
  };

  const detectBlackScreen = (): void => {
    if (frameCount <= 60) return;
    try {
      const buffer = readFrameBuffer();
      if (!buffer) return;
      const { fb, len } = buffer;
      // 採樣畫面中央 10 行 x 32 列
      let nonBlackPixels = 0;
      const totalSamples = 10 * 32;
      for (let row = 0; row < 10; row++) {
        const y = 60 + row * 10;
        for (let col = 0; col < 32; col++) {
          const x = 16 + col * 7;
          const i = (y * 256 + x) * 4;
          if (i + 3 < len && (fb[i] > 2 || fb[i + 1] > 2 || fb[i + 2] > 2)) nonBlackPixels++;
        }
      }
      const nes = runtime.nes as any;
      if (nonBlackPixels < totalSamples * 0.05) {
        blackFrameCount++;
        // 連續 30 幀以上黑屏且距上次 log 超過 120 幀才報告
        if (blackFrameCount >= 30 && (frameCount - lastBlackLogFrame) > 120) {
          lastBlackLogFrame = frameCount;
          const colorState = nes.debugPpuColorState?.() || 'N/A';
          console.warn(`[BLACK SCREEN DETECT] Frame ${frameCount} (${blackFrameCount} consecutive black frames)\n${colorState}\n${nes.debugState()}`);
        }
        if (!wasBlackScreen) {
          wasBlackScreen = true;
          console.warn(`[BLACK SCREEN START] Frame ${frameCount}\n${nes.debugPpuColorState?.() || 'N/A'}`);
        }
      } else {
        if (wasBlackScreen && blackFrameCount >= 10) {
          console.log(`[BLACK SCREEN END] Frame ${frameCount} (was black for ${blackFrameCount} frames)`);
        }
        blackFrameCount = 0;
        wasBlackScreen = false;
      }
    } catch { /* ignore sampling errors */ }
  };

  const logDspVoices = (): void => {
    if (frameCount % 300 !== 1 || frameCount >= 3000) return;
    try {
      const dspInfo = (runtime.nes as any).debugDspVoices?.();
      if (dspInfo) console.log(`[DSP VOICES] Frame ${frameCount}:\n${dspInfo}`);
    } catch { /* ignore */ }
  };

  const detectGreenScreen = (): void => {
    if (frameCount % 60 !== 0 || frameCount <= 120) return;
    try {
      const buffer = readFrameBuffer();
      if (!buffer) return;
      const { fb, len } = buffer;
      let rSum = 0, gSum = 0, bSum = 0, samples = 0;
      for (let row = 0; row < 8; row++) {
        const y = 30 + row * 25;
        for (let col = 0; col < 16; col++) {
          const x = 16 + col * 14;
          const i = (y * 256 + x) * 4;
          if (i + 3 < len) {
            rSum += fb[i]; gSum += fb[i + 1]; bSum += fb[i + 2];
            samples++;
          }
        }
      }
      if (samples === 0) return;
      const avgR = rSum / samples, avgG = gSum / samples, avgB = bSum / samples;
      if (avgG > 40 && avgG > avgR * 1.5 && avgG > avgB * 1.5) {
        const nes = runtime.nes as any;
        const colorState = nes.debugPpuColorState?.() || 'N/A';
        const cgram = nes.debugCgram?.(32) || 'N/A';
        console.warn(`[GREEN SCREEN DETECT] Frame ${frameCount} avgRGB=(${avgR.toFixed(1)},${avgG.toFixed(1)},${avgB.toFixed(1)})\n${colorState}\nCGRAM[0-31]:\n${cgram}`);
      }
    } catch { /* ignore */ }
  };

  return {
    afterFrame() {
      if (!runtime.nes) return;
      frameCount++;
      logBootState();
      detectBlackScreen();
      logDspVoices();
      detectGreenScreen();
    },
  };
}


/** 讀檔後輸出 PPU／DSP 狀態，用來追查讀檔後畫面透明或無聲。 */
export function logSnesLoadStateDiagnostics(): void {
  if (!snesDiagnosticsEnabled() || !runtime.nes) return;
  try {
    const nes = runtime.nes as any;
    const colorState = nes.debugPpuColorState?.() || 'N/A';
    const dspInfo = nes.debugDspVoices?.() || 'N/A';
    const cgram = nes.debugCgram?.(32) || 'N/A';
    console.log(`[LOAD STATE DIAG] PPU Color:\n${colorState}\nDSP:\n${dspInfo}\nCGRAM[0-31]:\n${cgram}`);
  } catch { /* ignore */ }
}
