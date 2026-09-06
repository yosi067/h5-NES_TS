/**
 * H5-NES 模擬器主程式入口（WASM 版本）
 * 
 * 功能：
 * - GameBoy 風格 UI（完整保留）
 * - ROM 選擇器
 * - 虛擬控制器 (手機版)
 * - RWD 響應式設計
 * - 使用 Rust/WASM 核心取代 TypeScript 硬體模擬
 */

import init, { EmuWasm } from './wasm/nes_wasm.js';
import JSZip from 'jszip';
import { applyBpsPatch } from './game-profiles/bps';
import { CT2_SOURCE_HASHES, validateLocalizationAssets, type LocalizationAssets } from './game-profiles/localization';
import { NesTextOverlay } from './game-profiles/text-overlay';
import { getRomMagazineMeta } from './data/rom-metadata';
import type { EmulatorControls } from 'mupen64plus-web';
import {
  FbNeoArcadeCore,
  extractFbNeoRomSet,
  type FbNeoRomSet,
} from './arcade/fbneo-core';
import {
  applyN64PerformanceProfile,
  selectN64PerformanceProfile,
  type N64PerformanceProfile,
} from './n64/performance';
import {
  createN64BenchmarkSession,
  resolveN64BenchmarkConfig,
  type N64BenchmarkSession,
} from './n64/benchmark';
import {
  getN64RuntimeAssetUrl,
  getN64RuntimeImportUrl,
  shouldRetryN64WithNpm,
} from './n64/runtime-assets';
import { getRomAssetUrl, hasN64RomMagic } from './rom-assets';
import { createN64Telemetry } from './n64/telemetry';
import { readBinaryState, writeBinaryState } from './storage/binary-state-store';
import { getTouchContactTargetIds } from './ui/touch-contact';
import { getBridgedDiagonal, quantizeVirtualStick } from './ui/virtual-stick';
import {
  shouldUseDigitalArcadeDpad,
  shouldUseSnes9x,
  startSnes9xBackend,
  type EmulatorJsCore,
  type Snes9xBackend,
} from './snes/snes9x-backend';

type N64EmulatorControls = EmulatorControls & {
  resumeAudio?: () => Promise<void>;
  configureAudioWorklet?: (workletUrl: string) => Promise<boolean>;
};

// ===== 型別定義 =====

interface RomInfo {
  name: string;
  file: string;
  system?: string;  // 'nes' | 'gb' | 'gg' | 'sms' | 'genesis' | 'snes' | 'n64' (可選，自動偵測)
  cover?: string;
  description?: string;
  region?: string;
  variant?: string;
  cartridge?: boolean;
  coverSource?: string;
  descriptionSource?: string;
  verified?: boolean;
}

interface RomListResponse {
  roms: RomInfo[];
}

interface GameMetadataResponse {
  version: number;
  games: Record<string, Partial<RomInfo>>;
}

type SystemKey = 'nes' | 'gb' | 'gg' | 'sms' | 'genesis' | 'snes' | 'n64' | 'arcade';

interface MachineInfo {
  key: SystemKey;
  title: string;
  label: string;
  artClass: string;
  artFile: string;
  section: string;
  issue: string;
  year: string;
  page: string;
}

interface KeyboardBindingView {
  action: string;
  keys: string[];
}

const FBNEO_SUPPORTED_GAMES = [
  'ddonpach',
  'ddp2100',
  'garou',
  'knights',
  'kof2000',
  'kof2001',
  'kof2003',
  'kof94',
  'kof95',
  'kof96',
  'kof97',
  'kof98',
  'ms5pcb',
  'samsho2',
  'samsho4',
  'samshoh',
  'mslug',
  'mslug2t',
  'mslug3',
  'mslug4',
  'mslug3b6',
  'neocup98',
  'kof2002',
  'rbffspec',
  'samsh5sp',
  'samsho5',
  'sengoku3',
  'sonicwi3',
  'svc',
  'pacman',
  'tetris',
  'outrun',
  'shinobi',
  'strider',
  'raiden',
  'wof',
  'ffight',
  'dino',
  'captcomm',
  'punisher',
  'tmnt',
  'simpsons',
  'ssriders',
  'snowbros',
  'bublbobl',
  'pang',
  'sf2',
  'sf2rb2',
  '1943',
  'area88',
  'rtype',
  'parodius',
] as const;

type FbNeoGameName = typeof FBNEO_SUPPORTED_GAMES[number];

type ArcadeRotation = 'none' | 'left' | 'right';

const FBNEO_ROTATIONS: Partial<Record<FbNeoGameName, Exclude<ArcadeRotation, 'none'>>> = {
  ddonpach: 'left',
  ddp2100: 'left',
  pacman: 'right',
  raiden: 'left',
  '1943': 'left',
};

const ArcadeInputBit = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  ButtonA: 1 << 4,
  ButtonB: 1 << 5,
  ButtonC: 1 << 6,
  ButtonD: 1 << 7,
  Coin: 1 << 8,
  Start: 1 << 9,
  ButtonE: 1 << 10,
  ButtonF: 1 << 11,
} as const;

function getFbNeoGameName(filename: string): FbNeoGameName | null {
  const baseName = filename.split(/[\\/]/).pop()?.toLowerCase().replace(/\.zip$/, '') ?? '';
  return (FBNEO_SUPPORTED_GAMES as readonly string[]).includes(baseName) ? baseName as FbNeoGameName : null;
}

const MACHINES: MachineInfo[] = [
  { key: 'nes', title: 'FC/NES', label: '經典中的經典，傳說的紅白機。', artClass: 'nes', artFile: 'nes.png', section: 'FEATURE', issue: 'VOL.01', year: '1983', page: '012' },
  { key: 'gb', title: 'Game Boy', label: '最想帶去學校還有躲在棉被裡玩的好東西。', artClass: 'gb', artFile: 'gb.png', section: 'SPECIAL', issue: 'NO.08', year: '1989', page: '024' },
  { key: 'snes', title: 'SFC 超任', label: '無數經典的超任，是你爸媽最想藏起來不讓你碰的東西。', artClass: 'snes', artFile: 'snes.png', section: 'CLASSIC', issue: 'VOL.16', year: '1990', page: '036' },
  { key: 'arcade', title: '大型電玩', label: '雜貨店外面那些有搖桿的街機，要投錢幣的那種。', artClass: 'arcade', artFile: 'arcade.png', section: 'ARCADE', issue: 'NO.88', year: '1992', page: '048' },
  { key: 'gg', title: 'Game Gear', label: '經典的彩色掌機還可以看電視，一次吃你六顆鹼性電池的小怪物。', artClass: 'gg', artFile: 'gg.png', section: 'RETRO', issue: 'VOL.06', year: '1990', page: '060' },
  { key: 'genesis', title: 'Mega Drive', label: '電動店總是會放這台讓音速小子跑一整天。', artClass: 'md', artFile: 'md.png', section: 'HARDWARE', issue: 'MD.88', year: '1988', page: '072' },
  { key: 'n64', title: 'Nintendo 64', label: '劃時代的 3D 主機，不過手機還跑不動，建議先在電腦上玩。', artClass: 'n64', artFile: 'n64.png', section: 'NEW', issue: 'VOL.64', year: '1996', page: '084' },
];

const LOBBY_MARIO_ROM_FILE = '超级玛丽.nes';

function getPublicAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

// 控制器按鈕編號（與 Rust 端一致 - NES）
const ControllerButton = {
  A: 0,
  B: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
} as const;
type ControllerButton = typeof ControllerButton[keyof typeof ControllerButton];

// SNES 控制器按鈕編號（與 Rust controller.rs 一致）
const SnesButton = {
  B: 0,
  Y: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const;

// 判斷當前是否為 SNES 核心
function isSnesCore(): boolean {
  return (activeBackend === 'snes9x' && emulatorJsCore === 'snes') || nes?.getCoreType() === 'snes';
}

function isGenesisCore(): boolean {
  return activeBackend === 'snes9x' && emulatorJsCore === 'genesis';
}

function usesSixButtonController(): boolean {
  return isSnesCore() || isGenesisCore();
}

// ===== 全域變數 =====

let nes: EmuWasm | null = null;
let animationId: number | null = null;
let canvas: HTMLCanvasElement | null = null;
let wasmCanvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let audioContext: AudioContext | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let wasmInitPromise: Promise<void> | null = null;
let isRunning: boolean = false;
let currentRomFilename: string = '';
let activeBackend: 'wasm' | 'mupen64' | 'fbneo' | 'snes9x' = 'wasm';
let snes9xBackend: Snes9xBackend | null = null;
let emulatorJsCore: EmulatorJsCore | null = null;
let n64Controls: N64EmulatorControls | null = null;
let currentN64RomData: ArrayBuffer | null = null;
let n64PerformanceProfile: N64PerformanceProfile = selectN64PerformanceProfile();
let n64BenchmarkSession: N64BenchmarkSession | null = null;
let removeN64BenchmarkDiagnostics: (() => void) | null = null;

interface GameProfileIndex {
  schemaVersion: number;
  profiles: Record<string, string>;
}

interface GamePresentationRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

interface GamePresentationLabel {
  text: string;
  x: number;
  y: number;
  size: number;
  align?: CanvasTextAlign;
  color?: string;
}

interface GamePresentationRegionGuard {
  x: number;
  y: number;
  width: number;
  height: number;
  hash: string;
  sampleStep?: number;
}

interface GamePresentationCue {
  id: string;
  trigger: {
    type: 'frame' | 'afterInput';
    from: number;
    to?: number;
  };
  regionGuard?: GamePresentationRegionGuard;
  masks: GamePresentationRect[];
  labels: GamePresentationLabel[];
}

interface GamePresentation {
  schemaVersion: number;
  profileId: string;
  inputArmFrame: number;
  cues: GamePresentationCue[];
}

interface PreparedGameProfile {
  romBytes: Uint8Array;
  runtimeJson: string | null;
  presentation: GamePresentation | null;
}

interface GmodManifestV2 {
  format: 'gmod';
  formatVersion: 2;
  profileId: string;
  platform: 'nes';
  source: { sha256: string; sha256Aliases?: string[] };
  target: { sha256: string };
  patch: { format: 'bps'; file: string };
  runtime?: { file: string };
  presentation?: { file: string };
}

let gameProfileIndexPromise: Promise<GameProfileIndex> | null = null;
let activeGamePresentation: GamePresentation | null = null;
let activeGamePresentationFrame = 0;
let activeGamePresentationInputFrame: number | null = null;
let textOverlay: NesTextOverlay | null = null;

async function loadGameProfileIndex(signal?: AbortSignal): Promise<GameProfileIndex> {
  if (!gameProfileIndexPromise) {
    const url = new URL('game-profiles/index.json', window.location.href);
    gameProfileIndexPromise = fetch(url, { signal })
      .then(async response => {
        if (!response.ok) throw new Error(`profile index HTTP ${response.status}`);
        const index = await response.json() as GameProfileIndex;
        if (index.schemaVersion !== 1 || typeof index.profiles !== 'object') {
          throw new Error('unsupported game profile index');
        }
        return index;
      })
      .catch(error => {
        gameProfileIndexPromise = null;
        throw error;
      });
  }
  return gameProfileIndexPromise;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function prepareGameProfileForRom(romBytes: Uint8Array, signal?: AbortSignal): Promise<PreparedGameProfile | null> {
  activeGamePresentation = null;
  activeGamePresentationFrame = 0;
  activeGamePresentationInputFrame = null;
  if (!globalThis.crypto?.subtle) return null;
  const sha256 = await sha256Hex(romBytes);
  throwIfSignalAborted(signal);
  const index = await loadGameProfileIndex(signal);
  const profilePath = index.profiles[sha256];
  if (!profilePath) return null;

  const response = await fetch(new URL(profilePath, window.location.href), { signal });
  if (!response.ok) throw new Error(`profile HTTP ${response.status}`);
  let runtimeJson: string | null = null;
  let presentation: GamePresentation | null = null;
  if (profilePath.toLowerCase().endsWith('.gmod')) {
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const manifestFile = archive.file('manifest.json');
    if (!manifestFile) throw new Error('gmod package is missing manifest.json');
    const manifest = JSON.parse(await manifestFile.async('string')) as GmodManifestV2 | { formatVersion: 1 };
    if (manifest.formatVersion === 2) {
      const v2 = manifest as GmodManifestV2;
      const acceptedSources = [v2.source?.sha256, ...(v2.source?.sha256Aliases ?? [])];
      if (v2.format !== 'gmod' || v2.platform !== 'nes' || v2.patch?.format !== 'bps'
          || !acceptedSources.includes(sha256)) {
        throw new Error('gmod v2 manifest does not match the source ROM');
      }
      const patchFile = archive.file(v2.patch.file);
      if (!patchFile) throw new Error(`gmod package is missing ${v2.patch.file}`);
      const patchedBytes = await applyBpsPatch(romBytes, await patchFile.async('uint8array'));
      if (await sha256Hex(patchedBytes) !== v2.target?.sha256) {
        throw new Error('gmod target SHA-256 mismatch');
      }
      const runtime = v2.runtime ? archive.file(v2.runtime.file) : null;
      if (v2.runtime && !runtime) throw new Error(`gmod package is missing ${v2.runtime.file}`);
      runtimeJson = runtime ? await runtime.async('string') : null;
      const presentationFile = v2.presentation ? archive.file(v2.presentation.file) : null;
      if (v2.presentation && !presentationFile) throw new Error(`gmod package is missing ${v2.presentation.file}`);
      presentation = presentationFile
        ? JSON.parse(await presentationFile.async('string')) as GamePresentation
        : null;
      return { romBytes: patchedBytes, runtimeJson, presentation };
    }
    const runtime = archive.file('runtime.json');
    if (!runtime) throw new Error('gmod package is missing runtime.json');
    runtimeJson = await runtime.async('string');
    const presentationFile = archive.file('presentation.json');
    if (presentationFile) {
      presentation = JSON.parse(await presentationFile.async('string')) as GamePresentation;
    }
  } else {
    runtimeJson = await response.text();
  }
  return { romBytes, runtimeJson, presentation };
}

function activatePreparedGameProfile(prepared: PreparedGameProfile): void {
  if (!nes || !prepared.runtimeJson) return;
  nes.loadGameProfile(prepared.runtimeJson);
  const presentation = prepared.presentation;
  if (presentation?.schemaVersion === 1 && presentation.profileId === nes.getActiveGameProfileId()) {
    activeGamePresentation = presentation;
  }
  console.log(`[NES] 已套用遊戲設定檔 ${nes.getActiveGameProfileId()}`);
}

function noteGamePresentationInput(button: ControllerButton, pressed: boolean): void {
  if (!pressed || !activeGamePresentation || activeGamePresentationInputFrame !== null) return;
  if (button !== ControllerButton.A && button !== ControllerButton.Start) return;
  if (activeGamePresentationFrame < activeGamePresentation.inputArmFrame) return;
  activeGamePresentationInputFrame = activeGamePresentationFrame;
}

function describeN64Failure(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

function postN64Diagnostic(type: string, reason: unknown, label: string): void {
  const diagnostic = {
    event: 'diagnostic',
    type,
    ...describeN64Failure(reason),
    label,
    rom: currentRomFilename,
    profile: n64PerformanceProfile.name,
    userAgent: navigator.userAgent,
    recordedAt: new Date().toISOString(),
  };
  console.error(`[N64 diagnostic] ${type}:`, reason);
  void fetch(`${import.meta.env.BASE_URL}__n64-benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnostic),
    keepalive: true,
  }).catch(error => console.warn('[N64 diagnostic] upload failed:', error));
}

function installN64BenchmarkDiagnostics(canvas: HTMLCanvasElement, label: string): () => void {
  const onError = (event: ErrorEvent) => {
    postN64Diagnostic('window-error', event.error ?? event.message, label);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    postN64Diagnostic('unhandled-rejection', event.reason, label);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    postN64Diagnostic('webgl-context-lost', 'WebGL context lost', label);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  canvas.addEventListener('webglcontextlost', onContextLost);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    canvas.removeEventListener('webglcontextlost', onContextLost);
  };
}

let n64Telemetry = createN64Telemetry({
  onReport: report => {
    const speed = report.viPerSecond >= 56 ? 'real-time' : 'below real-time';
    console.info(
      `[N64 perf] ${report.viPerSecond.toFixed(1)} VI/s (${speed}), ` +
      `VI avg/max ${report.averageViMs.toFixed(1)}/${report.longestViMs.toFixed(1)} ms, ` +
      `long VI ${report.longVis}, recompiles ${report.recompiles}, ` +
      `avg core/RSP/present/audio ${(report.coreResidualMs / report.viCount).toFixed(1)}/` +
      `${(report.rspMs / report.viCount).toFixed(1)}/` +
      `${(report.presentMs / report.viCount).toFixed(1)}/` +
      `${(report.audioMs / report.viCount).toFixed(1)} ms, ` +
      `RSP detail DList/RDP ${(report.dlistMs / report.viCount).toFixed(1)}/` +
      `${(report.rdpMs / report.viCount).toFixed(1)} ms, ` +
      `draw tri/rect ${(report.triangleDrawMs / report.viCount).toFixed(1)}/` +
      `${(report.rectDrawMs / report.viCount).toFixed(1)} ms, calls/VI ` +
      `${(report.triangleDrawCalls / report.viCount).toFixed(1)}/` +
      `${(report.rectDrawCalls / report.viCount).toFixed(1)}, ` +
      `tri prepare/upload/submit/restore/other ` +
      `${(report.trianglePrepareMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleUploadMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleSubmitMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleRestoreMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleOtherMs / report.viCount).toFixed(2)} ms, ` +
      `audio underruns ${report.audioUnderruns}`,
      `audio callbacks ${report.audioCallbackCount}, ` +
      `partial/empty ${report.audioPartialUnderruns}/${report.audioEmptyUnderruns}, ` +
      `max callback gap ${report.audioMaxCallbackGapMs.toFixed(1)} ms`,
    );

    const benchmarkEvent = n64BenchmarkSession?.record(report);
    if (benchmarkEvent?.type === 'warmup-complete') {
      console.info('[N64 benchmark] warmup complete; collecting steady-state data');
    } else if (benchmarkEvent?.type === 'complete') {
      const summary = benchmarkEvent.summary;
      const result = {
        ...summary,
        rom: currentRomFilename,
        profile: n64PerformanceProfile.name,
        userAgent: navigator.userAgent,
        recordedAt: new Date().toISOString(),
      };
      console.info(
        `[N64 benchmark result] ${summary.label}: ${summary.viPerSecond.toFixed(1)} VI/s, ` +
        `VI avg/max ${summary.averageViMs.toFixed(1)}/${summary.longestViMs.toFixed(1)} ms, ` +
        `long VI ${summary.longVis}, recompiles ${summary.recompiles}, ` +
        `avg core/RSP/present/audio ${summary.averageCoreResidualMs.toFixed(1)}/` +
        `${summary.averageRspMs.toFixed(1)}/${summary.averagePresentMs.toFixed(1)}/` +
        `${summary.averageAudioMs.toFixed(1)} ms, ` +
        `RSP detail DList/RDP ${summary.averageDlistMs.toFixed(1)}/` +
        `${summary.averageRdpMs.toFixed(1)} ms, ` +
        `draw tri/rect ${summary.averageTriangleDrawMs.toFixed(1)}/` +
        `${summary.averageRectDrawMs.toFixed(1)} ms, calls/VI ` +
        `${summary.averageTriangleDrawCalls.toFixed(1)}/` +
        `${summary.averageRectDrawCalls.toFixed(1)}, ` +
        `tri prepare/upload/submit/restore/other ` +
        `${summary.averageTrianglePrepareMs.toFixed(2)}/` +
        `${summary.averageTriangleUploadMs.toFixed(2)}/` +
        `${summary.averageTriangleSubmitMs.toFixed(2)}/` +
        `${summary.averageTriangleRestoreMs.toFixed(2)}/` +
        `${summary.averageTriangleOtherMs.toFixed(2)} ms, ` +
        `audio underruns ${summary.audioUnderruns}, ` +
        `sample ${(summary.elapsedMs / 1000).toFixed(1)} s`,
      );
      localStorage.setItem('n64BenchmarkResult', JSON.stringify(result));
      const mobileTest = new URLSearchParams(window.location.search).get('n64MobileTest');
      if (mobileTest === 'baseline' || mobileTest === 'stream' || mobileTest === 'full') {
        localStorage.setItem(`n64MobileTestResult:${mobileTest}`, JSON.stringify(result));
      }
      void fetch(`${import.meta.env.BASE_URL}__n64-benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(error => console.warn('[N64 benchmark] result upload failed:', error));
      void showAppAlert(
        `${mobileTest ? 'N64 手機簡易測試' : 'N64 Benchmark'}完成\n\n${summary.label}\n` +
        `${summary.viPerSecond.toFixed(1)} VI/s\n` +
        `VI avg/max: ${summary.averageViMs.toFixed(1)}/${summary.longestViMs.toFixed(1)} ms\n` +
        `Triangle/Rect: ${summary.averageTriangleDrawMs.toFixed(1)}/${summary.averageRectDrawMs.toFixed(1)} ms\n` +
        `Audio underruns: ${summary.audioUnderruns}\n` +
        `Long VI: ${summary.longVis}\nRecompiles: ${summary.recompiles}`,
        'N64 測試結果',
      );
    }
  },
});
let fbneoCore: FbNeoArcadeCore | null = null;
let currentFbNeoRomSet: FbNeoRomSet | null = null;
let arcadeInputP1 = 0;
let arcadeInputP2 = 0;
let arcadeGamepadInputP1 = 0;
let arcadeSourceWidth = 320;
let arcadeSourceHeight = 240;
let arcadeRotation: ArcadeRotation = 'none';

function isN64RomName(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64');
}

function isMupenN64Active(): boolean {
  return activeBackend === 'mupen64';
}

function isFbNeoActive(): boolean {
  return activeBackend === 'fbneo';
}

function isSnes9xActive(): boolean {
  return activeBackend === 'snes9x';
}

function isEmulatorJsNesActive(): boolean {
  return isSnes9xActive() && emulatorJsCore === 'nes';
}

function setNesButton(button: ControllerButton, pressed: boolean): void {
  noteGamePresentationInput(button, pressed);
  if (isEmulatorJsNesActive()) {
    const libretroButton = button === ControllerButton.A ? 8
      : button === ControllerButton.B ? 0
      : button;
    snes9xBackend?.setButton(libretroButton, pressed);
  } else {
    nes?.setButton(0, button, pressed);
  }
}

function setSnesButton(button: number, pressed: boolean): void {
  if (isSnes9xActive()) snes9xBackend?.setButton(button, pressed);
  else nes?.setButton(0, button, pressed);
}

async function stopSnes9xBackend(): Promise<void> {
  const backend = snes9xBackend;
  if (backend) await backend.stop();
  if (snes9xBackend === backend) snes9xBackend = null;
  emulatorJsCore = null;
  document.getElementById('screen')?.style.removeProperty('display');
}

function stopFbNeoBackend(): void {
  fbneoCore = null;
  currentFbNeoRomSet = null;
  arcadeInputP1 = 0;
  arcadeInputP2 = 0;
  arcadeGamepadInputP1 = 0;
  if (activeBackend === 'fbneo') activeBackend = 'wasm';
}

function resetWasmCore(): void {
  textOverlay?.dispose();
  textOverlay = null;
  if (!nes) return;
  nes.free();
  nes = new EmuWasm();
  if (audioContext) nes.setAudioSampleRate(audioContext.sampleRate);
  window.nes = nes;
}

function isFbNeoArcadeRomName(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip') && getFbNeoGameName(filename) !== null;
}

function detectRomSystem(rom: RomInfo): SystemKey {
  const normalized = rom.system?.toLowerCase();
  if (normalized === 'fbneo' || normalized === 'arcade') return 'arcade';
  if (normalized === 'nes' || normalized === 'gb' || normalized === 'gg' || normalized === 'sms' || normalized === 'genesis' || normalized === 'snes' || normalized === 'n64') {
    return normalized;
  }

  const lower = rom.file.toLowerCase();
  if (isFbNeoArcadeRomName(rom.file)) return 'arcade';
  if (isN64RomName(rom.file)) return 'n64';
  if (lower.endsWith('.sfc') || lower.endsWith('.smc') || lower.endsWith('.fig')) return 'snes';
  if (lower.endsWith('.md') || lower.endsWith('.gen') || lower.endsWith('.smd')) return 'genesis';
  if (lower.endsWith('.sms')) return 'sms';
  if (lower.endsWith('.gg')) return 'gg';
  if (lower.endsWith('.gb') || lower.endsWith('.gbc')) return 'gb';
  return 'nes';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char] ?? char));
}

function getRomDisplayName(rom: RomInfo): string {
  return rom.name
    .replace(/\s*\((?:NES|FC|GB|GBC|GG|SMS|MD|Mega\s+Drive|Genesis|SFC|SNES|N64|FBNeo\s+Arcade|Arcade)\)\s*$/i, '')
    .trim();
}

function getRomCatalogEntry(filename: string, fallbackName = filename): RomInfo {
  return romCatalog.find(rom => rom.file === filename) ?? {
    name: fallbackName,
    file: filename,
  };
}

function getRomCoverUrl(rom: RomInfo): string {
  if (!rom.cover) return '';
  if (/^(?:https?:|data:|blob:|\/)/i.test(rom.cover)) return rom.cover;
  return getPublicAssetUrl(rom.cover.replace(/^\/+/, ''));
}

function renderKeyboardBindings(bindings: KeyboardBindingView[]): string {
  return bindings.map((binding) => `
    <div class="keyboard-binding">
      <span class="keyboard-action">${escapeHtml(binding.action)}</span>
      <span class="key-row">${binding.keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join('')}</span>
    </div>
  `).join('');
}

function updateKeyboardGuide(): void {
  const titleEl = document.getElementById('keyboard-guide-title');
  const noteEl = document.getElementById('keyboard-guide-note');
  const bindingsEl = document.getElementById('keyboard-bindings');
  if (!titleEl || !noteEl || !bindingsEl) return;

  let title = 'NES / GB / GG / SMS 鍵盤控制';
  let note = '這組按鍵適用於二鍵家用主機與掌機。';
  let bindings: KeyboardBindingView[] = [
    { action: '方向', keys: ['↑', '↓', '←', '→'] },
    { action: 'A', keys: ['Z'] },
    { action: 'B', keys: ['X'] },
    { action: 'Start', keys: ['Enter'] },
    { action: 'Select', keys: ['Right Shift'] },
  ];

  if (isMupenN64Active()) {
    title = 'Nintendo 64 鍵盤控制';
    note = 'N64 使用方向鍵當類比搖桿，WASD 保留給 D-Pad，右側 C 鍵用 IJKL。';
    bindings = [
      { action: 'Analog Stick', keys: ['↑', '↓', '←', '→'] },
      { action: 'D-Pad', keys: ['W', 'A', 'S', 'D'] },
      { action: 'A / B', keys: ['Left Shift', 'Left Ctrl'] },
      { action: 'C Buttons', keys: ['I', 'J', 'K', 'L'] },
      { action: 'Z / L / R', keys: ['Z', 'X', 'C'] },
      { action: 'Start', keys: ['Enter'] },
    ];
  } else if (isFbNeoActive()) {
    title = 'FBNeo Arcade 鍵盤控制';
    note = '街機模式含投幣與 1P Start，A-F 六鍵對應左手鍵位。';
    bindings = [
      { action: '方向', keys: ['↑', '↓', '←', '→'] },
      { action: 'A / B / C', keys: ['Z', 'X', 'A'] },
      { action: 'D / E / F', keys: ['S', 'Q', 'W'] },
      { action: 'Coin', keys: ['5'] },
      { action: '1P Start', keys: ['1', 'Enter'] },
    ];
  } else if (isGenesisCore()) {
    title = 'Mega Drive / Genesis 鍵盤控制';
    note = '三鍵遊戲使用 A/B/C，六鍵遊戲另可使用 X/Y/Z 與 Mode。';
    bindings = [
      { action: '方向', keys: ['↑', '↓', '←', '→'] },
      { action: 'C / B', keys: ['Z', 'X'] },
      { action: 'A / Y', keys: ['A', 'S'] },
      { action: 'X / Z', keys: ['Q', 'W'] },
      { action: 'Start', keys: ['Enter'] },
      { action: 'Mode', keys: ['Right Shift'] },
    ];
  } else if (isSnesCore()) {
    title = 'SFC / SNES 鍵盤控制';
    note = 'SNES 使用四顆正面按鈕與 L/R 肩鍵，和二鍵主機配置不同。';
    bindings = [
      { action: '方向', keys: ['↑', '↓', '←', '→'] },
      { action: 'A / B', keys: ['Z', 'X'] },
      { action: 'Y / X', keys: ['A', 'S'] },
      { action: 'L / R', keys: ['Q', 'W'] },
      { action: 'Start', keys: ['Enter'] },
      { action: 'Select', keys: ['Right Shift'] },
    ];
  }

  bindings.push(
    { action: '存檔 / 讀檔', keys: ['F5', 'F7'] },
  );

  titleEl.textContent = title;
  noteEl.textContent = note;
  bindingsEl.innerHTML = renderKeyboardBindings(bindings);
}

interface N64GraphicsCapability {
  supported: boolean;
  message: string;
  renderer?: string;
}

// N64 的 Mupen64Plus/Rice 後端需要瀏覽器提供 WebGL2，也就是 WebGL ES 3 等級的 context。
function getN64GraphicsCapability(): N64GraphicsCapability {
  if (typeof WebGL2RenderingContext === 'undefined') {
    return { supported: false, message: '這個瀏覽器沒有提供 WebGL2 API。' };
  }

  const testCanvas = document.createElement('canvas');
  const gl = testCanvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) {
    return { supported: false, message: '瀏覽器無法建立 WebGL2 context，常見原因是硬體加速關閉或顯示卡/驅動被瀏覽器封鎖。' };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  return { supported: true, message: 'WebGL2 可用', renderer };
}

function drawN64GraphicsError(message: string): void {
  if (!canvas) return;

  canvas.id = 'screen';
  canvas.width = 320;
  canvas.height = 240;
  canvas.style.aspectRatio = '4 / 3';

  const errorContext = canvas.getContext('2d');
  if (!errorContext) return;

  errorContext.fillStyle = '#20202a';
  errorContext.fillRect(0, 0, canvas.width, canvas.height);
  errorContext.fillStyle = '#f2e9d8';
  errorContext.font = 'bold 18px sans-serif';
  errorContext.fillText('N64 圖形初始化失敗', 24, 62);
  errorContext.font = '13px sans-serif';
  const lines = [
    message,
    '請使用新版 Chrome/Edge，並確認硬體加速已開啟。',
    'chrome://gpu 可檢查 WebGL2 是否為 Hardware accelerated。',
  ];
  lines.forEach((line, index) => errorContext.fillText(line, 24, 102 + index * 26));
}

function activateN64Canvas(profile: N64PerformanceProfile): HTMLCanvasElement {
  if (!wasmCanvas) {
    throw new Error('找不到可替換的 2D 畫布');
  }

  document.body.classList.add('n64-mode', 'n64-initializing');
  const n64Canvas = document.createElement('canvas');
  n64Canvas.id = 'canvas';
  n64Canvas.width = profile.width;
  n64Canvas.height = profile.height;
  n64Canvas.style.setProperty('--n64-render-width', `${profile.width}px`);
  n64Canvas.style.aspectRatio = '4 / 3';
  n64Canvas.style.width = '100%';
  n64Canvas.style.height = 'auto';
  wasmCanvas.replaceWith(n64Canvas);

  canvas = n64Canvas;
  ctx = null;
  imageData = null;
  return n64Canvas;
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function settleN64CanvasLayout(n64Canvas: HTMLCanvasElement): Promise<void> {
  await waitForNextFrame();
  await waitForNextFrame();
  n64Canvas.getBoundingClientRect();
}

function lockN64RenderSize(
  n64Canvas: HTMLCanvasElement,
  profile: N64PerformanceProfile,
): void {
  n64Canvas.width = profile.width;
  n64Canvas.height = profile.height;
  const gl = n64Canvas.getContext('webgl2') ?? n64Canvas.getContext('webgl');
  gl?.viewport(0, 0, profile.width, profile.height);
}

function restoreWasmCanvas(): void {
  document.body.classList.remove('n64-initializing');
  if (!wasmCanvas || canvas === wasmCanvas) return;

  canvas?.replaceWith(wasmCanvas);
  canvas = wasmCanvas;
  canvas.id = 'screen';
  ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  imageData = null;
}

// ===== UI 元素 =====

let romSelector: HTMLElement | null = null;
let gameboyShell: HTMLElement | null = null;
let powerLed: HTMLElement | null = null;
let romCatalog: RomInfo[] = [];
let lobbyCrtPreviewCore: EmuWasm | null = null;
let lobbyCrtPreviewAnimationId: number | null = null;
let lobbyCrtPreviewStarting = false;
let lobbyMarioRomData: Uint8Array | null = null;

// ===== 音頻設定 =====
let audioMuted: boolean = false;    // 靜音旗標（同時停用 APU IRQ）
const NES_OVERSCAN_TOP = 8;
const NES_OVERSCAN_BOTTOM = 8;

// ===== 初始化 =====

/**
 * 初始化應用程式外殼。ROM 清單必須先於 WASM runtime 顯示，避免手機首次載入核心失敗時卡在占位文字。
 */
function setupAppShell(): boolean {
  // 取得 UI 元素
  romSelector = document.getElementById('rom-selector');
  gameboyShell = document.getElementById('gameboy-shell');
  powerLed = document.getElementById('power-led');

  // 首頁清單不應依賴 Canvas、控制器或音訊 API，部分 Android WebView 可能在後續初始化提早失敗。
  setupRomSelector();

  // 建立畫布
  canvas = document.getElementById('screen') as HTMLCanvasElement;
  if (!canvas) {
    console.error('找不到畫布元素');
    return false;
  }
  wasmCanvas = canvas;

  ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('無法取得 Canvas 2D 上下文');
    return false;
  }
  ctx.imageSmoothingEnabled = false;

  imageData = ctx.createImageData(256, 240);  // 預設 NES 尺寸，載入 ROM 後會更新

  // 設定鍵盤輸入（直接對 WASM 控制器操作）
  setupKeyboardInput();

  // 設定虛擬控制器
  setupVirtualController();

  // 設定電腦版控制按鈕
  setupDesktopControls();

  const homeLink = document.getElementById('game-home-link');
  homeLink?.addEventListener('click', confirmReturnToMachineMenu);
  homeLink?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      confirmReturnToMachineMenu();
    }
  });

  document.getElementById('app-dialog-confirm')?.addEventListener('click', () => closeAppDialog(true));
  document.getElementById('app-dialog-cancel')?.addEventListener('click', () => closeAppDialog(false));
  document.getElementById('app-dialog-overlay')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAppDialog(false);
    }
  });

  // 設定觸控裝置 RWD 狀態（iPhone Safari 橫版可能仍落在桌機寬度斷點）
  setupIOSInstallHint();
  setupResponsiveModeDetection();
  updateKeyboardGuide();

  // 設定檔案選擇器
  setupFileInput();

  return true;
}

/**
 * 初始化模擬器（載入 WASM 模組）
 */
async function initWasm(): Promise<void> {
  // 初始化 WASM 模組
  await init();

  // 建立統一模擬器實例（支援 NES 及 Game Boy）
  nes = new EmuWasm();

  if (audioContext) {
    nes.setAudioSampleRate(audioContext.sampleRate);
  }

  console.log('H5-NES 模擬器已初始化（WASM 核心）');
}

async function waitForWasmCore(): Promise<boolean> {
  if (nes) return true;

  try {
    if (wasmInitPromise) {
      await wasmInitPromise;
    }
  } catch (error) {
    console.error('WASM 核心初始化失敗:', error);
  }

  return nes !== null;
}

function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
      || standaloneNavigator.standalone,
  );
}

function updateIOSInstallHint(): void {
  const hint = document.getElementById('ios-install-hint');
  if (!hint || hint.dataset.dismissed === 'true') return;

  const isIOSBrowser = isIOSDevice() && !isStandaloneDisplayMode();
  const isLobbyVisible = romSelector ? getComputedStyle(romSelector).display !== 'none' : false;
  hint.hidden = !isIOSBrowser || !isLobbyVisible;
}

function setupIOSInstallHint(): void {
  document.getElementById('ios-install-hint-close')?.addEventListener('click', () => {
    const hint = document.getElementById('ios-install-hint');
    if (!hint) return;
    hint.dataset.dismissed = 'true';
    hint.hidden = true;
  });
}

function setupResponsiveModeDetection(): void {
  document.body.classList.toggle('android-device-mode', /Android/i.test(navigator.userAgent));
  const iosDevice = isIOSDevice();
  let wasIOSBrowserLandscape = false;
  let collapseAddressBarFrame: number | null = null;

  const canScrollRoot = () => {
    const scrollingElement = document.scrollingElement;
    return Boolean(scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight + 1);
  };

  const requestIOSAddressBarCollapse = () => {
    if (!document.body.classList.contains('ios-safari-browser-mode') || window.scrollY > 0 || !canScrollRoot()) {
      return;
    }

    if (collapseAddressBarFrame !== null) {
      window.cancelAnimationFrame(collapseAddressBarFrame);
    }

    collapseAddressBarFrame = window.requestAnimationFrame(() => {
      collapseAddressBarFrame = null;
      if (document.body.classList.contains('ios-safari-browser-mode') && canScrollRoot()) {
        window.scrollTo(0, 1);
      }
    });
  };

  const updateResponsiveMode = () => {
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const isLandscape = viewportWidth > viewportHeight;
    const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    const isCompressedLandscape = isLandscape && viewportHeight <= 560;
    const shouldUseMobileLandscape = isTouchDevice && isLandscape && (viewportWidth <= 1180 || isCompressedLandscape);
    const isIOSLandscape = iosDevice && isLandscape;
    const isStandalone = isStandaloneDisplayMode();
    const isIOSBrowser = iosDevice && !isStandalone;
    const isIOSBrowserLandscape = isIOSLandscape && isIOSBrowser;

    document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
    document.documentElement.style.setProperty('--visual-viewport-center-x', `${viewportOffsetLeft + viewportWidth / 2}px`);
    document.documentElement.style.setProperty('--visual-viewport-center-y', `${viewportOffsetTop + viewportHeight / 2}px`);
    document.documentElement.classList.toggle('ios-safari-browser-mode', isIOSBrowser);
    document.body.classList.toggle('ios-safari-browser-mode', isIOSBrowser);
    document.documentElement.classList.toggle('ios-safari-landscape-mode', isIOSBrowserLandscape);
    document.body.classList.toggle('ios-safari-landscape-mode', isIOSBrowserLandscape);
    document.documentElement.classList.toggle('standalone-mode', isStandalone);
    document.body.classList.toggle('standalone-mode', isStandalone);
    document.body.classList.toggle('touch-device-mode', isTouchDevice);
    document.body.classList.toggle('mobile-landscape-mode', shouldUseMobileLandscape);
    document.body.classList.toggle('fullscreen-active', Boolean(document.fullscreenElement) || isIOSLandscape);
    updateIOSInstallHint();

    if (isIOSBrowserLandscape && !wasIOSBrowserLandscape) {
      requestIOSAddressBarCollapse();
    }
    wasIOSBrowserLandscape = isIOSBrowserLandscape;
  };

  updateResponsiveMode();
  window.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.addEventListener('orientationchange', () => {
    updateResponsiveMode();
    window.requestAnimationFrame(updateResponsiveMode);
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateResponsiveMode, { passive: true });
  window.addEventListener('touchstart', requestIOSAddressBarCollapse, { passive: true });
  window.addEventListener('touchend', requestIOSAddressBarCollapse, { passive: true });
}

// ===== 鍵盤輸入 =====

/** 鍵盤映射 (玩家 1) */
const KEYBOARD_MAP_P1: Record<string, ControllerButton> = {
  'KeyZ': ControllerButton.A,
  'KeyX': ControllerButton.B,
  'ShiftRight': ControllerButton.Select,
  'Enter': ControllerButton.Start,
  'ArrowUp': ControllerButton.Up,
  'ArrowDown': ControllerButton.Down,
  'ArrowLeft': ControllerButton.Left,
  'ArrowRight': ControllerButton.Right,
};

/** SNES 鍵盤映射 (玩家 1) */
const KEYBOARD_MAP_SNES: Record<string, number> = {
  'KeyZ': SnesButton.A,
  'KeyX': SnesButton.B,
  'KeyA': SnesButton.Y,
  'KeyS': SnesButton.X,
  'KeyQ': SnesButton.L,
  'KeyW': SnesButton.R,
  'ShiftRight': SnesButton.Select,
  'Enter': SnesButton.Start,
  'ArrowUp': SnesButton.Up,
  'ArrowDown': SnesButton.Down,
  'ArrowLeft': SnesButton.Left,
  'ArrowRight': SnesButton.Right,
};

interface N64KeyBinding {
  key: string;
  code: string;
  keyCode: number;
  location?: number;
}

const N64_KEY_BINDINGS: Record<string, N64KeyBinding> = {
  'analog-up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  'analog-down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  'analog-left': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  'analog-right': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  'dpad-up': { key: 'w', code: 'KeyW', keyCode: 87 },
  'dpad-down': { key: 's', code: 'KeyS', keyCode: 83 },
  'dpad-left': { key: 'a', code: 'KeyA', keyCode: 65 },
  'dpad-right': { key: 'd', code: 'KeyD', keyCode: 68 },
  'c-up': { key: 'i', code: 'KeyI', keyCode: 73 },
  'c-down': { key: 'k', code: 'KeyK', keyCode: 75 },
  'c-left': { key: 'j', code: 'KeyJ', keyCode: 74 },
  'c-right': { key: 'l', code: 'KeyL', keyCode: 76 },
  'a': { key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: KeyboardEvent.DOM_KEY_LOCATION_LEFT },
  'b': { key: 'Control', code: 'ControlLeft', keyCode: 17, location: KeyboardEvent.DOM_KEY_LOCATION_LEFT },
  'start': { key: 'Enter', code: 'Enter', keyCode: 13 },
  'z': { key: 'z', code: 'KeyZ', keyCode: 90 },
  'l': { key: 'x', code: 'KeyX', keyCode: 88 },
  'r': { key: 'c', code: 'KeyC', keyCode: 67 },
};

const n64PressedKeys = new Set<string>();

const ARCADE_KEYBOARD_MAP: Record<string, number> = {
  'ArrowUp': ArcadeInputBit.Up,
  'ArrowDown': ArcadeInputBit.Down,
  'ArrowLeft': ArcadeInputBit.Left,
  'ArrowRight': ArcadeInputBit.Right,
  'KeyZ': ArcadeInputBit.ButtonA,
  'KeyX': ArcadeInputBit.ButtonB,
  'KeyA': ArcadeInputBit.ButtonC,
  'KeyS': ArcadeInputBit.ButtonD,
  'KeyQ': ArcadeInputBit.ButtonE,
  'KeyW': ArcadeInputBit.ButtonF,
  'Digit5': ArcadeInputBit.Coin,
  'Numpad5': ArcadeInputBit.Coin,
  'Digit1': ArcadeInputBit.Start,
  'Numpad1': ArcadeInputBit.Start,
  'Enter': ArcadeInputBit.Start,
};

export function mergeArcadeInputSources(directInput: number, gamepadInput: number): number {
  return directInput | gamepadInput;
}

export function updateArcadeInputMask(mask: number, bit: number, pressed: boolean): number {
  return pressed ? (mask | bit) : (mask & ~bit);
}

function setArcadeInputBit(bit: number, pressed: boolean, player: 1 | 2 = 1): void {
  if (player === 1) {
    arcadeInputP1 = updateArcadeInputMask(arcadeInputP1, bit, pressed);
  } else {
    arcadeInputP2 = updateArcadeInputMask(arcadeInputP2, bit, pressed);
  }
}

function setArcadeKeyboardInput(code: string, pressed: boolean): boolean {
  const bit = ARCADE_KEYBOARD_MAP[code];
  if (bit === undefined) return false;
  setArcadeInputBit(bit, pressed);
  return true;
}

function pollArcadeGamepads(): void {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = pads[0];
  if (!pad) {
    arcadeGamepadInputP1 = 0;
    return;
  }

  const pressed = (index: number) => pad.buttons[index]?.pressed ?? false;
  const axisPressed = (index: number, direction: -1 | 1) => {
    const value = pad.axes[index] ?? 0;
    return direction < 0 ? value < -0.45 : value > 0.45;
  };

  let mask = 0;
  if (pressed(12) || axisPressed(1, -1)) mask |= ArcadeInputBit.Up;
  if (pressed(13) || axisPressed(1, 1)) mask |= ArcadeInputBit.Down;
  if (pressed(14) || axisPressed(0, -1)) mask |= ArcadeInputBit.Left;
  if (pressed(15) || axisPressed(0, 1)) mask |= ArcadeInputBit.Right;
  if (pressed(0)) mask |= ArcadeInputBit.ButtonA;
  if (pressed(1)) mask |= ArcadeInputBit.ButtonB;
  if (pressed(2)) mask |= ArcadeInputBit.ButtonC;
  if (pressed(3)) mask |= ArcadeInputBit.ButtonD;
  if (pressed(4)) mask |= ArcadeInputBit.ButtonE;
  if (pressed(5)) mask |= ArcadeInputBit.ButtonF;
  if (pressed(8)) mask |= ArcadeInputBit.Coin;
  if (pressed(9)) mask |= ArcadeInputBit.Start;
  arcadeGamepadInputP1 = mask;
}

function setupKeyboardInput(): void {
  window.addEventListener('keydown', (e) => {
    if (isMupenN64Active()) return;
    if (isFbNeoActive()) {
      if (setArcadeKeyboardInput(e.code, true)) e.preventDefault();
      return;
    }
    if (usesSixButtonController()) {
      const button = KEYBOARD_MAP_SNES[e.code];
      if (button !== undefined) {
        setSnesButton(button, true);
        e.preventDefault();
      }
    } else {
      if (!nes) return;
      const button = KEYBOARD_MAP_P1[e.code];
      if (button !== undefined) {
        setNesButton(button, true);
        e.preventDefault();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (isMupenN64Active()) return;
    if (isFbNeoActive()) {
      if (setArcadeKeyboardInput(e.code, false)) e.preventDefault();
      return;
    }
    if (usesSixButtonController()) {
      const button = KEYBOARD_MAP_SNES[e.code];
      if (button !== undefined) {
        setSnesButton(button, false);
        e.preventDefault();
      }
    } else {
      if (!nes) return;
      const button = KEYBOARD_MAP_P1[e.code];
      if (button !== undefined) {
        setNesButton(button, false);
        e.preventDefault();
      }
    }
  });
}

// ===== ROM 選擇器 =====

let gameLoadingSequence = 0;
let gameLoadAbortController: AbortController | null = null;
let appDialogResolve: ((confirmed: boolean) => void) | null = null;
let appDialogPreviousFocus: HTMLElement | null = null;

function beginGameLoad(): AbortController {
  gameLoadAbortController?.abort();
  gameLoadAbortController = new AbortController();
  return gameLoadAbortController;
}

function cancelPendingGameLoad(): void {
  gameLoadingSequence++;
  gameLoadAbortController?.abort();
  gameLoadAbortController = null;
  const overlay = document.getElementById('game-loading-overlay');
  if (overlay) overlay.hidden = true;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function throwIfSignalAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('遊戲載入已取消', 'AbortError');
  }
}

function closeAppDialog(confirmed: boolean): void {
  const overlay = document.getElementById('app-dialog-overlay');
  if (!overlay || overlay.hidden || !appDialogResolve) return;

  overlay.hidden = true;
  const resolve = appDialogResolve;
  appDialogResolve = null;
  resolve(confirmed);
  appDialogPreviousFocus?.focus();
  appDialogPreviousFocus = null;
}

function showAppDialog(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel?: string,
): Promise<boolean> {
  if (appDialogResolve) closeAppDialog(false);

  const overlay = document.getElementById('app-dialog-overlay');
  const titleElement = document.getElementById('app-dialog-title');
  const messageElement = document.getElementById('app-dialog-message');
  const confirmButton = document.getElementById('app-dialog-confirm') as HTMLButtonElement | null;
  const cancelButton = document.getElementById('app-dialog-cancel') as HTMLButtonElement | null;
  if (!overlay || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    return Promise.resolve(false);
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmLabel;
  cancelButton.textContent = cancelLabel ?? '';
  cancelButton.hidden = cancelLabel === undefined;
  appDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.hidden = false;

  return new Promise<boolean>((resolve) => {
    appDialogResolve = resolve;
    requestAnimationFrame(() => confirmButton.focus());
  });
}

function showAppAlert(message: string, title = '發生錯誤'): Promise<boolean> {
  return showAppDialog(title, message, '確定');
}

function showAppConfirm(message: string, title = '請確認'): Promise<boolean> {
  return showAppDialog(title, message, '是', '否');
}

async function showGameLoading(gameName: string, status: string): Promise<number> {
  const sequence = ++gameLoadingSequence;
  const overlay = document.getElementById('game-loading-overlay');
  const nameElement = document.getElementById('game-loading-name');
  const statusElement = document.getElementById('game-loading-status');
  const progressElement = document.getElementById('game-loading-progress');
  const progressBar = document.getElementById('game-loading-progress-bar');

  if (nameElement) nameElement.textContent = gameName;
  if (statusElement) statusElement.textContent = status;
  if (progressElement) {
    progressElement.hidden = true;
    progressElement.removeAttribute('aria-valuenow');
  }
  if (progressBar) progressBar.style.width = '0%';
  if (overlay) overlay.hidden = false;

  // 先讓瀏覽器畫出動畫；背景分頁暫停 rAF 時仍要繼續載入。
  await nextAnimationFrameOrTimeout();
  return sequence;
}

function nextAnimationFrameOrTimeout(timeoutMs = 100): Promise<void> {
  return new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    requestAnimationFrame(finish);
  });
}

function updateGameLoading(sequence: number, status: string): void {
  if (sequence !== gameLoadingSequence) return;
  const statusElement = document.getElementById('game-loading-status');
  if (statusElement) statusElement.textContent = status;
}

function updateGameLoadingProgress(sequence: number, progress: number | null, status: string): void {
  if (sequence !== gameLoadingSequence) return;
  updateGameLoading(sequence, status);
  const progressElement = document.getElementById('game-loading-progress');
  const progressBar = document.getElementById('game-loading-progress-bar');
  if (!progressElement || !progressBar) return;

  if (progress === null) {
    progressElement.hidden = true;
    progressElement.removeAttribute('aria-valuenow');
    return;
  }

  const percentage = Math.max(0, Math.min(100, Math.round(progress)));
  progressElement.hidden = false;
  progressElement.setAttribute('aria-valuemin', '0');
  progressElement.setAttribute('aria-valuemax', '100');
  progressElement.setAttribute('aria-valuenow', String(percentage));
  progressBar.style.width = `${percentage}%`;
}

function hideGameLoading(sequence: number): void {
  if (sequence !== gameLoadingSequence) return;
  const overlay = document.getElementById('game-loading-overlay');
  const cartridgeSequence = document.getElementById('cartridge-sequence');
  overlay?.removeAttribute('data-loading-mode');
  if (cartridgeSequence) {
    cartridgeSequence.hidden = true;
    cartridgeSequence.classList.remove('is-playing');
  }
  if (overlay) overlay.hidden = true;
}

async function readResponseWithProgress(response: Response, sequence: number): Promise<ArrayBuffer> {
  const totalBytes = Number(response.headers.get('Content-Length'));
  if (!response.body || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    updateGameLoadingProgress(sequence, null, '正在下載遊戲檔案…');
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  let bytes = new Uint8Array(totalBytes);
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (receivedBytes + value.length > bytes.length) {
      const expanded = new Uint8Array(Math.max(receivedBytes + value.length, bytes.length * 2));
      expanded.set(bytes.subarray(0, receivedBytes));
      bytes = expanded;
    }
    bytes.set(value, receivedBytes);
    receivedBytes += value.length;
    const percentage = receivedBytes / totalBytes * 100;
    updateGameLoadingProgress(sequence, percentage, `正在下載遊戲檔案… ${Math.min(100, Math.round(percentage))}%`);
  }

  if (receivedBytes === bytes.byteLength) return bytes.buffer;
  return bytes.slice(0, receivedBytes).buffer;
}

/**
 * 設定 ROM 選擇器
 */
function setupRomSelector(): void {
  loadRomList();
  setupLobbyCrt();

  document.getElementById('rom-back-btn')?.addEventListener('click', renderMachineSelector);
  const selectorEl = document.getElementById('rom-selector');
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  selectorEl?.addEventListener('scroll', () => {
    if (scrollTopButton) {
      scrollTopButton.hidden = scrollTopButton.dataset.enabled !== 'true' || selectorEl.scrollTop < 480;
    }
  }, { passive: true });
  scrollTopButton?.addEventListener('click', () => {
    if (selectorEl) selectorEl.scrollTop = 0;
    scrollTopButton.hidden = true;
  });
  
  // 設定檔案上傳
  const fileInput = document.getElementById('rom-file-input') as HTMLInputElement;
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await loadRomFromFile(file);
    }
  });
}

function setupLobbyCrt(): void {
  const crtButton = document.getElementById('lobby-crt') as HTMLButtonElement | null;
  const crtCanvas = document.getElementById('lobby-crt-screen') as HTMLCanvasElement | null;
  const crtContext = crtCanvas?.getContext('2d');
  if (!crtButton || !crtCanvas || !crtContext) return;

  crtContext.fillStyle = '#000';
  crtContext.fillRect(0, 0, crtCanvas.width, crtCanvas.height);

  crtButton.addEventListener('click', async () => {
    if (crtButton.getAttribute('aria-busy') === 'true') return;

    const marioRom = romCatalog.find(rom => rom.file === LOBBY_MARIO_ROM_FILE)
      ?? romCatalog.find(rom => rom.system === 'nes' && rom.name === '超級瑪利歐兄弟');
    if (!marioRom) {
      await showAppAlert(romCatalog.length === 0 ? '遊戲列表尚未載入完成。' : '找不到超級瑪利歐兄弟 ROM。');
      return;
    }

    crtButton.setAttribute('aria-busy', 'true');
    crtButton.classList.remove('is-powering');
    void crtButton.offsetWidth;
    crtButton.classList.add('is-powering');

    await new Promise<void>(resolve => {
      const sweep = crtButton.querySelector('.crt-power-sweep');
      const timeoutId = window.setTimeout(resolve, 850);
      sweep?.addEventListener('animationend', () => {
        window.clearTimeout(timeoutId);
        resolve();
      }, { once: true });
    });

    try {
      stopLobbyCrtPreview();
      await loadRomFromServer(marioRom.file);
    } finally {
      crtButton.classList.remove('is-powering');
      crtButton.removeAttribute('aria-busy');
      if (romSelector && getComputedStyle(romSelector).display !== 'none') {
        void startLobbyCrtPreview();
      }
    }
  });
}

async function startLobbyCrtPreview(): Promise<void> {
  if (lobbyCrtPreviewStarting || lobbyCrtPreviewCore || romSelector?.style.display === 'none') return;

  const marioRom = romCatalog.find(rom => rom.file === LOBBY_MARIO_ROM_FILE);
  const crtButton = document.getElementById('lobby-crt');
  const crtCanvas = document.getElementById('lobby-crt-screen') as HTMLCanvasElement | null;
  const crtContext = crtCanvas?.getContext('2d');
  if (!marioRom || !crtCanvas || !crtContext) return;

  lobbyCrtPreviewStarting = true;
  try {
    if (wasmInitPromise) await wasmInitPromise;
    if (!lobbyMarioRomData) {
      const response = await fetch(getRomAssetUrl(import.meta.env.BASE_URL, marioRom.file));
      if (!response.ok) throw new Error(`無法載入大廳預覽: ${marioRom.file}`);
      lobbyMarioRomData = new Uint8Array(await response.arrayBuffer());
    }
    if (romSelector?.style.display === 'none') return;

    const previewCore = new EmuWasm();
    previewCore.setAudioEnabled(false);
    if (!previewCore.loadRom(lobbyMarioRomData)) {
      previewCore.free();
      throw new Error('大廳 CRT 無法啟動超級瑪利歐兄弟');
    }

    lobbyCrtPreviewCore = previewCore;
    const screenWidth = previewCore.getScreenWidth();
    const screenHeight = previewCore.getScreenHeight() - NES_OVERSCAN_TOP - NES_OVERSCAN_BOTTOM;
    crtCanvas.width = screenWidth;
    crtCanvas.height = screenHeight;
    const previewImage = crtContext.createImageData(screenWidth, screenHeight);
    let emulatedFrames = 0;
    let lastRenderedAt = 0;

    const renderPreview = (timestamp: number) => {
      if (lobbyCrtPreviewCore !== previewCore || romSelector?.style.display === 'none') {
        stopLobbyCrtPreview();
        return;
      }

      for (let step = 0; step < 2; step++) {
        emulatedFrames++;
        const startingGame = emulatedFrames >= 105 && emulatedFrames < 111;
        const running = emulatedFrames >= 165;
        const jumping = running && emulatedFrames % 105 < 24;
        previewCore.setButton(0, ControllerButton.Start, startingGame);
        previewCore.setButton(0, ControllerButton.Right, running);
        previewCore.setButton(0, ControllerButton.B, running);
        previewCore.setButton(0, ControllerButton.A, jumping);
        previewCore.frame();
      }
      previewCore.consumeAudioSamples();

      if (timestamp - lastRenderedAt >= 1000 / 30) {
        const memory = previewCore.getWasmMemory() as WebAssembly.Memory;
        const frameBuffer = new Uint8Array(
          memory.buffer,
          previewCore.getFrameBufferPtr(),
          previewCore.getFrameBufferLen(),
        );
        const rowStride = screenWidth * 4;
        const visibleStart = NES_OVERSCAN_TOP * rowStride;
        previewImage.data.set(frameBuffer.subarray(visibleStart, visibleStart + previewImage.data.length));
        crtContext.putImageData(previewImage, 0, 0);
        lastRenderedAt = timestamp;
      }

      lobbyCrtPreviewAnimationId = requestAnimationFrame(renderPreview);
    };

    crtButton?.classList.add('is-on');
    lobbyCrtPreviewAnimationId = requestAnimationFrame(renderPreview);
  } catch (error) {
    console.warn('[Lobby CRT] 預覽啟動失敗，保留黑屏:', error);
  } finally {
    lobbyCrtPreviewStarting = false;
  }
}

function stopLobbyCrtPreview(): void {
  if (lobbyCrtPreviewAnimationId !== null) {
    cancelAnimationFrame(lobbyCrtPreviewAnimationId);
    lobbyCrtPreviewAnimationId = null;
  }
  lobbyCrtPreviewCore?.free();
  lobbyCrtPreviewCore = null;
  document.getElementById('lobby-crt')?.classList.remove('is-on');
}

/**
 * 載入 ROM 列表
 */
async function loadRomList(): Promise<void> {
  const romListEl = document.getElementById('rom-list');
  const machineGridEl = document.getElementById('machine-grid');
  if (!romListEl) return;

  try {
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const primaryUrl = `${baseUrl}roms.json`;
    const fallbackUrl = new URL('roms.json', window.location.href).href;
    const fetchCatalog = async (url: string): Promise<Response> => {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('ROM 列表載入逾時')), 12000);
      });
      return Promise.race([fetch(url, { cache: 'no-store' }), timeout]);
    };

    let response = await fetchCatalog(primaryUrl);
    if (!response.ok && fallbackUrl !== new URL(primaryUrl, window.location.href).href) {
      response = await fetchCatalog(fallbackUrl);
    }
    if (!response.ok) {
      throw new Error('無法載入 ROM 列表');
    }
    
    const data: RomListResponse = await response.json();
    let metadata: GameMetadataResponse = { version: 1, games: {} };
    try {
      const metadataResponse = await fetch(`${baseUrl}game-metadata.json`, { cache: 'no-store' });
      if (metadataResponse.ok) metadata = await metadataResponse.json() as GameMetadataResponse;
    } catch (metadataError) {
      console.warn('遊戲 metadata 載入失敗，使用基本 ROM 清單:', metadataError);
    }
    romCatalog = data.roms.map(rom => ({
      ...rom,
      ...(metadata.games[rom.file] ?? {}),
    }));
    document.getElementById('lobby-crt')?.classList.toggle(
      'is-ready',
      romCatalog.some(rom => rom.file === LOBBY_MARIO_ROM_FILE),
    );
    renderMachineSelector();
    void startLobbyCrtPreview();
  } catch (error) {
    console.error('載入 ROM 列表失敗:', error);
    if (machineGridEl) machineGridEl.style.display = 'none';
    const browserHeader = document.getElementById('rom-browser-header');
    if (browserHeader) browserHeader.style.display = 'none';
    romListEl.style.display = 'block';
    romListEl.innerHTML = `
      <div class="rom-error">
        <p>無法載入遊戲列表</p>
        <p>請使用下方按鈕選擇 ROM 檔案</p>
      </div>
    `;
  }
}

/**
 * 渲染機台選擇畫面
 */
function renderMachineSelector(): void {
  const selectorEl = document.getElementById('rom-selector');
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  const coverHeader = document.querySelector('#rom-selector > .rom-selector-content > .rom-selector-header') as HTMLElement | null;
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  if (!machineGridEl || !romListEl) return;

  if (romCatalog.length === 0) {
    machineGridEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  if (browserHeader) {
    browserHeader.classList.remove('is-visible');
    browserHeader.style.removeProperty('display');
  }
  if (coverHeader) coverHeader.style.removeProperty('display');
  if (selectorEl) selectorEl.scrollTop = 0;
  if (scrollTopButton) {
    scrollTopButton.dataset.enabled = 'false';
    scrollTopButton.hidden = true;
  }
  romListEl.style.display = 'none';
  machineGridEl.style.display = 'grid';

  machineGridEl.innerHTML = MACHINES.map((machine) => {
    const count = romCatalog.filter((rom) => detectRomSystem(rom) === machine.key).length;
    const disabled = count === 0 ? 'disabled aria-disabled="true"' : '';
    return `
      <div class="machine-card-shell">
        <button class="machine-card" type="button" data-system="${machine.key}" ${disabled}>
          <span class="machine-folio">
            <span class="machine-section">${escapeHtml(machine.section)}</span>
            <span class="machine-year">${escapeHtml(machine.year)}</span>
            <span class="machine-issue">${escapeHtml(machine.issue)}</span>
          </span>
          <span class="machine-art ${machine.artClass}" aria-hidden="true">
            <img class="machine-art-img" src="${getPublicAssetUrl(`assets/machines/${machine.artFile}`)}" alt="" loading="eager" decoding="async">
          </span>
          <span class="machine-copy">
            <span class="machine-title">${escapeHtml(machine.title)}</span>
            <span class="machine-meta">${escapeHtml(machine.label)}</span>
          </span>
          <span class="machine-card-footer">
            <span class="machine-count"><b aria-hidden="true">■</b> ${count} GAMES</span>
            <span class="machine-tag">COLLECTOR'S ARCHIVE</span>
            <span class="machine-page">P.${escapeHtml(machine.page)}</span>
          </span>
        </button>
      </div>
    `;
  }).join('');

  machineGridEl.querySelectorAll('.machine-card').forEach((item) => {
    item.addEventListener('click', () => {
      const system = (item as HTMLElement).dataset.system as SystemKey | undefined;
      if (system) renderRomList(system);
    });
  });
}

/**
 * 渲染 ROM 列表
 */
function renderRomList(system: SystemKey): void {
  const selectorEl = document.getElementById('rom-selector');
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  const browserTitle = document.getElementById('rom-browser-title');
  const browserYear = document.getElementById('rom-browser-year');
  const browserIssue = document.getElementById('rom-browser-issue');
  const browserSummary = document.getElementById('rom-browser-summary');
  const browserArt = document.getElementById('rom-browser-art') as HTMLImageElement | null;
  const coverHeader = document.querySelector('#rom-selector > .rom-selector-content > .rom-selector-header') as HTMLElement | null;
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  if (!romListEl) return;

  const roms = romCatalog.filter((rom) => detectRomSystem(rom) === system);
  const machine = MACHINES.find((item) => item.key === system);
  if (scrollTopButton) {
    scrollTopButton.dataset.enabled = String(roms.length > 20);
    scrollTopButton.hidden = true;
  }

  if (machineGridEl) machineGridEl.style.display = 'none';
  if (coverHeader) coverHeader.style.display = 'none';
  if (selectorEl) selectorEl.scrollTop = 0;
  if (browserHeader) {
    browserHeader.classList.add('is-visible');
    browserHeader.style.removeProperty('display');
  }
  if (browserHeader) browserHeader.dataset.system = system;
  romListEl.dataset.system = system;
  if (browserTitle) browserTitle.textContent = machine?.title ?? '遊戲列表';
  if (browserYear) browserYear.textContent = machine?.year ?? '';
  if (browserIssue) browserIssue.textContent = machine?.issue ?? '';
  if (browserSummary) browserSummary.textContent = `本月精選 ${roms.length} 款作品`;
  if (browserArt && machine) browserArt.src = getPublicAssetUrl(`assets/machines/${machine.artFile}`);
  romListEl.style.display = 'grid';

  if (roms.length === 0) {
    romListEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  romListEl.innerHTML = roms.map((rom, index) => {
    const meta = getRomMagazineMeta(rom);
    const number = String(index + 1).padStart(3, '0');
    const coverUrl = getRomCoverUrl(rom);
    const coverMarkup = coverUrl
      ? `<img class="rom-cover-image" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async"><span class="rom-cover-placeholder" aria-hidden="true" hidden>${escapeHtml(getRomDisplayName(rom).slice(0, 18))}</span>`
      : `<span class="rom-cover-placeholder" aria-hidden="true">${escapeHtml(getRomDisplayName(rom).slice(0, 18))}</span>`;
    const description = rom.description?.trim() || '中文簡介待核對';
    return `
      <button class="rom-item" data-index="${index}" data-system="${system}" data-file="${encodeURIComponent(rom.file)}">
        <span class="rom-item-number">No.${number}</span>
        <span class="rom-cover-frame${coverUrl ? '' : ' is-missing'}">${coverMarkup}</span>
        <span class="rom-copy">
          <span class="rom-name">${escapeHtml(getRomDisplayName(rom))}</span>
          <span class="rom-description">${escapeHtml(description)}</span>
          <span class="rom-item-meta">
            <span><small>發售年份</small>${escapeHtml(meta.year)}</span>
            <span><small>遊戲類型</small>${escapeHtml(meta.genre)}</span>
          </span>
        </span>
      </button>
    `;
  }).join('');

  // 綁定點擊事件
  const items = romListEl.querySelectorAll('.rom-item');
  items.forEach(item => {
    item.addEventListener('click', async () => {
      const file = decodeURIComponent((item as HTMLElement).dataset.file || '');
      if (file) {
        await loadRomFromServer(file);
      }
    });
  });

  romListEl.querySelectorAll<HTMLImageElement>('.rom-cover-image').forEach(image => {
    image.addEventListener('error', () => {
      image.hidden = true;
      image.closest('.rom-cover-frame')?.classList.add('is-missing');
      const fallback = image.nextElementSibling as HTMLElement | null;
      if (fallback) fallback.hidden = false;
    }, { once: true });
  });
}

/**
 * 從伺服器載入 ROM（支援 ZIP）
 */
async function loadRomFromServer(filename: string): Promise<void> {
  const loadController = beginGameLoad();
  const rom = getRomCatalogEntry(filename);
  let loadingSequence = 0;
  try {
    loadingSequence = await showGameLoading(rom.name, '正在下載遊戲檔案…');
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(getRomAssetUrl(baseUrl, filename), { signal: loadController.signal });
    if (!response.ok) {
      throw new Error(`無法載入 ROM: ${filename}`);
    }
    
    const buffer = await readResponseWithProgress(response, loadingSequence);
    throwIfSignalAborted(loadController.signal);
    const lower = filename.toLowerCase();
    updateGameLoading(loadingSequence, '正在啟動模擬器…');

    if (isFbNeoArcadeRomName(filename)) {
      currentRomFilename = filename;
      await startFbNeoGame(filename, buffer, loadingSequence, loadController.signal);
      return;
    }

    if (lower.endsWith('.zip')) {
      // 解壓 ZIP
      updateGameLoading(loadingSequence, '正在解壓縮遊戲檔案…');
      const zip = await JSZip.loadAsync(buffer);
      const romExtensions = ['.nes', '.smc', '.sfc', '.fig', '.gb', '.gbc', '.gg', '.sms', '.md', '.gen', '.smd', '.z64', '.n64', '.v64'];
      let romFile: JSZip.JSZipObject | null = null;
      let romFileName = '';

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const nameLower = name.toLowerCase();
        if (romExtensions.some(ext => nameLower.endsWith(ext))) {
          romFile = entry;
          romFileName = name;
          break;
        }
      }

      if (!romFile) {
        await showAppAlert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      const romBuffer = await romFile.async('arraybuffer', metadata => {
        updateGameLoadingProgress(
          loadingSequence,
          metadata.percent,
          `正在解壓縮遊戲檔案… ${Math.round(metadata.percent)}%`,
        );
      });
      throwIfSignalAborted(loadController.signal);
      currentRomFilename = romFileName.split('/').pop() || romFileName;
      updateGameLoading(loadingSequence, '正在啟動模擬器…');
      await startGame(romBuffer, loadController.signal);
    } else {
      currentRomFilename = filename;
      await startGame(buffer, loadController.signal);
    }
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('載入 ROM 失敗:', error);
    await showAppAlert('載入遊戲失敗，請重試');
  } finally {
    if (gameLoadAbortController === loadController) gameLoadAbortController = null;
    if (loadingSequence > 0) hideGameLoading(loadingSequence);
  }
}

/**
 * 從檔案載入 ROM（支援 ZIP）
 */
async function loadRomFromFile(file: File): Promise<void> {
  const loadController = beginGameLoad();
  const rom = getRomCatalogEntry(file.name, file.name);
  let loadingSequence = 0;
  try {
    loadingSequence = await showGameLoading(rom.name, '正在讀取遊戲檔案…');
    const lower = file.name.toLowerCase();
    let buffer: ArrayBuffer;
    let romName = file.name;

    if (lower.endsWith('.zip')) {
      if (isFbNeoArcadeRomName(file.name)) {
        const zipBuffer = await file.arrayBuffer();
        throwIfSignalAborted(loadController.signal);
        currentRomFilename = file.name;
        updateGameLoading(loadingSequence, '正在啟動模擬器…');
        await startFbNeoGame(file.name, zipBuffer, loadingSequence, loadController.signal);
        return;
      }

      // 解壓 ZIP，找第一個遊戲檔案
      updateGameLoading(loadingSequence, '正在解壓縮遊戲檔案…');
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const romExtensions = ['.nes', '.smc', '.sfc', '.fig', '.gb', '.gbc', '.gg', '.sms', '.md', '.gen', '.smd', '.z64', '.n64', '.v64'];
      let romFile: JSZip.JSZipObject | null = null;
      let romFileName = '';

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const nameLower = name.toLowerCase();
        if (romExtensions.some(ext => nameLower.endsWith(ext))) {
          romFile = entry;
          romFileName = name;
          break;
        }
      }

      if (!romFile) {
        await showAppAlert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      buffer = await romFile.async('arraybuffer', metadata => {
        updateGameLoadingProgress(
          loadingSequence,
          metadata.percent,
          `正在解壓縮遊戲檔案… ${Math.round(metadata.percent)}%`,
        );
      });
      throwIfSignalAborted(loadController.signal);
      // Use the actual ROM filename inside the ZIP for extension detection
      romName = romFileName.split('/').pop() || romFileName;
    } else {
      buffer = await file.arrayBuffer();
    }

    currentRomFilename = romName;
    updateGameLoading(loadingSequence, '正在啟動模擬器…');
    await startGame(buffer, loadController.signal);
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('載入 ROM 失敗:', error);
    await showAppAlert('載入遊戲失敗，請重試');
  } finally {
    if (gameLoadAbortController === loadController) gameLoadAbortController = null;
    if (loadingSequence > 0) hideGameLoading(loadingSequence);
  }
}

async function startFbNeoGame(
  archiveName: string,
  zipData: ArrayBuffer,
  loadingSequence: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!canvas || !ctx) return;
  let coreInstance: FbNeoArcadeCore | null = null;

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  activeBackend = 'fbneo';
  arcadeInputP1 = 0;
  arcadeInputP2 = 0;
  arcadeGamepadInputP1 = 0;
  clearAudioQueue();

  try {
    throwIfSignalAborted(signal);
    coreInstance = new FbNeoArcadeCore();
    fbneoCore = coreInstance;
    const romSet = await extractFbNeoRomSet(archiveName, zipData);
    throwIfSignalAborted(signal);
    currentFbNeoRomSet = romSet;
    currentRomFilename = archiveName;

    const validity = await coreInstance.checkRomValidity(romSet);
    throwIfSignalAborted(signal);
    if (!validity.ok) {
      activeBackend = 'wasm';
      console.error(`[FBNeo] ROM 校驗失敗:\n${validity.log}`);
      await showAppAlert(`FBNeo 無法識別 ${archiveName}\n\n${validity.log}`);
      return;
    }

    const loaded = await coreInstance.loadGame(romSet.gameName);
    throwIfSignalAborted(signal);
    if (!loaded) {
      activeBackend = 'wasm';
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
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
    ctx.imageSmoothingEnabled = false;
    imageData = ctx.createImageData(canvasWidth, canvasHeight);

    hideRomSelector();
    updateControllerLayout();
    powerLed?.classList.add('on');
    updateGameLoading(loadingSequence, '正在準備遊戲畫面…');
    await warmUpFbNeoVideo(coreInstance, signal);
    throwIfSignalAborted(signal);
    updateArcadeButtonCount(coreInstance.getFireButtonCount());
    renderFbNeoFrame();
    await nextAnimationFrameOrTimeout();
    console.log(`[FBNeo] ${romSet.gameName} loaded: ${width}x${height}${arcadeRotation === 'none' ? '' : ` rotated-${arcadeRotation}`}`);
    showToast(`FBNeo: ${romSet.gameName} OK`);
    startEmulation();
  } catch (error) {
    if (fbneoCore === coreInstance) {
      activeBackend = 'wasm';
      stopFbNeoBackend();
    }
    if (isAbortError(error)) return;
    console.error('[FBNeo] 啟動失敗:', error);
    await showAppAlert(error instanceof Error ? error.message : 'FBNeo 啟動失敗');
  }
}

/**
 * 開始遊戲
 */
async function startGame(
  romData: ArrayBuffer,
  signal?: AbortSignal,
): Promise<void> {
  throwIfSignalAborted(signal);
  textOverlay?.dispose();
  textOverlay = null;
  activeGamePresentation = null;
  const romBytes = new Uint8Array(romData);
  
  // 根據副檔名選擇對應的載入方法
  const lower = currentRomFilename.toLowerCase();
  console.log(`[DEBUG] Loading ROM: "${currentRomFilename}", lower: "${lower}", size: ${romBytes.length}`);
  if (isN64RomName(currentRomFilename)) {
    await startN64Game(romData);
    return;
  }

  if (lower.endsWith('.md') || lower.endsWith('.gen') || lower.endsWith('.smd')) {
    await startSnes9xGame(romData, 'genesis', signal);
    return;
  }

  const isSnesRom = lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.fig');
  if (isSnesRom && shouldUseSnes9x(romBytes, currentRomFilename)) {
    await startSnes9xGame(romData, 'snes', signal);
    return;
  }

  if (!(await waitForWasmCore()) || !nes) {
    await showAppAlert('模擬器核心尚未初始化完成，請稍候再試。');
    return;
  }

  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  activeBackend = 'wasm';
  let preparedProfile: PreparedGameProfile | null = null;
  let preparedRomBytes: Uint8Array = romBytes;
  let localizationAssets: LocalizationAssets | null = null;
  if (lower.endsWith('.nes')) {
    try {
      if (CT2_SOURCE_HASHES.includes(await sha256Hex(romBytes))) {
        // This route deliberately runs the ORIGINAL ROM. No BPS or font patch.
        const base = 'game-profiles/captain-tsubasa-2-jp/';
        const [catalog, runtime, menus] = await Promise.all(['localization.json', 'text-runtime.json', 'menus.json'].map(async name => {
          const response = await fetch(new URL(base + name, window.location.href), { signal });
          if (!response.ok) throw new Error(`localization HTTP ${response.status}`);
          return response.json();
        }));
        if (menus.sourceSha256 !== CT2_SOURCE_HASHES[0] || menus.format !== 'ct2-original-menu-definitions'
          || !Array.isArray(menus.entries) || menus.entries.length > 1000) throw new Error('選單來源不符');
        localizationAssets = { catalog, runtime, menus };
        validateLocalizationAssets(localizationAssets);
      } else {
        preparedProfile = await prepareGameProfileForRom(romBytes, signal);
        if (preparedProfile) preparedRomBytes = preparedProfile.romBytes;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn('[NES] 遊戲設定檔準備失敗，將使用原始 ROM 執行', error);
      preparedProfile = null;
      preparedRomBytes = romBytes;
      localizationAssets = null;
    }
  }
  let loaded = false;
  if (lower.endsWith('.gg')) {
    loaded = nes.loadGgRom(romBytes);
  } else if (lower.endsWith('.sms')) {
    loaded = nes.loadSmsRom(romBytes);
  } else if (isSnesRom) {
    console.log(`[SNES] Attempting loadSnesRom, data size: ${romBytes.length}, first 4 bytes: ${romBytes[0].toString(16)} ${romBytes[1].toString(16)} ${romBytes[2].toString(16)} ${romBytes[3].toString(16)}`);
    try {
      loaded = nes.loadSnesRom(romBytes);
      console.log(`[SNES] loadSnesRom returned: ${loaded}`);
    } catch (e) {
      console.error('[SNES] loadSnesRom threw:', e);
    }
  } else {
    try {
      loaded = nes.loadRom(preparedRomBytes);
    } catch (error) {
      if (!lower.endsWith('.nes')) throw error;
      console.warn(`[NES] 原生 WASM 核心拒絕 ${currentRomFilename}，改用 FCEUmm`, error);
      await startSnes9xGame(romData, 'nes', signal);
      return;
    }
  }

  if (!loaded && isSnesRom) {
    throwIfSignalAborted(signal);
    console.warn(`[SNES] 原生 WASM 核心不支援 ${currentRomFilename}，改用 Snes9x`);
    await startSnes9xGame(romData, 'snes', signal);
    return;
  }

  if (!loaded && lower.endsWith('.nes')) {
    throwIfSignalAborted(signal);
    console.warn(`[NES] 原生 WASM 核心不支援 ${currentRomFilename}，改用 FCEUmm`);
    await startSnes9xGame(romData, 'nes', signal);
    return;
  }

  if (loaded) {
    // 取得核心類型及對應的螢幕尺寸
    const coreType = nes.getCoreType();
    if (coreType === 'nes' && preparedProfile) {
      try {
        activatePreparedGameProfile(preparedProfile);
      } catch (error) {
        if (isAbortError(error)) throw error;
        console.warn(`[NES] 遊戲設定檔載入失敗，將使用原始 ROM 執行`, error);
      }
    }
    const screenW = nes.getScreenWidth();
    const screenH = nes.getScreenHeight();
    const displayH = coreType === 'nes'
      ? screenH - NES_OVERSCAN_TOP - NES_OVERSCAN_BOTTOM
      : screenH;
    console.log(`ROM 載入成功 [${coreType.toUpperCase()}] ${screenW}×${screenH}，開始執行`);

    // 更新 Canvas 與 ImageData 為對應尺寸
    if (canvas && ctx) {
      canvas.width = screenW;
      canvas.height = displayH;
      ctx.imageSmoothingEnabled = false;
      imageData = ctx.createImageData(screenW, displayH);
      canvas.style.aspectRatio = coreType === 'nes' ? '4 / 3' : `${screenW} / ${displayH}`;
    }

    if (coreType === 'nes' && localizationAssets && canvas && nes.enableTextObserver(true)) {
      textOverlay = new NesTextOverlay(canvas, localizationAssets);
    }
    
    // 隱藏選擇器，顯示遊戲畫面
    hideRomSelector();
    
    // 根據核心類型切換控制器外觀
    updateControllerLayout();
    
    // 確保音頻系統設定正確
    if (audioContext) {
      nes.setAudioSampleRate(audioContext.sampleRate);
      resumeAudio();
    }
    
    // 開啟電源指示燈
    powerLed?.classList.add('on');
    
    // 重置音頻環形緩衝區（避免上一局殘留音頻）
    clearAudioQueue();
    
    // 開始模擬
    startEmulation();

    // 載入 SRAM（遊戲內建電池存檔）
    loadSram();

  } else {
    console.error('ROM 載入失敗');
    await showAppAlert('此 ROM 格式、Mapper 或特殊晶片目前不受支援。');
  }
}

async function startSnes9xGame(
  romData: ArrayBuffer,
  core: EmulatorJsCore = 'snes',
  signal?: AbortSignal,
): Promise<void> {
  const screen = document.getElementById('screen');
  const host = screen?.parentElement;
  if (!screen || !host) throw new Error('找不到遊戲畫面容器');

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  activeBackend = 'snes9x';
  emulatorJsCore = core;
  screen.style.display = 'none';
  hideRomSelector();

  try {
    snes9xBackend = await startSnes9xBackend(host, romData, currentRomFilename, core, signal);
    isRunning = true;
    hideRomSelector();
    updateControllerLayout();
    powerLed?.classList.add('on');
    showToast(core === 'genesis' ? 'Mega Drive 核心已啟動' : core === 'nes' ? 'FC 核心已啟動' : 'SFC 核心已啟動');
  } catch (error) {
    activeBackend = 'wasm';
    await stopSnes9xBackend();
    throw error;
  }
}

async function startN64Game(romData: ArrayBuffer, forceNpmRuntime = false): Promise<void> {
  if (!hasN64RomMagic(romData)) {
    throw new Error(`無效的 N64 ROM 資料: ${currentRomFilename}`);
  }

  if (!canvas) return;

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  let startupDiagnosticLabel: string | null = null;

  const graphicsCapability = getN64GraphicsCapability();
  if (!graphicsCapability.supported) {
    hideRomSelector();
    powerLed?.classList.remove('on');
    isRunning = false;
    currentN64RomData = null;
    drawN64GraphicsError(graphicsCapability.message);
    showToast('N64 圖形初始化失敗');
    console.warn(`[N64] ${graphicsCapability.message}`);
    return;
  }

  console.log(`[N64] WebGL2 renderer: ${graphicsCapability.renderer ?? 'unknown'}`);

  try {
    activeBackend = 'mupen64';
    currentN64RomData = romData;
    const benchmarkConfig = resolveN64BenchmarkConfig(selectN64PerformanceProfile());
    const useRebuiltRuntime = benchmarkConfig.runtime === 'fork' && !forceNpmRuntime;
    if (benchmarkConfig.enabled) {
      benchmarkConfig.label += useRebuiltRuntime ? '/fork' : '/npm';
      startupDiagnosticLabel = benchmarkConfig.label;
    }
    n64PerformanceProfile = benchmarkConfig.profile;
    n64BenchmarkSession = benchmarkConfig.enabled
      ? createN64BenchmarkSession(
        benchmarkConfig.label,
        benchmarkConfig.warmupMs,
        benchmarkConfig.sampleMs,
      )
      : null;
    console.log(
      `[N64] performance profile: ${n64PerformanceProfile.name} ` +
      `(${n64PerformanceProfile.width}x${n64PerformanceProfile.height}, ` +
      `frame skip: ${n64PerformanceProfile.skipFrame ? 'on' : 'off'})`,
    );
    if (benchmarkConfig.enabled) {
      console.info(
        `[N64 benchmark] ${benchmarkConfig.label}; ` +
        `${benchmarkConfig.warmupMs / 1000} seconds warmup + ` +
        `${benchmarkConfig.sampleMs / 1000} seconds sample`,
      );
      if (benchmarkConfig.mobileTest !== null) {
        const mobileTestLabel = benchmarkConfig.mobileTest === 'baseline'
          ? '基準版'
          : benchmarkConfig.mobileTest === 'stream' ? 'Triangle 串流版' : '完整串流版';
        showToast(
          `N64 手機測試：${mobileTestLabel}`,
        );
      }
    }

    // Mupen64Plus-web 內部 SDL/Emscripten 程式碼會尋找 id="canvas"。
    // 原本的 #screen 已建立 2D context，瀏覽器不允許同一張 canvas 再切成 WebGL，
    // 因此 N64 模式必須替換成全新的 WebGL canvas，否則會在 EGL 層得到 BAD_MATCH。
    const n64Canvas = activateN64Canvas(n64PerformanceProfile);
    if (benchmarkConfig.enabled) {
      removeN64BenchmarkDiagnostics = installN64BenchmarkDiagnostics(
        n64Canvas,
        benchmarkConfig.label,
      );
    }

    hideRomSelector();
    updateControllerLayout();
    await settleN64CanvasLayout(n64Canvas);
    powerLed?.classList.add('on');
    isRunning = true;

    const baseUrl = import.meta.env.BASE_URL;
    await ensureMupen64Config(baseUrl, n64PerformanceProfile);
    const runtimeModule: typeof import('mupen64plus-web') = useRebuiltRuntime
      ? await import(/* @vite-ignore */ getN64RuntimeImportUrl(document.baseURI, baseUrl))
      : await import('mupen64plus-web');
    const createMupen64PlusWeb = runtimeModule.default;
    console.info(`[N64] runtime: ${useRebuiltRuntime ? 'rebuilt fork' : 'npm 1.5.7'}`);
    let n64CanvasReady = false;
    const finalizeN64Canvas = () => {
      if (n64CanvasReady) return;
      n64CanvasReady = true;
      lockN64RenderSize(n64Canvas, n64PerformanceProfile);
      document.body.classList.remove('n64-initializing');
      resumeAudio();
    };
    n64Controls = await createMupen64PlusWeb({
      canvas: n64Canvas,
      romData,
      beginStats: () => {
        finalizeN64Canvas();
        n64Telemetry.beginStats();
      },
      endStats: (
        numberOfRecompiles: number,
        rspMs?: number,
        dlistMs?: number,
        rdpMs?: number,
        presentMs?: number,
        audioMs?: number,
        triangleDrawMs?: number,
        rectDrawMs?: number,
        trianglePrepareMs?: number,
        triangleUploadMs?: number,
        triangleSubmitMs?: number,
        triangleRestoreMs?: number,
        triangleDrawCalls?: number,
        rectDrawCalls?: number,
        audioUnderruns?: number,
        audioCallbackCount?: number,
        audioPartialUnderruns?: number,
        audioEmptyUnderruns?: number,
        audioMaxCallbackGapMs?: number,
      ) => n64Telemetry.endStats(
        numberOfRecompiles,
        rspMs,
        dlistMs,
        rdpMs,
        presentMs,
        audioMs,
        triangleDrawMs,
        rectDrawMs,
        trianglePrepareMs,
        triangleUploadMs,
        triangleSubmitMs,
        triangleRestoreMs,
        triangleDrawCalls,
        rectDrawCalls,
        audioUnderruns,
        audioCallbackCount,
        audioPartialUnderruns,
        audioEmptyUnderruns,
        audioMaxCallbackGapMs,
      ),
      // null-video只供fork benchmark判斷renderer理論上限；正常遊玩固定使用Rice。
      arguments: [
        '--gfx',
        benchmarkConfig.nullVideo
          ? 'dummy'
          : '/plugins/mupen64plus-video-rice-web-netplay-web.so',
      ],
      romConfigOptionOverrides: {
        videoRice: {
          SuppressDrawCalls: benchmarkConfig.suppressDrawCalls ? 1 : 0,
          PersistentBuffers: benchmarkConfig.persistentBuffers ? 1 : 0,
          PersistentRectBuffers: benchmarkConfig.persistentRectBuffers ? 1 : 0,
        },
      },
      coreConfig: {
        // iOS 預設使用量測較穩定的 cached interpreter；benchmark 可明確切換 1/2 做 A/B。
        emuMode: benchmarkConfig.emuMode,
        // 高更新率手機若綁定 requestAnimationFrame，可能每秒執行 90/120 次 VI。
        // 1ms timer 讓模擬器依 N64 自身節流，不跟著螢幕更新率增加 CPU 負載。
        mainLoopTimingMode: n64PerformanceProfile.mainLoopTimingMode,
      },
      netplayConfig: { player: 0 },
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          return getN64RuntimeAssetUrl(baseUrl, path, useRebuiltRuntime);
        }
        return prefix + path;
      },
      setErrorStatus: (message: string) => {
        console.error('[N64/Mupen64Plus]', message);
        if (benchmarkConfig.enabled) {
          postN64Diagnostic('mupen-error-status', message, benchmarkConfig.label);
        }
      },
    });

    configureN64AudioWorklet();
    console.log(`[N64] Mupen64Plus-web backend ready for ${currentRomFilename}`);
    resumeAudio();
    await settleN64CanvasLayout(n64Canvas);
    lockN64RenderSize(n64Canvas, n64PerformanceProfile);
    void n64Controls.start().catch((error) => {
      console.error('[N64] Mupen64Plus start failed:', error);
      if (benchmarkConfig.enabled) {
        postN64Diagnostic('mupen-start-failure', error, benchmarkConfig.label);
      }
      showToast('N64 啟動失敗');
    });
  } catch (error) {
    console.error('[N64] Mupen64Plus backend failed:', error);
    if (startupDiagnosticLabel) {
      postN64Diagnostic('backend-startup-failure', error, startupDiagnosticLabel);
    }
    await stopN64Backend();
    if (shouldRetryN64WithNpm(navigator.userAgent, forceNpmRuntime)) {
      console.warn('[N64] rebuilt Android runtime failed; retrying npm 1.5.7 runtime');
      showToast('N64 相容模式重試中');
      await startN64Game(romData, true);
      return;
    }
    await showRomSelector();
    await showAppAlert('N64 模擬器啟動失敗，請查看主控台錯誤');
  }
}

async function ensureMupen64Config(
  baseUrl: string,
  profile: N64PerformanceProfile,
): Promise<void> {
  const response = await fetch(`${baseUrl}n64-mupen/mupen64plus.cfg`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`無法載入 N64 設定檔: ${response.status}`);
  }

  const configText = applyN64PerformanceProfile(await response.text(), profile);
  if (!configText.includes('mupen64plus-video-rice-web-netplay-web.so')) {
    throw new Error('N64 設定檔沒有指定 Rice video plugin');
  }

  await putMupenIdbFile('/mupen64plus/data/mupen64plus.cfg', new TextEncoder().encode(configText));
}

function putMupenIdbFile(fileKey: string, contents: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('/mupen64plus');

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) {
        const store = db.createObjectStore('FILE_DATA');
        store.createIndex('timestamp', 'timestamp', { unique: false, multiEntry: false });
        store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/saves');
        store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/data');
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('FILE_DATA', 'readwrite');
      const store = transaction.objectStore('FILE_DATA');

      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/saves');
      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/data');
      store.put({ contents, timestamp: new Date(), mode: 33206 }, fileKey);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

async function stopN64Backend(): Promise<void> {
  releaseAllN64Inputs();
  n64Telemetry.reset();
  n64BenchmarkSession = null;
  removeN64BenchmarkDiagnostics?.();
  removeN64BenchmarkDiagnostics = null;
  if (n64Controls) {
    try {
      await n64Controls.forceDumpSaveFiles?.();
    } catch (error) {
      console.warn('[N64] 儲存 Mupen64Plus 存檔時發生問題:', error);
    }

    try {
      n64Controls.stop();
    } catch (error) {
      console.warn('[N64] 停止 Mupen64Plus 時發生問題:', error);
    }
    n64Controls = null;
  }
  currentN64RomData = null;

  restoreWasmCanvas();
  if (activeBackend === 'mupen64') {
    activeBackend = 'wasm';
  }
}

/**
 * 隱藏 ROM 選擇器
 */
function hideRomSelector(): void {
  stopLobbyCrtPreview();
  if (romSelector) romSelector.style.display = 'none';
  if (gameboyShell) gameboyShell.style.removeProperty('display');
  updateIOSInstallHint();
}

/**
 * 顯示 ROM 選擇器
 */
async function showRomSelector(): Promise<void> {
  cancelPendingGameLoad();
  if (!isSnes9xActive()) saveSram();
  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  clearAudioQueue();
  currentN64RomData = null;
  powerLed?.classList.remove('on');
  if (romCatalog.length > 0) renderMachineSelector();
  if (romSelector) romSelector.style.display = 'flex';
  if (gameboyShell) gameboyShell.style.display = 'none';
  updateIOSInstallHint();
  void startLobbyCrtPreview();
}

async function confirmReturnToMachineMenu(): Promise<void> {
  if (await showAppConfirm('是否返回遊戲主機選單')) {
    await showRomSelector();
  }
}

// ===== 虛擬控制器 (多點觸控支援) =====

// 追蹤活躍的觸控點
interface TouchState {
  identifier: number;
  element: string;  // 'dpad', 'a', 'b', 'start', 'select'
}

const activeTouches: Map<number, TouchState> = new Map();

// D-Pad 方向狀態
interface DpadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

let currentDpadState: DpadState = { up: false, down: false, left: false, right: false };

/**
 * 設定虛擬控制器 (支援多點觸控)
 */
function setupVirtualController(): void {
  // 設定 D-Pad 觸控區域 (支援斜向)
  setupDpad();
  
  // 設定 A/B 按鈕 (支援同時按)
  setupABButtons();
  
  // 設定功能按鈕 (Select/Start)
  setupFunctionButtons();

  // 防止頁面捲動
  const virtualController = document.getElementById('virtual-controller');
  virtualController?.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
}

/**
 * 設定 D-Pad (區域偵測，支援斜向輸入)
 */
function setupDpad(): void {
  const dpadArea = document.getElementById('dpad-touch-area');
  const dpad = document.getElementById('dpad');
  if (!dpadArea || !dpad) return;

  const updateDpadFromTouch = (touch: Touch) => {
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    
    // 計算距離中心的距離
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = rect.width / 2;
    
    // 死區：距離中心太近時不觸發
    const deadZone = maxRadius * 0.15;
    
    const newState: DpadState = { up: false, down: false, left: false, right: false };
    
    if (distance > deadZone) {
      // 計算角度 (-180 到 180)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // 45 度分割，支援 8 方向
      // 右: -22.5 到 22.5
      // 右下: 22.5 到 67.5
      // 下: 67.5 到 112.5
      // 左下: 112.5 到 157.5
      // 左: 157.5 到 180 或 -180 到 -157.5
      // 左上: -157.5 到 -112.5
      // 上: -112.5 到 -67.5
      // 右上: -67.5 到 -22.5
      
      if (angle >= -22.5 && angle < 22.5) {
        newState.right = true;
      } else if (angle >= 22.5 && angle < 67.5) {
        newState.right = true;
        newState.down = true;
      } else if (angle >= 67.5 && angle < 112.5) {
        newState.down = true;
      } else if (angle >= 112.5 && angle < 157.5) {
        newState.left = true;
        newState.down = true;
      } else if (angle >= 157.5 || angle < -157.5) {
        newState.left = true;
      } else if (angle >= -157.5 && angle < -112.5) {
        newState.left = true;
        newState.up = true;
      } else if (angle >= -112.5 && angle < -67.5) {
        newState.up = true;
      } else if (angle >= -67.5 && angle < -22.5) {
        newState.right = true;
        newState.up = true;
      }
    }
    
    applyDpadState(newState);
  };

  const clearDpad = () => {
    const newState: DpadState = { up: false, down: false, left: false, right: false };
    applyDpadState(newState);
  };

  // 觸控開始
  dpadArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      activeTouches.set(touch.identifier, { identifier: touch.identifier, element: 'dpad' });
      updateDpadFromTouch(touch);
    }
  }, { passive: false });

  // 觸控移動 (支援滑動改變方向)
  dpadArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      if (activeTouches.get(touch.identifier)?.element === 'dpad') {
        updateDpadFromTouch(touch);
      }
    }
  }, { passive: false });

  // 觸控結束
  dpadArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      if (activeTouches.get(touch.identifier)?.element === 'dpad') {
        activeTouches.delete(touch.identifier);
        // 檢查是否還有其他 D-Pad 觸控
        const remainingDpadTouches = Array.from(activeTouches.values()).filter(t => t.element === 'dpad');
        if (remainingDpadTouches.length === 0) {
          clearDpad();
        }
      }
    }
  }, { passive: false });

  dpadArea.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      activeTouches.delete(touch.identifier);
    }
    clearDpad();
  }, { passive: false });

  // 滑鼠事件 (用於電腦測試)
  let mouseDown = false;
  dpadArea.addEventListener('mousedown', (e) => {
    e.preventDefault();
    mouseDown = true;
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = rect.width / 2;
    const deadZone = maxRadius * 0.15;
    
    const newState: DpadState = { up: false, down: false, left: false, right: false };
    
    if (distance > deadZone) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle >= -22.5 && angle < 22.5) newState.right = true;
      else if (angle >= 22.5 && angle < 67.5) { newState.right = true; newState.down = true; }
      else if (angle >= 67.5 && angle < 112.5) newState.down = true;
      else if (angle >= 112.5 && angle < 157.5) { newState.left = true; newState.down = true; }
      else if (angle >= 157.5 || angle < -157.5) newState.left = true;
      else if (angle >= -157.5 && angle < -112.5) { newState.left = true; newState.up = true; }
      else if (angle >= -112.5 && angle < -67.5) newState.up = true;
      else if (angle >= -67.5 && angle < -22.5) { newState.right = true; newState.up = true; }
    }
    applyDpadState(newState);
  });

  document.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = rect.width / 2;
    const deadZone = maxRadius * 0.15;
    
    const newState: DpadState = { up: false, down: false, left: false, right: false };
    
    if (distance > deadZone && distance < maxRadius * 1.5) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle >= -22.5 && angle < 22.5) newState.right = true;
      else if (angle >= 22.5 && angle < 67.5) { newState.right = true; newState.down = true; }
      else if (angle >= 67.5 && angle < 112.5) newState.down = true;
      else if (angle >= 112.5 && angle < 157.5) { newState.left = true; newState.down = true; }
      else if (angle >= 157.5 || angle < -157.5) newState.left = true;
      else if (angle >= -157.5 && angle < -112.5) { newState.left = true; newState.up = true; }
      else if (angle >= -112.5 && angle < -67.5) newState.up = true;
      else if (angle >= -67.5 && angle < -22.5) { newState.right = true; newState.up = true; }
    }
    applyDpadState(newState);
  });

  document.addEventListener('mouseup', () => {
    if (mouseDown) {
      mouseDown = false;
      clearDpad();
    }
  });
}

/**
 * 套用 D-Pad 狀態並更新視覺
 */
function applyDpadState(newState: DpadState): void {
  if (isFbNeoActive()) {
    setArcadeInputBit(ArcadeInputBit.Up, newState.up);
    setArcadeInputBit(ArcadeInputBit.Down, newState.down);
    setArcadeInputBit(ArcadeInputBit.Left, newState.left);
    setArcadeInputBit(ArcadeInputBit.Right, newState.right);
  }

  // 更新控制器（透過 WASM 介面）
  if (!isFbNeoActive() && newState.up !== currentDpadState.up) {
    setNesButton(ControllerButton.Up, newState.up);
  }
  if (!isFbNeoActive() && newState.down !== currentDpadState.down) {
    setNesButton(ControllerButton.Down, newState.down);
  }
  if (!isFbNeoActive() && newState.left !== currentDpadState.left) {
    setNesButton(ControllerButton.Left, newState.left);
  }
  if (!isFbNeoActive() && newState.right !== currentDpadState.right) {
    setNesButton(ControllerButton.Right, newState.right);
  }
  
  // 更新視覺
  document.getElementById('dpad-up')?.classList.toggle('pressed', newState.up);
  document.getElementById('dpad-down')?.classList.toggle('pressed', newState.down);
  document.getElementById('dpad-left')?.classList.toggle('pressed', newState.left);
  document.getElementById('dpad-right')?.classList.toggle('pressed', newState.right);
  
  currentDpadState = { ...newState };
}

/**
 * 設定 A/B 按鈕 (支援多點觸控同時按)
 */
interface ThumbContactButton {
  id: string;
  element: HTMLElement;
  setPressed: (pressed: boolean) => void;
}

function setupThumbContactButtons(container: HTMLElement | null, buttons: ThumbContactButton[]): void {
  if (!container || buttons.length === 0 || container.dataset.thumbContactWired) return;
  container.dataset.thumbContactWired = '1';

  const touchHits = new Map<number, Set<string>>();
  const pressedStates = new Map(buttons.map(button => [button.id, false]));

  const syncPressedStates = () => {
    for (const button of buttons) {
      const pressed = Array.from(touchHits.values()).some(hits => hits.has(button.id));
      if (pressedStates.get(button.id) === pressed) continue;
      pressedStates.set(button.id, pressed);
      button.setPressed(pressed);
      button.element.classList.toggle('pressed', pressed);
    }
  };

  const updateTouchHits = (touch: Touch) => {
    touchHits.set(touch.identifier, getTouchContactTargetIds(
      touch,
      buttons.map(button => ({ id: button.id, rect: button.element.getBoundingClientRect() })),
    ));
  };

  container.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    for (const touch of Array.from(event.changedTouches)) updateTouchHits(touch);
    syncPressedStates();
  }, { passive: false });

  container.addEventListener('touchmove', (event) => {
    event.preventDefault();
    event.stopPropagation();
    for (const touch of Array.from(event.changedTouches)) updateTouchHits(touch);
    syncPressedStates();
  }, { passive: false });

  const releaseTouches = (event: TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    for (const touch of Array.from(event.changedTouches)) touchHits.delete(touch.identifier);
    syncPressedStates();
  };

  container.addEventListener('touchend', releaseTouches, { passive: false });
  container.addEventListener('touchcancel', releaseTouches, { passive: false });

  for (const button of buttons) {
    button.element.addEventListener('mousedown', (event) => {
      event.preventDefault();
      button.setPressed(true);
      button.element.classList.add('pressed');
    });
    button.element.addEventListener('mouseup', (event) => {
      event.preventDefault();
      button.setPressed(false);
      button.element.classList.remove('pressed');
    });
    button.element.addEventListener('mouseleave', () => {
      button.setPressed(false);
      button.element.classList.remove('pressed');
    });
  }
}

function setupABButtons(): void {
  const btnA = document.getElementById('btn-a');
  const btnB = document.getElementById('btn-b');
  const buttons: ThumbContactButton[] = [];

  for (const { id, element, buttonType } of [
    { id: 'a', element: btnA, buttonType: ControllerButton.A },
    { id: 'b', element: btnB, buttonType: ControllerButton.B },
  ]) {
    if (!element) continue;
    buttons.push({
      id,
      element,
      setPressed: (pressed) => {
        if (isFbNeoActive()) {
          setArcadeInputBit(buttonType === ControllerButton.A ? ArcadeInputBit.ButtonA : ArcadeInputBit.ButtonB, pressed);
        } else {
          setNesButton(buttonType, pressed);
        }
      },
    });
  }

  setupThumbContactButtons(document.getElementById('ab-buttons'), buttons);
}

/**
 * 設定功能按鈕 (Select/Start)
 */
function setupFunctionButtons(): void {
  const buttons = document.querySelectorAll('[data-btn="select"], [data-btn="start"]');
  
  buttons.forEach(btn => {
    const button = btn as HTMLElement;
    const btnType = button.dataset.btn;
    const buttonEnum = btnType === 'start' ? ControllerButton.Start : ControllerButton.Select;
    const setPressed = (pressed: boolean) => {
      if (isFbNeoActive()) {
        setArcadeInputBit(btnType === 'start' ? ArcadeInputBit.Start : ArcadeInputBit.Coin, pressed);
      } else {
        setNesButton(buttonEnum, pressed);
      }
    };

    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setPressed(true);
      button.classList.add('pressed');
    }, { passive: false });

    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      setPressed(false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      setPressed(false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setPressed(true);
      button.classList.add('pressed');
    });

    button.addEventListener('mouseup', (e) => {
      e.preventDefault();
      setPressed(false);
      button.classList.remove('pressed');
    });

    button.addEventListener('mouseleave', () => {
      setPressed(false);
      button.classList.remove('pressed');
    });
  });
}

/**
 * 處理按鈕按下/釋放 (保留給其他用途)
 */
function handleButtonPress(btnType: string, pressed: boolean): void {
  if (isFbNeoActive()) {
    const arcadeButtonMap: Record<string, number> = {
      'up': ArcadeInputBit.Up,
      'down': ArcadeInputBit.Down,
      'left': ArcadeInputBit.Left,
      'right': ArcadeInputBit.Right,
      'a': ArcadeInputBit.ButtonA,
      'b': ArcadeInputBit.ButtonB,
      'c': ArcadeInputBit.ButtonC,
      'd': ArcadeInputBit.ButtonD,
      'e': ArcadeInputBit.ButtonE,
      'f': ArcadeInputBit.ButtonF,
      'start': ArcadeInputBit.Start,
      'select': ArcadeInputBit.Coin,
      'coin': ArcadeInputBit.Coin,
    };
    const arcadeBit = arcadeButtonMap[btnType];
    if (arcadeBit !== undefined) setArcadeInputBit(arcadeBit, pressed);
    return;
  }

  const buttonMap: Record<string, ControllerButton> = {
    'up': ControllerButton.Up,
    'down': ControllerButton.Down,
    'left': ControllerButton.Left,
    'right': ControllerButton.Right,
    'a': ControllerButton.A,
    'b': ControllerButton.B,
    'start': ControllerButton.Start,
    'select': ControllerButton.Select,
  };
  
  const button = buttonMap[btnType];
  if (button !== undefined) {
    setNesButton(button, pressed);
  }
}

function dispatchN64KeyboardEvent(bindingId: string, pressed: boolean): void {
  const binding = N64_KEY_BINDINGS[bindingId];
  if (!binding) return;
  if (pressed && n64PressedKeys.has(bindingId)) return;
  if (!pressed && !n64PressedKeys.has(bindingId)) return;

  if (pressed) {
    n64PressedKeys.add(bindingId);
  } else {
    n64PressedKeys.delete(bindingId);
  }

  const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
    key: binding.key,
    code: binding.code,
    bubbles: true,
    cancelable: true,
    location: binding.location ?? 0,
    repeat: false,
  });

  Object.defineProperty(event, 'keyCode', { get: () => binding.keyCode });
  Object.defineProperty(event, 'which', { get: () => binding.keyCode });

  document.getElementById('canvas')?.dispatchEvent(event);
  document.dispatchEvent(event);
  window.dispatchEvent(event);
}

function releaseAllN64Inputs(): void {
  for (const bindingId of Array.from(n64PressedKeys)) {
    dispatchN64KeyboardEvent(bindingId, false);
  }
  document.querySelectorAll('#n64-controller-area .pressed').forEach(el => el.classList.remove('pressed'));
}

function setN64ButtonPressed(bindingId: string, pressed: boolean, element?: HTMLElement): void {
  if (!isMupenN64Active()) return;
  dispatchN64KeyboardEvent(bindingId, pressed);
  element?.classList.toggle('pressed', pressed);
}

// ===== 電腦版控制 =====

/**
 * 設定電腦版控制按鈕
 */
function setupDesktopControls(): void {
  const controlToggle = document.getElementById('btn-toggle-controls');
  controlToggle?.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('controls-open');
    controlToggle.setAttribute('aria-expanded', String(isOpen));
  });

  type WebkitFullscreenDocument = Document & {
    webkitExitFullscreen?: () => void | Promise<void>;
    webkitFullscreenElement?: Element | null;
  };
  type WebkitFullscreenTarget = HTMLElement & {
    webkitRequestFullscreen?: () => void | Promise<void>;
  };

  const fullscreenDocument = document as WebkitFullscreenDocument;
  const getFullscreenElement = () => document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;

  const toggleFullscreen = () => {
    if (getFullscreenElement()) {
      const exitFullscreen = document.exitFullscreen?.bind(document)
        ?? fullscreenDocument.webkitExitFullscreen?.bind(document);
      void Promise.resolve(exitFullscreen?.()).catch((error) => console.warn('離開全螢幕失敗:', error));
      return;
    }

    const target = (gameboyShell ?? document.documentElement) as WebkitFullscreenTarget;
    const requestFullscreen = target.requestFullscreen?.bind(target)
      ?? target.webkitRequestFullscreen?.bind(target);
    void Promise.resolve(requestFullscreen?.()).catch((error) => console.warn('進入全螢幕失敗:', error));
  };

  const syncFullscreenState = () => {
    const isIOSLandscape = document.body.classList.contains('ios-safari-landscape-mode')
      || document.body.classList.contains('mobile-landscape-mode')
        && /iPad|iPhone|iPod/i.test(navigator.userAgent);
    document.body.classList.toggle('fullscreen-active', Boolean(getFullscreenElement()) || isIOSLandscape);
  };

  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('btn-fullscreen-overlay')?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);

  document.getElementById('btn-pause')?.addEventListener('click', stopEmulation);
  document.getElementById('btn-resume')?.addEventListener('click', startEmulation);
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (isMupenN64Active() && currentN64RomData) {
      await startN64Game(currentN64RomData);
    } else if (isSnes9xActive()) {
      snes9xBackend?.reset();
    } else {
      nes?.reset();
    }
  });
  document.getElementById('btn-select-game')?.addEventListener('click', () => {
    void confirmReturnToMachineMenu();
  });
  
  // 存檔/讀取按鈕 (電腦版)
  document.getElementById('btn-save-state')?.addEventListener('click', () => {
    void saveStateForUser(0, true);
  });
  document.getElementById('btn-load-state')?.addEventListener('click', () => {
    void loadStateForUser(0, true);
  });
  
  const bindMobileStateButton = (id: string, action: () => void): void => {
    const button = document.getElementById(id);
    if (!button || button.dataset.stateWired) return;
    button.dataset.stateWired = '1';

    let activeTouch = false;
    let suppressClickUntil = 0;
    const releaseTouch = (event: TouchEvent, runAction: boolean): void => {
      event.preventDefault();
      event.stopPropagation();
      button.classList.remove('pressed');
      if (!activeTouch) return;
      activeTouch = false;
      suppressClickUntil = performance.now() + 500;
      if (runAction) action();
    };

    button.addEventListener('touchstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeTouch = true;
      button.classList.add('pressed');
    }, { passive: false });
    button.addEventListener('touchend', event => releaseTouch(event, true), { passive: false });
    button.addEventListener('touchcancel', event => releaseTouch(event, false), { passive: false });
    button.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      action();
    });
  };

  bindMobileStateButton('mobile-save-state', () => {
    void saveStateForUser(0, true);
  });
  bindMobileStateButton('mobile-load-state', () => {
    void loadStateForUser(0, true);
  });
}

/**
 * 設定檔案選擇器 (電腦版)
 */
function setupFileInput(): void {
  const fileInput = document.getElementById('rom-input') as HTMLInputElement;
  
  fileInput?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      await loadRomFromFile(file);
    }
  });
}

// ===== 模擬器控制 =====

/**
 * 開始模擬
 */
function startEmulation(): void {
  resumeAudio();
  if (isSnes9xActive()) {
    isRunning = true;
    snes9xBackend?.resume();
    return;
  }
  if (isMupenN64Active()) {
    isRunning = true;
    syncAudioWorkletState();
    n64Controls?.resume();
    return;
  }

  if (isFbNeoActive()) {
    startFbNeoEmulation();
    return;
  }

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  isRunning = true;
  syncAudioWorkletState();

  // 根據核心類型選擇幀率
  // NES NTSC: 60.0988 fps, Game Boy: 59.7275 fps, Game Gear: 59.92 fps (3579545 / 228 / 262)
  const coreType = nes?.getCoreType() || 'nes';
  const targetFps = coreType === 'gb' ? 59.7275 : coreType === 'gg' ? 59.92 : 60.0988;
  const TARGET_FRAME_TIME = 1000 / targetFps;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  let bootDiagFrameCount = 0;

  let blackFrameCount = 0;
  let lastBlackLogFrame = 0;
  let wasBlackScreen = false;

  const frameLoop = (currentTime: number): void => {
    if (!nes || !ctx || !imageData || !isRunning) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    accumulator += deltaTime;
    
    if (accumulator > TARGET_FRAME_TIME * 3) {
      accumulator = TARGET_FRAME_TIME;
    }

    while (accumulator >= TARGET_FRAME_TIME) {
      nes.frame();
      bootDiagFrameCount++;
      if (coreType === 'nes' && activeGamePresentation) activeGamePresentationFrame++;
      // Boot diagnostic: dump state at key frames to find when BRK crash happens
      if (coreType === 'snes' && (bootDiagFrameCount <= 10 ||
          bootDiagFrameCount === 15 || bootDiagFrameCount === 20 ||
          bootDiagFrameCount === 30 || bootDiagFrameCount === 60)) {
        try {
          const state = nes.debugState();
          console.log(`[BOOT DIAG] Frame ${bootDiagFrameCount}:\n${state}`);
        } catch(e) { /* ignore */ }
      }

      // SNES 黑屏自動偵測：採樣 framebuffer 中心區域
      if (coreType === 'snes' && bootDiagFrameCount > 60) {
        try {
          const memory = nes.getWasmMemory() as WebAssembly.Memory;
          const ptr = nes.getFrameBufferPtr();
          const len = nes.getFrameBufferLen();
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
              const colorState = (nes as any).debugPpuColorState?.() || 'N/A';
              const state = nes.debugState();
              console.warn(`[BLACK SCREEN DETECT] Frame ${bootDiagFrameCount} (${blackFrameCount} consecutive black frames)\n${colorState}\n${state}`);
            }
            if (!wasBlackScreen) {
              wasBlackScreen = true;
              const colorState = (nes as any).debugPpuColorState?.() || 'N/A';
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

      // === SoM diagnostic: DSP voice + CGRAM + framebuffer color monitoring ===
      if (coreType === 'snes') {
        // DSP voice dump every ~300 frames for audio diagnosis
        if (bootDiagFrameCount % 300 === 1 && bootDiagFrameCount < 3000) {
          try {
            const dspInfo = (nes as any).debugDspVoices?.();
            if (dspInfo) console.log(`[DSP VOICES] Frame ${bootDiagFrameCount}:\n${dspInfo}`);
          } catch(e) { /* ignore */ }
        }

        // Detect abnormal framebuffer (green screen) every 60 frames
        if (bootDiagFrameCount % 60 === 0 && bootDiagFrameCount > 120) {
          try {
            const memory = nes.getWasmMemory() as WebAssembly.Memory;
            const ptr = nes.getFrameBufferPtr();
            const len = nes.getFrameBufferLen();
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
                const colorState = (nes as any).debugPpuColorState?.() || 'N/A';
                const cgram = (nes as any).debugCgram?.(32) || 'N/A';
                console.warn(`[GREEN SCREEN DETECT] Frame ${bootDiagFrameCount} avgRGB=(${avgR.toFixed(1)},${avgG.toFixed(1)},${avgB.toFixed(1)})\n${colorState}\nCGRAM[0-31]:\n${cgram}`);
              }
            }
          } catch(e) { /* ignore */ }
        }
      }

      accumulator -= TARGET_FRAME_TIME;
    }

    renderFrame();
    animationId = requestAnimationFrame(frameLoop);
  };

  animationId = requestAnimationFrame(frameLoop);
}

function startFbNeoEmulation(): void {
  if (!fbneoCore || !ctx || !imageData) return;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  resumeAudio();
  isRunning = true;
  syncAudioWorkletState();
  const targetFrameTime = 1000 / 60;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  let guardedFrames = 180;

  const frameLoop = (currentTime: number): void => {
    if (!fbneoCore || !ctx || !imageData || !isRunning || !isFbNeoActive()) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    accumulator = Math.min(accumulator + deltaTime, targetFrameTime * 3);

    while (accumulator >= targetFrameTime) {
      pollArcadeGamepads();
      fbneoCore.stepFrame(mergeArcadeInputSources(arcadeInputP1, arcadeGamepadInputP1), arcadeInputP2);
      enqueueAudioSamples(fbneoCore.consumeAudioSamples());
      accumulator -= targetFrameTime;
    }

    const frameBuffer = fbneoCore.getFrameBufferView();
    if (guardedFrames <= 0 || isPresentableFbNeoFrame(frameBuffer)) {
      renderFrame();
    }
    if (guardedFrames > 0) guardedFrames--;
    animationId = requestAnimationFrame(frameLoop);
  };

  animationId = requestAnimationFrame(frameLoop);
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

/**
 * 停止模擬
 */
function stopEmulation(): void {
  isRunning = false;
  syncAudioWorkletState();
  if (isSnes9xActive()) {
    snes9xBackend?.pause();
    return;
  }
  if (isMupenN64Active()) {
    void n64Controls?.pause().catch((error) => console.warn('[N64] 暫停失敗:', error));
    return;
  }

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

/**
 * 渲染一幀到畫布
 */
function renderFrame(): void {
  if (isMupenN64Active() || isSnes9xActive()) return;
  if (isFbNeoActive()) {
    renderFbNeoFrame();
    return;
  }
  if (!nes || !ctx || !imageData) return;

  // 重要：每次都重新取得 WASM memory 參考
  // 因為 WASM 記憶體增長後 buffer 會變為 detached
  const memory = nes.getWasmMemory() as WebAssembly.Memory;

  // 從 WASM 記憶體讀取 RGBA 畫面資料
  const ptr = nes.getFrameBufferPtr();
  const len = nes.getFrameBufferLen();
  const frameBuffer = new Uint8Array(memory.buffer, ptr, len);

  if (nes.getCoreType() === 'nes') {
    const rowStride = nes.getScreenWidth() * 4;
    const visibleStart = NES_OVERSCAN_TOP * rowStride;
    imageData.data.set(frameBuffer.subarray(visibleStart, visibleStart + imageData.data.length));
  } else {
    imageData.data.set(frameBuffer);
  }
  ctx.putImageData(imageData, 0, 0);
  renderGamePresentation();
  if (textOverlay && nes) {
    try { textOverlay.render(nes, NES_OVERSCAN_TOP); }
    catch (error) {
      console.error('[中文化] 顯示失敗，保留原遊戲繼續執行', error);
      textOverlay.dispose(); textOverlay = null;
      nes.enableTextObserver(false);
    }
  }
}

function renderGamePresentation(): void {
  if (!ctx || !imageData || !activeGamePresentation || nes?.getCoreType() !== 'nes') return;

  const inputFrame = activeGamePresentationInputFrame;
  for (const cue of activeGamePresentation.cues) {
    const elapsed = cue.trigger.type === 'frame'
      ? activeGamePresentationFrame
      : inputFrame === null ? -1 : activeGamePresentationFrame - inputFrame;
    const openEndedFrameCueWasDismissed = cue.trigger.type === 'frame'
      && cue.trigger.to === undefined
      && inputFrame !== null;
    if (elapsed < cue.trigger.from
        || (cue.trigger.to !== undefined && elapsed > cue.trigger.to)
        || openEndedFrameCueWasDismissed) continue;
    if (cue.regionGuard && hashPresentationRegion(imageData, cue.regionGuard) !== cue.regionGuard.hash) continue;

    ctx.save();
    for (const mask of cue.masks) {
      ctx.fillStyle = mask.color ?? '#000000';
      ctx.fillRect(mask.x, mask.y, mask.width, mask.height);
    }
    for (const label of cue.labels) {
      ctx.font = `700 ${label.size}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
      ctx.textAlign = label.align ?? 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = label.color ?? '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 1;
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.restore();
  }
}

function hashPresentationRegion(frame: ImageData, region: GamePresentationRegionGuard): string {
  let hash = 0x811c9dc5;
  const sampleStep = region.sampleStep ?? 1;
  const endX = Math.min(region.x + region.width, frame.width);
  const endY = Math.min(region.y + region.height, frame.height);
  for (let y = region.y; y < endY; y += sampleStep) {
    for (let x = region.x; x < endX; x += sampleStep) {
      const offset = (y * frame.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        hash ^= frame.data[offset + channel];
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function renderFbNeoFrame(): void {
  if (!fbneoCore || !ctx || !imageData) return;
  const frameBuffer = fbneoCore.getFrameBufferView();
  if (arcadeRotation !== 'none') {
    const output = imageData.data;
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
    imageData.data.set(frameBuffer);
  }
  ctx.putImageData(imageData, 0, 0);
}

// ===== 音頻系統 =====

// 簡易音質診斷：為特定遊戲（目前鎖定 SoM）收集短期 RMS / 高頻能量，便於自動偵測刺耳雜訊
const audioDiag = {
  active: false,
  sampleCount: 0,
  sumSq: 0,
  sumDiffSq: 0,
  maxAbs: 0,
  clipCount: 0,
  windowsLogged: 0,
};

function shouldEnableAudioDiag(): boolean {
  const coreType = nes?.getCoreType();
  if (coreType !== 'snes') return false;
  const name = (currentRomFilename || '').toLowerCase();
  return name.includes('mana');
}

function resetAudioDiagWindow(): void {
  audioDiag.sampleCount = 0;
  audioDiag.sumSq = 0;
  audioDiag.sumDiffSq = 0;
  audioDiag.maxAbs = 0;
  audioDiag.clipCount = 0;
}

function enqueueAudioSamples(samples: Float32Array, channels = 1): void {
  if (audioMuted || samples.length === 0 || !audioWorkletNode) return;

  if (audioDiag.active && audioContext) {
    for (let index = 0; index < samples.length; index++) {
      const value = samples[index];
      audioDiag.sampleCount++;
      audioDiag.sumSq += value * value;
      if (index > 0) {
        const difference = value - samples[index - 1];
        audioDiag.sumDiffSq += difference * difference;
      }
      const absolute = Math.abs(value);
      if (absolute > audioDiag.maxAbs) audioDiag.maxAbs = absolute;
      if (absolute > 0.98) audioDiag.clipCount++;
      if (audioDiag.sampleCount >= audioContext.sampleRate) {
        const rms = Math.sqrt(audioDiag.sumSq / audioDiag.sampleCount);
        const diffRms = Math.sqrt(audioDiag.sumDiffSq / Math.max(1, audioDiag.sampleCount - 1));
        const snrLike = rms > 1e-6 ? rms / Math.max(1e-6, diffRms) : 0;
        console.log(`[AUDIO DIAG] window=${audioDiag.windowsLogged + 1} rms=${rms.toFixed(4)} diffRms=${diffRms.toFixed(4)} snrLike=${snrLike.toFixed(2)} maxAbs=${audioDiag.maxAbs.toFixed(3)} clips=${audioDiag.clipCount}`);
        audioDiag.windowsLogged++;
        resetAudioDiagWindow();
        if (audioDiag.windowsLogged >= 12) audioDiag.active = false;
      }
    }
  }

  const transferableSamples = samples.slice();
  audioWorkletNode.port.postMessage(
    { type: 'samples', samples: transferableSamples, channels },
    [transferableSamples.buffer],
  );
}

function clearAudioQueue(): void {
  audioWorkletNode?.port.postMessage({ type: 'clear' });
}

function syncAudioWorkletState(): void {
  audioWorkletNode?.port.postMessage({ type: 'state', running: isRunning, muted: audioMuted });
}

/**
 * 將 WASM 音頻緩衝區的樣本排入 JS 環形緩衝區
 * 在每次 frame() 後呼叫，確保所有樣本都被捕獲
 */
function drainWasmAudioToWorklet(): void {
  if (!nes) return;
  const available = nes.getAudioBufferLen();
  if (available === 0) return;

  // 靜音時只消費 buffer 不排入環形緩衝區
  if (audioMuted) {
    nes.consumeAudioSamples();
    return;
  }

  // 重要：每次都重新取得 WASM memory 參考（記憶體增長後 buffer 可能 detached）
  const memory = nes.getWasmMemory() as WebAssembly.Memory;
  const ptr = nes.getAudioBufferPtr();
  const samples = new Float32Array(memory.buffer, ptr, available);
  enqueueAudioSamples(samples, nes.getCoreType() === 'snes' ? 2 : 1);

  nes.consumeAudioSamples();
}

/**
 * 初始化音頻系統
 */
async function initAudio(): Promise<void> {
  try {
    audioContext = new AudioContext({ sampleRate: 44100 });
    if (!audioContext.audioWorklet) {
      await audioContext.close();
      audioContext = null;
      console.info('[Audio] AudioWorklet unavailable on LAN HTTP; N64 SDL audio remains available');
      return;
    }
    await audioContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio-worklet.js`);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'emulator-audio-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    audioWorkletNode.connect(audioContext.destination);
    
    if (nes) {
      nes.setAudioSampleRate(audioContext.sampleRate);
    }
    audioDiag.active = shouldEnableAudioDiag();
    if (audioDiag.active) {
      resetAudioDiagWindow();
      audioDiag.windowsLogged = 0;
      console.log('[AUDIO DIAG] Enabled for current ROM');
    }
    
    syncAudioWorkletState();
    console.log('AudioWorklet 音頻系統已初始化，取樣率:', audioContext.sampleRate);
  } catch (e) {
    console.error('音頻初始化失敗:', e);
  }
}

/**
 * 恢復音頻
 */
function resumeAudio(): void {
  if (audioContext && audioContext.state !== 'running' && audioContext.state !== 'closed') {
    void audioContext.resume().catch(error => console.warn('[Audio] 恢復 AudioContext 失敗:', error));
  }
  configureN64AudioWorklet();
  void n64Controls?.resumeAudio?.().catch(error => console.warn('[N64] 恢復 SDL 音訊失敗:', error));
}

function configureN64AudioWorklet(): void {
  const configure = n64Controls?.configureAudioWorklet;
  if (!configure) return;

  const workletUrl = new URL(
    `${import.meta.env.BASE_URL}n64-audio-worklet.js`,
    document.baseURI,
  ).href;
  void configure(workletUrl)
    .then(enabled => {
      if (enabled) console.info('[N64] AudioWorklet transport enabled');
    })
    .catch(error => console.warn('[N64] AudioWorklet fallback to SDL ScriptProcessor:', error));
}

/**
 * 切換靜音（同時停用 NES APU IRQ，用於除錯畫面問題）
 */
function toggleMute(): void {
  audioMuted = !audioMuted;
  // 通知 Rust 核心停用/啟用 APU IRQ
  nes?.setAudioEnabled(!audioMuted);

  // 靜音時清空環形緩衝區，避免殘留聲音
  if (audioMuted) {
    clearAudioQueue();
  }
  syncAudioWorkletState();

  showToast(audioMuted ? '🔇 音頻已關閉（APU IRQ 同時停用）' : '🔊 音頻已開啟');
}

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'emu_savestate_';

// Native NES snapshots own complete hardware inside the current Rust instance.
// A token is NOT a portable save file: never put it in localStorage. WeakMap
// also prevents a replacement/freed EmuWasm from inheriting another core's slots.
const nesTemporaryStates = new WeakMap<EmuWasm, Map<string, string>>();
const NES_TEMP_STATE_PREFIX = '#NES-TEMP-2:';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const NES_PERSISTENT_STATE_PREFIX = 'NES-SAVE-1:';

function isNesPersistentState(state: string | null): state is string {
  return Boolean(state?.startsWith(NES_PERSISTENT_STATE_PREFIX));
}

async function writeNesPersistentState(key: string, state: string): Promise<void> {
  try {
    localStorage.setItem(key, state);
    console.log(`[NES] localStorage 持久存檔成功 key="${key}" size=${state.length}`);
    return;
  } catch (error) {
    console.warn('[NES] localStorage 持久存檔失敗，改用 IndexedDB:', error);
  }
  try {
    await writeBinaryState(key, new TextEncoder().encode(state));
    try { localStorage.removeItem(key); } catch {
    }
  } catch (error) {
    console.error('[NES] IndexedDB 持久存檔也失敗:', error);
    throw error;
  }
}

async function readNesPersistentState(key: string): Promise<string | null> {
  try {
    const state = localStorage.getItem(key);
    if (isNesPersistentState(state)) return state;
    if (state) console.warn('[NES] 忽略舊版或非持久存檔資料，改查 IndexedDB');
  } catch (error) {
    console.warn('[NES] localStorage 持久存檔讀取失敗，改查 IndexedDB:', error);
  }
  try {
    const encoded = await readBinaryState(key);
    if (encoded && encoded.length > 0) {
      const state = new TextDecoder().decode(encoded);
      if (isNesPersistentState(state)) return state;
      console.warn('[NES] 忽略 IndexedDB 中的舊版或非持久存檔資料');
    }
  } catch (error) {
    console.warn('[NES] IndexedDB 持久存檔讀取失敗:', error);
  }
  return null;
}

/**
 * 取得帶有核心類型 + ROM 名稱的存檔 key（每個遊戲獨立存檔）
 */
function getSaveKey(slot: number): string {
  const coreType = isMupenN64Active() ? 'n64'
    : isFbNeoActive() ? 'fbneo'
    : isSnes9xActive() ? 'snes9x'
    : (nes?.getCoreType() || 'nes');
  // Use ROM filename to isolate saves per game
  const romId = currentRomFilename
    ? currentRomFilename.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 60)
    : 'unknown';
  return `${SAVE_STATE_PREFIX}${coreType}_${romId}_${slot}`;
}

/**
 * 嘗試從舊的不含 ROM 名稱的 key 遷移存檔（向後相容）
 */
function migrateLegacySave(slot: number): void {
  const coreType = isMupenN64Active() ? 'n64' : (nes?.getCoreType() || 'nes');
  const oldKey = `${SAVE_STATE_PREFIX}${coreType}_${slot}`;
  const newKey = getSaveKey(slot);
  if (!localStorage.getItem(newKey)) {
    const oldData = localStorage.getItem(oldKey);
    if (oldData) {
      // Don't auto-migrate: old key was shared across games, could be wrong game
      console.log(`[SaveState] 發現舊格式存檔 key=${oldKey}，不自動遷移（可能屬於其他遊戲）`);
    }
  }
}

/**
 * 顯示提示訊息
 */
function showToast(message: string): void {
  // 移除舊的 toast
  const existingToast = document.querySelector('.toast-message');
  if (existingToast) {
    existingToast.remove();
  }
  
  // 建立新的 toast
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px 30px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: bold;
    z-index: 10000;
    animation: toastFade 1.5s ease-out forwards;
  `;
  
  // 添加動畫樣式
  if (!document.querySelector('#toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes toastFade {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // 自動移除
  setTimeout(() => toast.remove(), 1500);
}

function saveState(slot: number = 0): boolean {
  if (isSnes9xActive()) {
    if (!snes9xBackend) return false;
    try {
      const saveData = snes9xBackend.saveState();
      localStorage.setItem(getSaveKey(slot), bytesToBase64(saveData));
      console.log(`[Snes9x] 即時存檔成功 ROM="${currentRomFilename}" slot=${slot} size=${saveData.length}`);
      return true;
    } catch (error) {
      console.error('[Snes9x] 即時存檔失敗:', error);
      return false;
    }
  }
  if (isFbNeoActive()) {
    if (!fbneoCore) return false;
    try {
      const saveData = fbneoCore.saveState();
      localStorage.setItem(getSaveKey(slot), bytesToBase64(saveData));
      console.log(`[FBNeo] 即時存檔成功 ROM="${currentRomFilename}" slot=${slot} size=${saveData.length}`);
      return true;
    } catch (error) {
      console.error('[FBNeo] 即時存檔失敗:', error);
      return false;
    }
  }
  if (isMupenN64Active()) {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態存檔 API');
    return false;
  }
  if (!nes) return false;
  
  try {
    const nativeNes = nes.getCoreType() === 'nes';
    if (nativeNes && (!currentRomFilename || gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16)) return false;
    const saveData = nativeNes
      ? nes.exportSaveStateForSlot(slot)
      : nes.exportSaveState();
    if (!saveData) return false;
    const key = getSaveKey(slot);
    if (nes.getCoreType() === 'nes') {
      // Fail closed with an older WASM build; its NESW v1 export is incomplete.
      if (!saveData.includes(NES_TEMP_STATE_PREFIX)) {
        console.warn('[NES] 核心尚未支援安全暫存，請更新 WASM；未寫入不完整存檔');
        return false;
      }
      let slots = nesTemporaryStates.get(nes);
      if (!slots) { slots = new Map(); nesTemporaryStates.set(nes, slots); }
      slots.delete(key);
      slots.set(key, saveData);
      // User slots are stable in Rust; diagnostic exports use a separate registry.
      while (slots.size > 16) slots.delete(slots.keys().next().value!);
      console.log(`[NES] 快速暫存成功（同核心）ROM="${currentRomFilename}" slot=${slot}`);
      return true;
    }
    localStorage.setItem(key, saveData);
    console.log(`[SaveState] 存檔成功 ROM="${currentRomFilename}" key="${key}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (e) {
    console.error('[SaveState] 存檔失敗:', e);
    return false;
  }
}

function loadState(slot: number = 0): boolean {
  if (isSnes9xActive()) {
    if (!snes9xBackend) return false;
    try {
      const saveData = localStorage.getItem(getSaveKey(slot));
      if (!saveData) return false;
      snes9xBackend.loadState(base64ToBytes(saveData));
      console.log(`[Snes9x] 即時讀檔成功 ROM="${currentRomFilename}" slot=${slot}`);
      return true;
    } catch (error) {
      console.error('[Snes9x] 即時讀檔失敗:', error);
      return false;
    }
  }
  if (isFbNeoActive()) {
    if (!fbneoCore) return false;
    try {
      const saveData = localStorage.getItem(getSaveKey(slot));
      if (!saveData) {
        console.log(`[FBNeo] ROM="${currentRomFilename}" slot=${slot} 沒有存檔`);
        return false;
      }
      fbneoCore.loadState(base64ToBytes(saveData));
      console.log(`[FBNeo] 即時讀檔成功 ROM="${currentRomFilename}" slot=${slot}`);
      return true;
    } catch (error) {
      console.error('[FBNeo] 即時讀檔失敗:', error);
      return false;
    }
  }
  if (isMupenN64Active()) {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態讀檔 API');
    return false;
  }
  if (!nes) return false;
  
  try {
    const key = getSaveKey(slot);
    const nativeNes = nes.getCoreType() === 'nes';
    if (nativeNes && (!currentRomFilename || gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16)) return false;
    const saveData = nativeNes
      ? nesTemporaryStates.get(nes)?.get(key)
      : localStorage.getItem(key);
    
    if (!saveData) {
      console.log(`[SaveState] ROM="${currentRomFilename}" key="${key}" slot=${slot} 沒有存檔`);
      return false;
    }
    
    const success = nes.importSaveState(saveData);
    if (success) {
      if (nativeNes) {
        clearAudioQueue();
        // Keep the user's current mute preference; discard queued future audio.
        nes.consumeAudioSamples();
        nes.setAudioEnabled(!audioMuted);
        renderFrame();
      }
      console.log(`[SaveState] 讀取成功 ROM="${currentRomFilename}" key="${key}" slot=${slot}`);
      // Diagnostic: dump PPU state after loading save state (for transparency diagnosis)
      try {
        const colorState = (nes as any).debugPpuColorState?.() || 'N/A';
        const dspInfo = (nes as any).debugDspVoices?.() || 'N/A';
        const cgram = (nes as any).debugCgram?.(32) || 'N/A';
        console.log(`[LOAD STATE DIAG] PPU Color:\n${colorState}\nDSP:\n${dspInfo}\nCGRAM[0-31]:\n${cgram}`);
      } catch(e) { /* ignore */ }
    } else {
      if (nativeNes) nesTemporaryStates.get(nes)?.delete(key);
      console.warn(`[SaveState] 讀取失敗（資料不相容）ROM="${currentRomFilename}" key="${key}"`);
    }
    return success;
  } catch (e) {
    console.error('[SaveState] 讀取存檔失敗:', e);
    return false;
  }
}

let snes9xStateOperation: Promise<void> = Promise.resolve();

function queueSnes9xStateOperation(operation: () => Promise<boolean>): Promise<boolean> {
  const result = snes9xStateOperation.then(operation, operation);
  snes9xStateOperation = result.then(() => undefined, () => undefined);
  return result;
}

async function saveSnes9xStateWithPersistence(slot: number): Promise<boolean> {
  const backend = snes9xBackend;
  if (!backend || !isSnes9xActive()) return false;
  const key = getSaveKey(slot);

  try {
    const saveData = backend.saveState();
    try {
      await writeBinaryState(key, saveData);
      try {
        localStorage.removeItem(key);
      } catch {
      }
    } catch (error) {
      console.warn('[Snes9x] IndexedDB state 儲存失敗，改用 localStorage:', error);
      localStorage.setItem(key, bytesToBase64(saveData));
    }
    console.log(`[Snes9x] 即時存檔成功 ROM="${currentRomFilename}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (error) {
    console.error('[Snes9x] 即時存檔失敗:', error);
    return false;
  }
}

async function loadSnes9xStateWithPersistence(slot: number): Promise<boolean> {
  const backend = snes9xBackend;
  if (!backend || !isSnes9xActive()) return false;
  const key = getSaveKey(slot);
  let saveData: Uint8Array | null = null;

  try {
    saveData = await readBinaryState(key);
  } catch (error) {
    console.warn('[Snes9x] IndexedDB state 讀取失敗，改用 localStorage:', error);
  }

  if (!saveData) {
    try {
      const encoded = localStorage.getItem(key);
      if (!encoded) return false;
      saveData = base64ToBytes(encoded);
      try {
        await writeBinaryState(key, saveData);
        localStorage.removeItem(key);
      } catch {
      }
    } catch (error) {
      console.error('[Snes9x] 即時讀檔資料解析失敗:', error);
      return false;
    }
  }

  if (saveData.length === 0) return false;
  try {
    backend.loadState(saveData);
    console.log(`[Snes9x] 即時讀檔成功 ROM="${currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error('[Snes9x] 即時讀檔失敗:', error);
    return false;
  }
}

async function saveNesStateWithPersistence(slot: number): Promise<boolean> {
  const core = nes;
  if (!core || core.getCoreType() !== 'nes' || !currentRomFilename || gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16) return false;

  try {
    const token = core.exportSaveStateForSlot(slot);
    const persistentState = core.exportPersistentSaveState();
    if (!token || !persistentState) return false;
    await writeNesPersistentState(getSaveKey(slot), persistentState);
    let slots = nesTemporaryStates.get(core);
    if (!slots) { slots = new Map(); nesTemporaryStates.set(core, slots); }
    const key = getSaveKey(slot);
    slots.delete(key);
    slots.set(key, token);
    while (slots.size > 16) slots.delete(slots.keys().next().value!);
    console.log(`[NES] 持久存檔成功 ROM="${currentRomFilename}" slot=${slot} size=${persistentState.length}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久存檔失敗:', error);
    return false;
  }
}

async function loadNesStateWithPersistence(slot: number): Promise<boolean> {
  const core = nes;
  if (!core || core.getCoreType() !== 'nes' || !currentRomFilename || gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16) return false;

  const key = getSaveKey(slot);
  const sessionToken = nesTemporaryStates.get(core)?.get(key);
  if (sessionToken) return loadState(slot);

  const persistentState = await readNesPersistentState(key);
  if (!persistentState) return false;
  try {
    const success = core.importPersistentSaveState(persistentState);
    if (!success) {
      console.warn(`[NES] 持久存檔不相容或已損壞 ROM="${currentRomFilename}" slot=${slot}`);
      return false;
    }
    clearAudioQueue();
    core.consumeAudioSamples();
    core.setAudioEnabled(!audioMuted);
    renderFrame();
    console.log(`[NES] 持久讀檔成功 ROM="${currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久讀檔失敗:', error);
    return false;
  }
}

function saveStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  const operation = isSnes9xActive()
    ? queueSnes9xStateOperation(() => saveSnes9xStateWithPersistence(slot))
    : activeBackend === 'wasm' && nes?.getCoreType() === 'nes'
      ? saveNesStateWithPersistence(slot)
    : Promise.resolve(saveState(slot));
  return operation.then(success => {
    if (showResult) showToast(success ? '✅ 存檔成功（可跨重新整理）' : '❌ 存檔失敗');
    return success;
  });
}

function loadStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  const operation = isSnes9xActive()
    ? queueSnes9xStateOperation(() => loadSnes9xStateWithPersistence(slot))
    : activeBackend === 'wasm' && nes?.getCoreType() === 'nes'
      ? loadNesStateWithPersistence(slot)
    : Promise.resolve(loadState(slot));
  return operation.then(success => {
    if (showResult) showToast(success ? '✅ 讀取成功' : '❌ 沒有有效存檔');
    return success;
  });
}

function exportSaveToFile(): void {
  if (activeBackend === 'wasm' && nes?.getCoreType() === 'nes') {
    const saveData = nes.exportPersistentSaveState();
    if (!saveData) {
      showToast('NES 尚未準備好，不能匯出存檔');
      return;
    }
    const blob = new Blob([saveData], { type: 'application/x-nes-save' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nes_savestate_${Date.now()}.nes-save`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 存檔已匯出');
    return;
  }
  if (isFbNeoActive()) {
    showToast('FBNeo 即時存檔尚未支援');
    return;
  }
  if (isMupenN64Active()) {
    void n64Controls?.forceDumpSaveFiles?.();
    showToast('N64 會使用遊戲內建存檔');
    return;
  }
  if (!nes) return;
  
  const saveData = nes.exportSaveState();
  const blob = new Blob([saveData], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  const coreTag = nes?.getCoreType() || 'emu';
  a.download = `${coreTag}_savestate_${Date.now()}.txt`;
  a.click();
  
  URL.revokeObjectURL(url);
}

// ===== SRAM 持久化 (遊戲內建存檔) =====

const SRAM_PREFIX = 'emu_sram_';

function getSramKey(): string {
  return `${SRAM_PREFIX}${currentRomFilename}`;
}

/** 將 SRAM 儲存到 localStorage */
function saveSram(): void {
  if (isSnes9xActive()) {
    void snes9xBackend?.syncSaveData().catch(error => {
      console.warn('[Snes9x] 自動儲存 SRAM 發生問題:', error);
    });
    return;
  }

  if (activeBackend !== 'wasm' || !nes || !currentRomFilename) return;
  
  try {
    const sramData = nes.exportSram();
    if (sramData && sramData.length > 0) {
      localStorage.setItem(getSramKey(), sramData);
    }
  } catch (e) {
    console.error('SRAM 儲存失敗:', e);
  }
}

/** 從 localStorage 讀取 SRAM */
function loadSram(): void {
  if (activeBackend !== 'wasm' || !nes || !currentRomFilename) return;
  
  try {
    const sramData = localStorage.getItem(getSramKey());
    if (sramData) {
      nes.importSram(sramData);
      console.log('SRAM 已從 localStorage 載入');
    }
  } catch (e) {
    console.error('SRAM 讀取失敗:', e);
  }
}

// ===== SNES 控制器設定 =====

/**
 * 切換虛擬控制器外觀（NES 或 SNES）
 */
function updateControllerLayout(): void {
  const nesCtrl = document.getElementById('nes-controller-area');
  const snesCtrl = document.getElementById('snes-controller-area');
  const arcadeCtrl = document.getElementById('arcade-controller-area');
  const n64Ctrl = document.getElementById('n64-controller-area');
  document.body.classList.toggle('n64-mode', isMupenN64Active());
  document.body.classList.toggle('arcade-mode', isFbNeoActive());
  document.body.classList.toggle(
    'arcade-digital-fallback',
    isFbNeoActive() && shouldUseDigitalArcadeDpad(navigator.userAgent, typeof PointerEvent !== 'undefined'),
  );
  document.body.classList.toggle('arcade-vertical-mode', isFbNeoActive() && arcadeRotation !== 'none');
  document.body.classList.toggle('snes-mode', !isMupenN64Active() && !isFbNeoActive() && usesSixButtonController());
  updateSnesControllerLabels();
  if (isMupenN64Active()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'flex';
    setupN64Buttons();
  } else if (isFbNeoActive()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'flex';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
    setupArcadeButtons();
  } else if (usesSixButtonController()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'flex';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
    setupSnesButtons();
  } else {
    if (nesCtrl) nesCtrl.style.display = 'flex';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
  }
  updateKeyboardGuide();
}

function updateSnesControllerLabels(): void {
  const labels = isGenesisCore()
    ? { l: 'X', r: 'Z', x: 'Y', y: 'A', a: 'C', b: 'B', select: 'MODE', start: 'START' }
    : { l: 'L', r: 'R', x: 'X', y: 'Y', a: 'A', b: 'B', select: 'SEL', start: 'STA' };
  for (const [id, label] of Object.entries(labels)) {
    const element = id === 'select' || id === 'start'
      ? document.querySelector<HTMLElement>(`#snes-controller-area [data-snes-btn="${id}"]`)
      : document.getElementById(`snes-btn-${id}`);
    if (element) element.textContent = label;
  }
}

function updateArcadeButtonCount(buttonCount: number | null): void {
  document.body.classList.toggle('arcade-no-buttons', buttonCount === 0);
  document.querySelectorAll<HTMLElement>('#arcade-controller-area .arcade-face-btn').forEach((button, index) => {
    button.hidden = buttonCount !== null && index >= buttonCount;
  });
  const grid = document.querySelector<HTMLElement>('#arcade-controller-area .arcade-face-grid');
  if (grid) grid.dataset.buttonCount = buttonCount === null ? '6' : String(buttonCount);
}

function setupArcadeButtons(): void {
  const buttonBits: Record<string, number> = {
    up: ArcadeInputBit.Up,
    down: ArcadeInputBit.Down,
    left: ArcadeInputBit.Left,
    right: ArcadeInputBit.Right,
    a: ArcadeInputBit.ButtonA,
    b: ArcadeInputBit.ButtonB,
    c: ArcadeInputBit.ButtonC,
    d: ArcadeInputBit.ButtonD,
    e: ArcadeInputBit.ButtonE,
    f: ArcadeInputBit.ButtonF,
    coin: ArcadeInputBit.Coin,
    start: ArcadeInputBit.Start,
  };

  const faceButtons: ThumbContactButton[] = [];
  document.querySelectorAll<HTMLElement>('#arcade-controller-area .arcade-face-btn').forEach((button) => {
    const bitName = button.dataset.arcadeBit;
    if (!bitName || button.dataset.arcadeWired) return;
    const bit = buttonBits[bitName];
    if (bit === undefined) return;
    button.dataset.arcadeWired = '1';
    faceButtons.push({
      id: bitName,
      element: button,
      setPressed: pressed => setArcadeInputBit(bit, pressed),
    });
  });
  setupThumbContactButtons(document.querySelector('#arcade-controller-area .arcade-face-grid'), faceButtons);

  document.querySelectorAll('#arcade-controller-area [data-arcade-bit]').forEach((node) => {
    const button = node as HTMLElement;
    const bitName = button.dataset.arcadeBit;
    if (!bitName || button.dataset.arcadeWired) return;
    const bit = buttonBits[bitName];
    if (bit === undefined) return;
    button.dataset.arcadeWired = '1';

    const activeTouchIds = new Set<number>();
    const press = () => {
      setArcadeInputBit(bit, true);
      button.classList.add('pressed');
    };
    const release = () => {
      setArcadeInputBit(bit, false);
      button.classList.remove('pressed');
    };

    button.addEventListener('touchstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.add(touch.identifier);
      press();
    }, { passive: false });

    button.addEventListener('touchend', (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.delete(touch.identifier);
      if (activeTouchIds.size === 0) release();
    }, { passive: false });

    button.addEventListener('touchcancel', (event) => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.delete(touch.identifier);
      if (activeTouchIds.size === 0) release();
    }, { passive: false });

    button.addEventListener('mousedown', (event) => { event.preventDefault(); press(); });
    button.addEventListener('mouseup', (event) => { event.preventDefault(); release(); });
    button.addEventListener('mouseleave', release);
  });

  setupArcadeDpad();

  const saveButton = document.getElementById('arcade-mobile-save');
  if (saveButton && !saveButton.dataset.arcadeWired) {
    saveButton.dataset.arcadeWired = '1';
    saveButton.addEventListener('click', () => {
      if (saveState(0)) showToast('✅ 存檔成功'); else showToast('❌ 存檔失敗');
    });
  }

  const loadButton = document.getElementById('arcade-mobile-load');
  if (loadButton && !loadButton.dataset.arcadeWired) {
    loadButton.dataset.arcadeWired = '1';
    loadButton.addEventListener('click', () => {
      if (loadState(0)) showToast('✅ 讀取成功'); else showToast('❌ 沒有存檔');
    });
  }
}

function setupArcadeDpad(): void {
  const dpad = document.getElementById('arcade-dpad');
  const touchArea = document.getElementById('arcade-dpad-touch-area');
  if (!dpad || !touchArea || touchArea.dataset.arcadeWired) return;
  touchArea.dataset.arcadeWired = '1';

  let currentState: DpadState = { up: false, down: false, left: false, right: false };
  let mouseDown = false;
  let pendingStateFrame: number | null = null;
  const useDigitalFallback = shouldUseDigitalArcadeDpad(
    navigator.userAgent,
    typeof PointerEvent !== 'undefined',
  );

  const applyState = (newState: DpadState) => {
    for (const direction of ['up', 'down', 'left', 'right'] as Array<keyof DpadState>) {
      if (newState[direction] !== currentState[direction]) {
        const bit = direction === 'up'
          ? ArcadeInputBit.Up
          : direction === 'down'
            ? ArcadeInputBit.Down
            : direction === 'left'
              ? ArcadeInputBit.Left
              : ArcadeInputBit.Right;
        setArcadeInputBit(bit, newState[direction]);
      }
      document.getElementById(`arcade-dpad-${direction}`)?.classList.toggle('pressed', newState[direction]);
    }
    currentState = { ...newState };
  };

  const clearState = () => {
    if (pendingStateFrame !== null) cancelAnimationFrame(pendingStateFrame);
    pendingStateFrame = null;
    dpad.classList.remove('engaged');
    dpad.style.setProperty('--stick-x', '0px');
    dpad.style.setProperty('--stick-y', '0px');
    applyState({ up: false, down: false, left: false, right: false });
  };

  const calculateState = (clientX: number, clientY: number): DpadState => {
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const deadZone = rect.width / 2 * 0.15;
    const distance = Math.hypot(dx, dy);
    const maxTravel = rect.width * 0.24;
    const travelScale = distance > maxTravel ? maxTravel / distance : 1;
    dpad.classList.toggle('engaged', distance > deadZone);
    dpad.style.setProperty('--stick-x', `${dx * travelScale}px`);
    dpad.style.setProperty('--stick-y', `${dy * travelScale}px`);
    return quantizeVirtualStick(dx, dy, deadZone);
  };

  const applyPointerState = (clientX: number, clientY: number) => {
    const newState = calculateState(clientX, clientY);
    const bridge = getBridgedDiagonal(currentState, newState);
    if (pendingStateFrame !== null) cancelAnimationFrame(pendingStateFrame);
    pendingStateFrame = null;
    if (!bridge) {
      applyState(newState);
      return;
    }
    applyState(bridge);
    pendingStateFrame = requestAnimationFrame(() => {
      pendingStateFrame = null;
      applyState(newState);
    });
  };

  if (typeof PointerEvent !== 'undefined' && !useDigitalFallback) {
    let activePointerId: number | null = null;
    touchArea.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      applyPointerState(event.clientX, event.clientY);
      try {
        touchArea.setPointerCapture(event.pointerId);
      } catch {
        // Older Android Chrome can reject capture while still delivering pointer events.
      }
    });
    touchArea.addEventListener('pointermove', (event) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      applyPointerState(event.clientX, event.clientY);
    });
    const releasePointer = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      event.preventDefault();
      activePointerId = null;
      clearState();
    };
    touchArea.addEventListener('pointerup', releasePointer);
    touchArea.addEventListener('pointercancel', releasePointer);
  } else {
    touchArea.addEventListener('touchstart', (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) applyPointerState(touch.clientX, touch.clientY);
    }, { passive: false });

    touchArea.addEventListener('touchmove', (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) applyPointerState(touch.clientX, touch.clientY);
    }, { passive: false });

    touchArea.addEventListener('touchend', (event) => { event.preventDefault(); clearState(); }, { passive: false });
    touchArea.addEventListener('touchcancel', (event) => { event.preventDefault(); clearState(); }, { passive: false });

    touchArea.addEventListener('mousedown', (event) => {
      event.preventDefault();
      mouseDown = true;
      applyPointerState(event.clientX, event.clientY);
    });

    document.addEventListener('mousemove', (event) => {
      if (mouseDown) applyPointerState(event.clientX, event.clientY);
    });

    document.addEventListener('mouseup', () => {
      if (mouseDown) {
        mouseDown = false;
        clearState();
      }
    });
  }
}

function setupN64Buttons(): void {
  document.querySelectorAll('#n64-controller-area [data-n64-button]').forEach((node) => {
    const button = node as HTMLElement;
    const bindingId = button.dataset.n64Button;
    if (!bindingId || button.dataset.n64Wired) return;
    button.dataset.n64Wired = '1';

    const activeTouchIds = new Set<number>();
    const press = () => setN64ButtonPressed(bindingId, true, button);
    const release = () => setN64ButtonPressed(bindingId, false, button);

    button.addEventListener('touchstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.add(touch.identifier);
      press();
    }, { passive: false });

    button.addEventListener('touchend', (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.delete(touch.identifier);
      if (activeTouchIds.size === 0) release();
    }, { passive: false });

    button.addEventListener('touchcancel', (event) => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) activeTouchIds.delete(touch.identifier);
      if (activeTouchIds.size === 0) release();
    }, { passive: false });

    button.addEventListener('mousedown', (event) => { event.preventDefault(); press(); });
    button.addEventListener('mouseup', (event) => { event.preventDefault(); release(); });
    button.addEventListener('mouseleave', release);
  });

  setupN64DirectionalPad('n64-stick', 'n64-stick-touch', {
    up: 'analog-up',
    down: 'analog-down',
    left: 'analog-left',
    right: 'analog-right',
  }, {
    up: 'n64-stick-up',
    down: 'n64-stick-down',
    left: 'n64-stick-left',
    right: 'n64-stick-right',
  });

  setupN64DirectionalPad('n64-dpad', 'n64-dpad-touch', {
    up: 'dpad-up',
    down: 'dpad-down',
    left: 'dpad-left',
    right: 'dpad-right',
  }, {
    up: 'n64-dpad-up',
    down: 'n64-dpad-down',
    left: 'n64-dpad-left',
    right: 'n64-dpad-right',
  });

  const saveButton = document.getElementById('n64-mobile-save');
  if (saveButton && !saveButton.dataset.n64Wired) {
    saveButton.dataset.n64Wired = '1';
    saveButton.addEventListener('click', () => {
      showToast('N64 即時存檔尚未支援，遊戲內存檔會自動保存');
    });
  }

  const loadButton = document.getElementById('n64-mobile-load');
  if (loadButton && !loadButton.dataset.n64Wired) {
    loadButton.dataset.n64Wired = '1';
    loadButton.addEventListener('click', () => {
      showToast('N64 即時讀檔尚未支援，遊戲內存檔會自動載入');
    });
  }

}

function setupN64DirectionalPad(
  padId: string,
  touchAreaId: string,
  bindings: Record<keyof DpadState, string>,
  visualIds: Record<keyof DpadState, string>,
): void {
  const pad = document.getElementById(padId);
  const touchArea = document.getElementById(touchAreaId);
  if (!pad || !touchArea || touchArea.dataset.n64Wired) return;
  touchArea.dataset.n64Wired = '1';

  let currentState: DpadState = { up: false, down: false, left: false, right: false };
  let mouseDown = false;
  let pendingStateFrame: number | null = null;

  const applyState = (newState: DpadState) => {
    for (const direction of ['up', 'down', 'left', 'right'] as Array<keyof DpadState>) {
      if (newState[direction] !== currentState[direction]) {
        setN64ButtonPressed(bindings[direction], newState[direction]);
      }
      document.getElementById(visualIds[direction])?.classList.toggle('pressed', newState[direction]);
    }
    currentState = { ...newState };
  };

  const clearState = () => {
    if (pendingStateFrame !== null) cancelAnimationFrame(pendingStateFrame);
    pendingStateFrame = null;
    pad.classList.remove('engaged');
    pad.style.setProperty('--stick-x', '0px');
    pad.style.setProperty('--stick-y', '0px');
    applyState({ up: false, down: false, left: false, right: false });
  };

  const calculateState = (clientX: number, clientY: number): DpadState => {
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const deadZone = rect.width / 2 * 0.15;
    const distance = Math.hypot(dx, dy);
    const maxTravel = rect.width * 0.24;
    const travelScale = distance > maxTravel ? maxTravel / distance : 1;
    pad.classList.toggle('engaged', distance > deadZone);
    pad.style.setProperty('--stick-x', `${dx * travelScale}px`);
    pad.style.setProperty('--stick-y', `${dy * travelScale}px`);
    return quantizeVirtualStick(dx, dy, deadZone);
  };

  const applyPointerState = (clientX: number, clientY: number) => {
    const newState = calculateState(clientX, clientY);
    const bridge = getBridgedDiagonal(currentState, newState);
    if (pendingStateFrame !== null) cancelAnimationFrame(pendingStateFrame);
    pendingStateFrame = null;
    if (!bridge) {
      applyState(newState);
      return;
    }
    applyState(bridge);
    pendingStateFrame = requestAnimationFrame(() => {
      pendingStateFrame = null;
      applyState(newState);
    });
  };

  touchArea.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyPointerState(touch.clientX, touch.clientY);
  }, { passive: false });

  touchArea.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyPointerState(touch.clientX, touch.clientY);
  }, { passive: false });

  touchArea.addEventListener('touchend', (event) => { event.preventDefault(); clearState(); }, { passive: false });
  touchArea.addEventListener('touchcancel', (event) => { event.preventDefault(); clearState(); }, { passive: false });

  touchArea.addEventListener('mousedown', (event) => {
    event.preventDefault();
    mouseDown = true;
    applyPointerState(event.clientX, event.clientY);
  });

  document.addEventListener('mousemove', (event) => {
    if (mouseDown) applyPointerState(event.clientX, event.clientY);
  });

  document.addEventListener('mouseup', () => {
    if (mouseDown) {
      mouseDown = false;
      clearState();
    }
  });
}

/**
 * 設定 SNES 按鈕觸控/滑鼠事件 (支援多點觸控)
 */
function setupSnesButtons(): void {
  // --- ABXY: thumb-contact and multi-touch aware ---
  const faceBtnDefs: { id: string; btn: number }[] = [
    { id: 'snes-btn-a', btn: SnesButton.A },
    { id: 'snes-btn-b', btn: SnesButton.B },
    { id: 'snes-btn-x', btn: SnesButton.X },
    { id: 'snes-btn-y', btn: SnesButton.Y },
  ];
  const faceButtons: ThumbContactButton[] = [];

  for (const { id, btn } of faceBtnDefs) {
    const element = document.getElementById(id);
    if (!element) continue;
    faceButtons.push({ id, element, setPressed: pressed => setSnesButton(btn, pressed) });
  }

  setupThumbContactButtons(document.querySelector('.snes-abxy-diamond'), faceButtons);

  // --- L/R: conventional multi-touch buttons ---
  const shoulderBtnDefs: { id: string; btn: number }[] = [
    { id: 'snes-btn-l', btn: SnesButton.L },
    { id: 'snes-btn-r', btn: SnesButton.R },
  ];

  const shoulderTouches = new Map<string, Set<number>>();

  for (const { id, btn } of shoulderBtnDefs) {
    const el = document.getElementById(id);
    if (!el || el.dataset.snesWired) continue;
    el.dataset.snesWired = '1';
    shoulderTouches.set(id, new Set());

    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touches = shoulderTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.add(t.identifier);
      }
      setSnesButton(btn, true);
      el.classList.add('pressed');
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touches = shoulderTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier);
      }
      if (touches.size === 0) {
        setSnesButton(btn, false);
        el.classList.remove('pressed');
      }
    }, { passive: false });

    el.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      const touches = shoulderTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier);
      }
      if (touches.size === 0) {
        setSnesButton(btn, false);
        el.classList.remove('pressed');
      }
    }, { passive: false });

    // Mouse events (for desktop testing)
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setSnesButton(btn, true);
      el.classList.add('pressed');
    });
    el.addEventListener('mouseup', (e) => {
      e.preventDefault();
      setSnesButton(btn, false);
      el.classList.remove('pressed');
    });
    el.addEventListener('mouseleave', () => {
      setSnesButton(btn, false);
      el.classList.remove('pressed');
    });
  }

  // SNES Select/Start 使用 SnesButton 編號
  const snesFuncBtns = document.querySelectorAll('#snes-controller-area [data-snes-btn]');
  snesFuncBtns.forEach(b => {
    const el = b as HTMLElement;
    if (el.dataset.snesWired) return;
    el.dataset.snesWired = '1';
    const btnType = el.dataset.snesBtn;
    const btnId = btnType === 'start' ? SnesButton.Start : SnesButton.Select;

    el.addEventListener('touchstart', (e) => { e.preventDefault(); setSnesButton(btnId, true); el.classList.add('pressed'); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); setSnesButton(btnId, false); el.classList.remove('pressed'); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); setSnesButton(btnId, false); el.classList.remove('pressed'); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); setSnesButton(btnId, true); el.classList.add('pressed'); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); setSnesButton(btnId, false); el.classList.remove('pressed'); });
    el.addEventListener('mouseleave', () => { setSnesButton(btnId, false); el.classList.remove('pressed'); });
  });

  // SNES D-Pad (reuse same logic)
  const snesDpad = document.getElementById('snes-dpad');
  const snesDpadArea = document.getElementById('snes-dpad-touch-area');
  if (snesDpadArea && snesDpad && !snesDpadArea.dataset.snesWired) {
    snesDpadArea.dataset.snesWired = '1';
    let snesCurrentDpad: DpadState = { up: false, down: false, left: false, right: false };

    const applySnesDpad = (newState: DpadState) => {
      if (newState.up !== snesCurrentDpad.up) setSnesButton(SnesButton.Up, newState.up);
      if (newState.down !== snesCurrentDpad.down) setSnesButton(SnesButton.Down, newState.down);
      if (newState.left !== snesCurrentDpad.left) setSnesButton(SnesButton.Left, newState.left);
      if (newState.right !== snesCurrentDpad.right) setSnesButton(SnesButton.Right, newState.right);
      document.getElementById('snes-dpad-up')?.classList.toggle('pressed', newState.up);
      document.getElementById('snes-dpad-down')?.classList.toggle('pressed', newState.down);
      document.getElementById('snes-dpad-left')?.classList.toggle('pressed', newState.left);
      document.getElementById('snes-dpad-right')?.classList.toggle('pressed', newState.right);
      snesCurrentDpad = { ...newState };
    };

    const calcDpad = (touch: Touch | MouseEvent): DpadState => {
      const rect = snesDpad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const dx = ('clientX' in touch ? touch.clientX : 0) - cx;
      const dy = ('clientY' in touch ? touch.clientY : 0) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ns: DpadState = { up: false, down: false, left: false, right: false };
      if (dist > rect.width / 2 * 0.15) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI;
        if (a >= -22.5 && a < 22.5) ns.right = true;
        else if (a >= 22.5 && a < 67.5) { ns.right = true; ns.down = true; }
        else if (a >= 67.5 && a < 112.5) ns.down = true;
        else if (a >= 112.5 && a < 157.5) { ns.left = true; ns.down = true; }
        else if (a >= 157.5 || a < -157.5) ns.left = true;
        else if (a >= -157.5 && a < -112.5) { ns.left = true; ns.up = true; }
        else if (a >= -112.5 && a < -67.5) ns.up = true;
        else if (a >= -67.5 && a < -22.5) { ns.right = true; ns.up = true; }
      }
      return ns;
    };
    const clearSnesDpad = () => applySnesDpad({ up: false, down: false, left: false, right: false });

    snesDpadArea.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of Array.from(e.changedTouches)) applySnesDpad(calcDpad(t)); }, { passive: false });
    snesDpadArea.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of Array.from(e.changedTouches)) applySnesDpad(calcDpad(t)); }, { passive: false });
    snesDpadArea.addEventListener('touchend', (e) => { e.preventDefault(); clearSnesDpad(); }, { passive: false });
    snesDpadArea.addEventListener('touchcancel', (e) => { e.preventDefault(); clearSnesDpad(); }, { passive: false });

    let md = false;
    snesDpadArea.addEventListener('mousedown', (e) => { e.preventDefault(); md = true; applySnesDpad(calcDpad(e)); });
    document.addEventListener('mousemove', (e) => { if (md) applySnesDpad(calcDpad(e)); });
    document.addEventListener('mouseup', () => { if (md) { md = false; clearSnesDpad(); } });
  }
  // SNES Save/Load buttons
  const snesSaveButton = document.getElementById('snes-mobile-save');
  if (snesSaveButton && !snesSaveButton.dataset.stateWired) {
    snesSaveButton.dataset.stateWired = '1';
    snesSaveButton.addEventListener('click', () => {
      void saveStateForUser(0, true);
    });
  }
  const snesLoadButton = document.getElementById('snes-mobile-load');
  if (snesLoadButton && !snesLoadButton.dataset.stateWired) {
    snesLoadButton.dataset.stateWired = '1';
    snesLoadButton.addEventListener('click', () => {
      void loadStateForUser(0, true);
    });
  }
}

// ===== 鍵盤快捷鍵 =====

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      void saveStateForUser(0);
    }
    if (e.key === 'F7') {
      e.preventDefault();
      void loadStateForUser(0);
    }
    if (e.key >= 'F1' && e.key <= 'F4' && e.shiftKey) {
      e.preventDefault();
      const slot = parseInt(e.key[1]);
      void saveStateForUser(slot);
    }
    if (e.key >= '1' && e.key <= '4' && e.ctrlKey) {
      e.preventDefault();
      const slot = parseInt(e.key);
      void loadStateForUser(slot);
    }
    // 瀏覽器返回手勢與退出全螢幕也可能送出 Escape，避免直接銷毀遊戲核心。
    if (e.key === 'Escape' && !e.repeat && !document.fullscreenElement) {
      e.preventDefault();
      void confirmReturnToMachineMenu();
    }
  });

  window.addEventListener('message', (event) => {
    if (!isSnes9xActive() || (event.origin !== window.location.origin && event.origin !== 'null')) return;
    const iframe = document.getElementById('snes9x-screen') as HTMLIFrameElement | null;
    if (event.source !== iframe?.contentWindow) return;
    if (!event.data || typeof event.data !== 'object' || event.data.source !== 'h5-emu-snes9x-shortcut') return;

    const slot = typeof event.data.slot === 'number' && Number.isInteger(event.data.slot)
      ? event.data.slot
      : 0;
    if (event.data.action === 'save' || event.data.action === 'load') {
      const operation = event.data.action === 'save'
        ? saveStateForUser(slot)
        : loadStateForUser(slot);
      void operation.then(success => {
        showToast(success
          ? (event.data.action === 'save' ? '✅ 存檔成功' : '✅ 讀取成功')
          : (event.data.action === 'save' ? '❌ 存檔失敗' : '❌ 沒有存檔'));
      });
    }
  });
}

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
window.debugState = () => nes ? nes.debugState() : 'No emulator';
window.debugSpriteInfo = () => nes ? nes.debugSpriteInfo() : 'No emulator';
window.debugPpuColorState = () => nes ? (nes as any).debugPpuColorState?.() || 'Not available' : 'No emulator';
window.debugScanlineLayers = (y: number, xs: number, xe: number) => nes ? (nes as any).debugScanlineLayers?.(y, xs, xe) || 'Not available' : 'No emulator';
window.debugTraceFrame = () => nes ? (nes as any).debugTraceFrame?.() || 'Not available' : 'No emulator';
window.debugStepTrace = (n: number) => nes ? nes.debugStepTrace(n) : 'No emulator';
window.debugFrameTrace = () => nes ? nes.debugFrameTrace() : 'No emulator';
window.debugRunFrames = (n: number) => nes ? nes.debugRunFrames(n) : 'No emulator';
window.debugRunInstructions = (n: number) => nes ? nes.debugRunInstructions(n) : 'No emulator';
window.debugReadMem = (b: number, a: number, count: number = 16) => nes ? nes.debugReadMem(b, a, count) : 'No emulator';
window.debugRunThenTrace = (f: number, t: number) => nes ? nes.debugRunThenTrace(f, t) : 'No emulator';
window.debugReadRomRange = (b: number, s: number, l: number) => nes ? nes.debugReadRomRange(b, s, l) : 'No emulator';
window.debugRunUntilPcInRange = (b: number, lo: number, hi: number, mf: number, tc: number) => nes ? nes.debugRunUntilPcInRange(b, lo, hi, mf, tc) : 'No emulator';

// ===== 啟動 =====

document.addEventListener('DOMContentLoaded', async () => {
  if (!setupAppShell()) return;

  // Safari可能在背景切換或重建backend後再次暫停AudioContext，必須保留解鎖監聽。
  document.addEventListener('click', resumeAudio);
  document.addEventListener('keydown', resumeAudio);
  document.addEventListener('touchstart', resumeAudio, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveSram();
    else resumeAudio();
  });

  wasmInitPromise = initWasm().catch((error) => {
    console.error('WASM 核心初始化失敗:', error);
    showToast('核心初始化失敗，仍可瀏覽遊戲列表或使用 FBNeo 遊戲');
    throw error;
  });

  try {
    await wasmInitPromise;
  } catch {
    // waitForWasmCore() logs the same failure for ROM launch attempts.
  }

  try {
    await initAudio();
  } catch (error) {
    console.warn('音頻初始化失敗:', error);
  }

  setupKeyboardShortcuts();
  window.nes = nes;

  // 定期自動儲存 SRAM（每 30 秒）
  setInterval(() => {
    if (isRunning) saveSram();
  }, 30000);

  // 頁面關閉時儲存 SRAM
  window.addEventListener('beforeunload', () => {
    saveSram();
  });
  window.addEventListener('pagehide', saveSram);
});
