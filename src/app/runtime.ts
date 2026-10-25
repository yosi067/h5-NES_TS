/**
 * 整個應用程式共用、會被多個模組讀寫的執行期狀態（目前的核心、畫布、遊戲與後端）。
 * 其他狀態由各自的模組持有；只有跨領域共同寫入的欄位才放這裡。
 */
import { NesTextOverlay } from '../game-profiles/text-overlay';
import { VerifiedMenuOverlay } from '../game-profiles/verified-menu-overlay';
import { EmuWasm } from '../wasm/nes_wasm.js';
import type { GamePresentation } from '../backends/native/game-profiles';

export interface Runtime {
  nes: EmuWasm | null;
  animationId: number | null;
  canvas: HTMLCanvasElement | null;
  wasmCanvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  imageData: ImageData | null;
  wasmInitPromise: Promise<void> | null;
  isRunning: boolean;
  currentRomFilename: string;
  activeBackend: 'wasm' | 'mupen64' | 'fbneo' | 'snes9x';
  currentN64RomData: ArrayBuffer | null;
  activeGamePresentation: GamePresentation | null;
  activeGamePresentationFrame: number;
  activeGamePresentationInputFrame: number | null;
  textOverlay: NesTextOverlay | VerifiedMenuOverlay | null;
  gameProfileTuningControls: { dispose(): void } | null;
  arcadeInputP1: number;
  arcadeInputP2: number;
  arcadeGamepadInputP1: number;
  arcadeGamepadInputP2: number;
  romSelector: HTMLElement | null;
  gameboyShell: HTMLElement | null;
  powerLed: HTMLElement | null;
  gameLoadAbortController: AbortController | null;
  currentGameTitle: string;
  gameSessionActive: boolean;
  currentCatalogFile: string;
}

export const runtime: Runtime = {
  nes: null,
  animationId: null,
  canvas: null,
  wasmCanvas: null,
  ctx: null,
  imageData: null,
  wasmInitPromise: null,
  isRunning: false,
  currentRomFilename: '',
  activeBackend: 'wasm',
  currentN64RomData: null,
  activeGamePresentation: null,
  activeGamePresentationFrame: 0,
  activeGamePresentationInputFrame: null,
  textOverlay: null,
  gameProfileTuningControls: null,
  arcadeInputP1: 0,
  arcadeInputP2: 0,
  arcadeGamepadInputP1: 0,
  arcadeGamepadInputP2: 0,
  romSelector: null,
  gameboyShell: null,
  powerLed: null,
  gameLoadAbortController: null,
  currentGameTitle: '',
  gameSessionActive: false,
  currentCatalogFile: '',
};
