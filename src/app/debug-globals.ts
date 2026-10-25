/**
 * 掛到 window 上的除錯與相容入口（開發者主控台使用）。
 */
import { EmuWasm } from '../wasm/nes_wasm.js';
import { runtime } from './runtime';
import { startEmulation, stopEmulation } from '../backends/lifecycle';
import { exportSaveToFile, loadState, saveState } from '../saves/save-states';
import { showRomSelector } from '../session/game-loader';

// ===== 全域匯出 =====

declare global {
  interface Window {
    nes: EmuWasm | null;
    startEmulation: () => void;
    stopEmulation: () => void;
    saveState: (slot?: number) => boolean;
    loadState: (slot?: number) => boolean;
    exportSaveToFile: () => void;
    showRomSelector: () => Promise<void>;
    debugState: () => string;
    debugSpriteInfo: () => string;
    debugPpuColorState: () => string;
    debugScanlineLayers: (y: number, xs: number, xe: number) => string;
    debugTraceFrame: () => string;
    debugStepTrace: (count: number) => string;
    debugFrameTrace: () => string;
    debugRunFrames: (n: number) => string;
    debugRunInstructions: (n: number) => string;
    debugReadMem: (bank: number, addr: number) => string;
    debugRunThenTrace: (frames: number, traceCount: number) => string;
    debugReadRomRange: (bank: number, start: number, len: number) => string;
    debugRunUntilPcInRange: (bank: number, lo: number, hi: number, maxFrames: number, traceCount: number) => string;
  }
}


window.nes = null;

window.startEmulation = startEmulation;

window.stopEmulation = stopEmulation;

window.saveState = saveState;

window.loadState = loadState;

window.exportSaveToFile = exportSaveToFile;

window.showRomSelector = showRomSelector;


// Debug functions for SNES development
window.debugState = () => runtime.nes ? runtime.nes.debugState() : 'No emulator';

window.debugSpriteInfo = () => runtime.nes ? runtime.nes.debugSpriteInfo() : 'No emulator';

window.debugPpuColorState = () => runtime.nes ? (runtime.nes as any).debugPpuColorState?.() || 'Not available' : 'No emulator';

window.debugScanlineLayers = (y: number, xs: number, xe: number) => runtime.nes ? (runtime.nes as any).debugScanlineLayers?.(y, xs, xe) || 'Not available' : 'No emulator';

window.debugTraceFrame = () => runtime.nes ? (runtime.nes as any).debugTraceFrame?.() || 'Not available' : 'No emulator';

window.debugStepTrace = (n: number) => runtime.nes ? runtime.nes.debugStepTrace(n) : 'No emulator';

window.debugFrameTrace = () => runtime.nes ? runtime.nes.debugFrameTrace() : 'No emulator';

window.debugRunFrames = (n: number) => runtime.nes ? runtime.nes.debugRunFrames(n) : 'No emulator';

window.debugRunInstructions = (n: number) => runtime.nes ? runtime.nes.debugRunInstructions(n) : 'No emulator';

window.debugReadMem = (b: number, a: number, count: number = 16) => runtime.nes ? runtime.nes.debugReadMem(b, a, count) : 'No emulator';

window.debugRunThenTrace = (f: number, t: number) => runtime.nes ? runtime.nes.debugRunThenTrace(f, t) : 'No emulator';

window.debugReadRomRange = (b: number, s: number, l: number) => runtime.nes ? runtime.nes.debugReadRomRange(b, s, l) : 'No emulator';

window.debugRunUntilPcInRange = (b: number, lo: number, hi: number, mf: number, tc: number) => runtime.nes ? runtime.nes.debugRunUntilPcInRange(b, lo, hi, mf, tc) : 'No emulator';
