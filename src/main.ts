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
import type { EmulatorControls } from 'mupen64plus-web';
import type { FbNeoArcadeCore, FbNeoRomSet } from './arcade/fbneo-core';

// ===== 型別定義 =====

interface RomInfo {
  name: string;
  file: string;
  system?: string;  // 'nes' | 'gb' | 'gg' | 'snes' | 'n64' (可選，自動偵測)
}

interface RomListResponse {
  roms: RomInfo[];
}

type SystemKey = 'nes' | 'gb' | 'gg' | 'sms' | 'snes' | 'n64' | 'arcade';

interface MachineInfo {
  key: SystemKey;
  title: string;
  label: string;
  artClass: string;
}

interface KeyboardBindingView {
  action: string;
  keys: string[];
}

const FBNEO_SUPPORTED_GAMES = [
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
  '1943',
  'area88',
  'rtype',
  'parodius',
] as const;

type FbNeoGameName = typeof FBNEO_SUPPORTED_GAMES[number];

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
  { key: 'nes', title: '紅白機 FC / NES', label: '8-bit 客廳回憶', artClass: 'nes' },
  { key: 'gb', title: 'Game Boy', label: '掌機綠幕角落', artClass: 'gb' },
  { key: 'gg', title: 'Game Gear', label: '彩色掌機台', artClass: 'gg' },
  { key: 'sms', title: 'Master System', label: 'SEGA 家用機', artClass: 'sms' },
  { key: 'snes', title: '超級任天堂 SFC', label: '16-bit 黃金年代', artClass: 'snes' },
  { key: 'n64', title: 'Nintendo 64', label: '3D 包廂機台', artClass: 'n64' },
  { key: 'arcade', title: 'FBNeo 街機', label: '投幣大型機台', artClass: 'arcade' },
];

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
  return nes?.getCoreType() === 'snes';
}

// ===== 全域變數 =====

let nes: EmuWasm | null = null;
let animationId: number | null = null;
let canvas: HTMLCanvasElement | null = null;
let wasmCanvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let audioContext: AudioContext | null = null;
let isRunning: boolean = false;
let currentRomFilename: string = '';
let activeBackend: 'wasm' | 'mupen64' | 'fbneo' = 'wasm';
let n64Controls: EmulatorControls | null = null;
let currentN64RomData: ArrayBuffer | null = null;
let fbneoCore: FbNeoArcadeCore | null = null;
let currentFbNeoRomSet: FbNeoRomSet | null = null;
let arcadeInputP1 = 0;
let arcadeInputP2 = 0;
let arcadeSourceWidth = 320;
let arcadeSourceHeight = 240;
let arcadeRotateLeft = false;

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

function isFbNeoArcadeRomName(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip') && getFbNeoGameName(filename) !== null;
}

function detectRomSystem(rom: RomInfo): SystemKey {
  const normalized = rom.system?.toLowerCase();
  if (normalized === 'fbneo' || normalized === 'arcade') return 'arcade';
  if (normalized === 'nes' || normalized === 'gb' || normalized === 'gg' || normalized === 'sms' || normalized === 'snes' || normalized === 'n64') {
    return normalized;
  }

  const lower = rom.file.toLowerCase();
  if (isFbNeoArcadeRomName(rom.file)) return 'arcade';
  if (isN64RomName(rom.file)) return 'n64';
  if (lower.endsWith('.sfc') || lower.endsWith('.smc')) return 'snes';
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
    { action: '音頻', keys: ['M'] },
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

function activateN64Canvas(): HTMLCanvasElement {
  if (!wasmCanvas) {
    throw new Error('找不到可替換的 2D 畫布');
  }

  document.body.classList.add('n64-mode');
  const n64Canvas = document.createElement('canvas');
  n64Canvas.id = 'canvas';
  n64Canvas.width = 640;
  n64Canvas.height = 480;
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
  window.dispatchEvent(new Event('resize'));
}

function dispatchN64ResizePulse(n64Canvas: HTMLCanvasElement): void {
  n64Canvas.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('orientationchange'));
}

async function forceN64ResponsiveResize(n64Canvas: HTMLCanvasElement): Promise<void> {
  const originalWidth = n64Canvas.style.width || '100%';
  n64Canvas.style.width = '99.9%';
  await waitForNextFrame();
  n64Canvas.style.width = originalWidth;
  await waitForNextFrame();

  dispatchN64ResizePulse(n64Canvas);
  await waitForNextFrame();

  n64Canvas.width = 640;
  n64Canvas.height = 480;

  const rect = n64Canvas.getBoundingClientRect();
  const displayWidth = Math.max(1, Math.round(rect.width));
  const displayHeight = Math.max(1, Math.round(rect.height));
  if (displayWidth > 1 && displayHeight > 1) {
    const gl = n64Canvas.getContext('webgl2') ?? n64Canvas.getContext('webgl');
    gl?.viewport(0, 0, n64Canvas.width, n64Canvas.height);
  }
}

function scheduleN64ResponsiveResize(n64Canvas: HTMLCanvasElement): void {
  const runResize = () => {
    void forceN64ResponsiveResize(n64Canvas).catch((error) => {
      console.warn('[N64] 強制畫面適配失敗:', error);
    });
  };

  runResize();
  window.setTimeout(runResize, 250);
  window.setTimeout(runResize, 750);
  window.setTimeout(runResize, 1500);
}

function restoreWasmCanvas(): void {
  if (!wasmCanvas || canvas === wasmCanvas) return;

  canvas?.replaceWith(wasmCanvas);
  canvas = wasmCanvas;
  canvas.id = 'screen';
  ctx = canvas.getContext('2d');
  imageData = null;
}

// 需要自動重整的特殊 ROM（首次載入有問題，需重整一次才能正常）
const AUTO_RESET_ROMS: string[] = [
  'Captain Tsubasa II - Super Striker (Japan).nes',
  'SuperMarioBros3.nes',
];

// ===== UI 元素 =====

let romSelector: HTMLElement | null = null;
let gameboyShell: HTMLElement | null = null;
let powerLed: HTMLElement | null = null;
let romCatalog: RomInfo[] = [];

// ===== 音頻設定 =====
const AUDIO_BUFFER_SIZE = 2048;  // ScriptProcessor 緩衝區大小（~46ms）
let lastAudioSample: number = 0;  // 上一個有效取樣值，用於平滑填充
let audioMuted: boolean = false;    // 靜音旗標（同時停用 APU IRQ）

// ===== 音頻環形緩衝區 =====
// 解耦 WASM 音頻產生與 ScriptProcessor 消費的時序差異
const JS_RING_SIZE = 16384;       // 可容納 ~22 幀的音頻資料
const jsRing = new Float32Array(JS_RING_SIZE);
let ringW = 0;   // 寫入位置
let ringR = 0;   // 讀取位置
let ringCount = 0; // 目前可用樣本數

// ===== 初始化 =====

/**
 * 初始化應用程式外殼。ROM 清單必須先於 WASM runtime 顯示，避免手機首次載入核心失敗時卡在占位文字。
 */
function setupAppShell(): boolean {
  // 取得 UI 元素
  romSelector = document.getElementById('rom-selector');
  gameboyShell = document.getElementById('gameboy-shell');
  powerLed = document.getElementById('power-led');

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

  imageData = ctx.createImageData(256, 240);  // 預設 NES 尺寸，載入 ROM 後會更新

  // 設定鍵盤輸入（直接對 WASM 控制器操作）
  setupKeyboardInput();

  // 設定虛擬控制器
  setupVirtualController();

  // 設定電腦版控制按鈕
  setupDesktopControls();

  // 設定觸控裝置 RWD 狀態（iPhone Safari 橫版可能仍落在桌機寬度斷點）
  setupResponsiveModeDetection();
  updateKeyboardGuide();

  // 設定 ROM 選擇器
  setupRomSelector();

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

function setupResponsiveModeDetection(): void {
  const updateResponsiveMode = () => {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const isLandscape = viewportWidth > viewportHeight;
    const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    const isCompressedLandscape = isLandscape && viewportHeight <= 560;
    const shouldUseMobileLandscape = isTouchDevice && isLandscape && (viewportWidth <= 1180 || isCompressedLandscape);

    document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
    document.body.classList.toggle('touch-device-mode', isTouchDevice);
    document.body.classList.toggle('mobile-landscape-mode', shouldUseMobileLandscape);
  };

  updateResponsiveMode();
  window.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.addEventListener('orientationchange', updateResponsiveMode, { passive: true });
  window.visualViewport?.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateResponsiveMode, { passive: true });
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

function setArcadeInputBit(bit: number, pressed: boolean, player: 1 | 2 = 1): void {
  if (player === 1) {
    arcadeInputP1 = pressed ? (arcadeInputP1 | bit) : (arcadeInputP1 & ~bit);
  } else {
    arcadeInputP2 = pressed ? (arcadeInputP2 | bit) : (arcadeInputP2 & ~bit);
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
  if (!pad) return;

  const pressed = (index: number) => pad.buttons[index]?.pressed ?? false;
  const axisPressed = (index: number, direction: -1 | 1) => {
    const value = pad.axes[index] ?? 0;
    return direction < 0 ? value < -0.45 : value > 0.45;
  };

  let mask = arcadeInputP1 & (ArcadeInputBit.Coin | ArcadeInputBit.Start);
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
  arcadeInputP1 = mask;
}

function setupKeyboardInput(): void {
  window.addEventListener('keydown', (e) => {
    if (isMupenN64Active()) return;
    if (isFbNeoActive()) {
      if (setArcadeKeyboardInput(e.code, true)) e.preventDefault();
      return;
    }
    if (!nes) return;
    if (isSnesCore()) {
      const button = KEYBOARD_MAP_SNES[e.code];
      if (button !== undefined) {
        nes.setButton(0, button, true);
        e.preventDefault();
      }
    } else {
      const button = KEYBOARD_MAP_P1[e.code];
      if (button !== undefined) {
        nes.setButton(0, button, true);
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
    if (!nes) return;
    if (isSnesCore()) {
      const button = KEYBOARD_MAP_SNES[e.code];
      if (button !== undefined) {
        nes.setButton(0, button, false);
        e.preventDefault();
      }
    } else {
      const button = KEYBOARD_MAP_P1[e.code];
      if (button !== undefined) {
        nes.setButton(0, button, false);
        e.preventDefault();
      }
    }
  });
}

// ===== ROM 選擇器 =====

/**
 * 設定 ROM 選擇器
 */
function setupRomSelector(): void {
  loadRomList();

  document.getElementById('rom-back-btn')?.addEventListener('click', renderMachineSelector);
  
  // 設定檔案上傳
  const fileInput = document.getElementById('rom-file-input') as HTMLInputElement;
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await loadRomFromFile(file);
    }
  });
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
    const response = await fetch(`${baseUrl}roms.json`);
    if (!response.ok) {
      throw new Error('無法載入 ROM 列表');
    }
    
    const data: RomListResponse = await response.json();
    romCatalog = data.roms;
    renderMachineSelector();
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
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  if (!machineGridEl || !romListEl) return;

  if (romCatalog.length === 0) {
    machineGridEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  if (browserHeader) browserHeader.style.display = 'none';
  romListEl.style.display = 'none';
  machineGridEl.style.display = 'grid';

  machineGridEl.innerHTML = MACHINES.map((machine) => {
    const count = romCatalog.filter((rom) => detectRomSystem(rom) === machine.key).length;
    const disabled = count === 0 ? 'disabled aria-disabled="true"' : '';
    return `
      <button class="machine-card" type="button" data-system="${machine.key}" ${disabled}>
        <span class="machine-art ${machine.artClass}" aria-hidden="true"></span>
        <span class="machine-title">${escapeHtml(machine.title)}</span>
        <span class="machine-meta">
          <span>${escapeHtml(machine.label)}</span>
          <span class="machine-count">${count}</span>
        </span>
      </button>
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
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  const browserTitle = document.getElementById('rom-browser-title');
  if (!romListEl) return;

  const roms = romCatalog.filter((rom) => detectRomSystem(rom) === system);
  const machine = MACHINES.find((item) => item.key === system);

  if (machineGridEl) machineGridEl.style.display = 'none';
  if (browserHeader) browserHeader.style.display = 'flex';
  if (browserTitle) browserTitle.textContent = `${machine?.title ?? '遊戲列表'} (${roms.length})`;
  romListEl.style.display = 'block';

  if (roms.length === 0) {
    romListEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  romListEl.innerHTML = roms.map((rom, index) => {
    const systemKey = detectRomSystem(rom);
    const label = systemKey === 'arcade' ? 'FBNeo' : systemKey.toUpperCase();
    const tagClass = systemKey === 'arcade' ? 'zip' : systemKey;
    return `
      <button class="rom-item" data-index="${index}" data-file="${encodeURIComponent(rom.file)}">
        <span class="rom-icon" aria-hidden="true">▣</span>
        <span class="rom-name">${escapeHtml(rom.name)}</span>
        <span class="rom-system ${tagClass}">${label}</span>
        <span class="rom-arrow">▶</span>
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
}

/**
 * 從伺服器載入 ROM（支援 ZIP）
 */
async function loadRomFromServer(filename: string): Promise<void> {
  try {
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}roms/${encodeURIComponent(filename)}`);
    if (!response.ok) {
      throw new Error(`無法載入 ROM: ${filename}`);
    }
    
    const buffer = await response.arrayBuffer();
    const lower = filename.toLowerCase();

    if (isFbNeoArcadeRomName(filename)) {
      currentRomFilename = filename;
      await startFbNeoGame(filename, buffer);
      return;
    }

    if (lower.endsWith('.zip')) {
      // 解壓 ZIP
      const zip = await JSZip.loadAsync(buffer);
      const romExtensions = ['.nes', '.smc', '.sfc', '.gb', '.gbc', '.gg', '.sms', '.z64', '.n64', '.v64'];
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
        alert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      const romBuffer = await romFile.async('arraybuffer');
      currentRomFilename = romFileName.split('/').pop() || romFileName;
      await startGame(romBuffer);
    } else {
      currentRomFilename = filename;
      await startGame(buffer);
    }
  } catch (error) {
    console.error('載入 ROM 失敗:', error);
    alert('載入遊戲失敗，請重試');
  }
}

/**
 * 從檔案載入 ROM（支援 ZIP）
 */
async function loadRomFromFile(file: File): Promise<void> {
  try {
    const lower = file.name.toLowerCase();
    let buffer: ArrayBuffer;
    let romName = file.name;

    if (lower.endsWith('.zip')) {
      if (isFbNeoArcadeRomName(file.name)) {
        const zipBuffer = await file.arrayBuffer();
        currentRomFilename = file.name;
        await startFbNeoGame(file.name, zipBuffer);
        return;
      }

      // 解壓 ZIP，找第一個遊戲檔案
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const romExtensions = ['.nes', '.smc', '.sfc', '.gb', '.gbc', '.gg', '.sms', '.z64', '.n64', '.v64'];
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
        alert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      buffer = await romFile.async('arraybuffer');
      // Use the actual ROM filename inside the ZIP for extension detection
      romName = romFileName.split('/').pop() || romFileName;
    } else {
      buffer = await file.arrayBuffer();
    }

    currentRomFilename = romName;
    await startGame(buffer);
  } catch (error) {
    console.error('載入 ROM 失敗:', error);
    alert('載入遊戲失敗，請重試');
  }
}

async function startFbNeoGame(archiveName: string, zipData: ArrayBuffer): Promise<void> {
  if (!canvas || !ctx) return;

  stopEmulation();
  await stopN64Backend();
  activeBackend = 'fbneo';
  arcadeInputP1 = 0;
  arcadeInputP2 = 0;
  ringW = 0;
  ringR = 0;
  ringCount = 0;
  lastAudioSample = 0;

  try {
    const { FbNeoArcadeCore, extractFbNeoRomSet } = await import('./arcade/fbneo-core');
    fbneoCore = new FbNeoArcadeCore();
    const romSet = await extractFbNeoRomSet(archiveName, zipData);
    currentFbNeoRomSet = romSet;
    currentRomFilename = archiveName;

    const validity = await fbneoCore.checkRomValidity(romSet);
    if (!validity.ok) {
      activeBackend = 'wasm';
      console.error(`[FBNeo] ROM 校驗失敗:\n${validity.log}`);
      alert(`FBNeo 無法識別 ${archiveName}\n\n${validity.log}`);
      return;
    }

    const loaded = await fbneoCore.loadGame(romSet.gameName);
    if (!loaded) {
      activeBackend = 'wasm';
      const log = fbneoCore.getLog();
      alert(`FBNeo 載入 ${archiveName} 失敗\n\n${log}`);
      return;
    }

    const { width, height } = fbneoCore.getResolution();
    arcadeSourceWidth = width;
    arcadeSourceHeight = height;
    arcadeRotateLeft = romSet.gameName === 'raiden';
    const canvasWidth = arcadeRotateLeft ? height : width;
    const canvasHeight = arcadeRotateLeft ? width : height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
    imageData = ctx.createImageData(canvasWidth, canvasHeight);

    hideRomSelector();
    updateControllerLayout();
    powerLed?.classList.add('on');
    console.log(`[FBNeo] ${romSet.gameName} loaded: ${width}x${height}${arcadeRotateLeft ? ' rotated-left' : ''}`);
    showToast(`FBNeo: ${romSet.gameName} OK`);
    startEmulation();
  } catch (error) {
    activeBackend = 'wasm';
    currentFbNeoRomSet = null;
    console.error('[FBNeo] 啟動失敗:', error);
    alert(error instanceof Error ? error.message : 'FBNeo 啟動失敗');
  }
}

/**
 * 開始遊戲
 */
async function startGame(romData: ArrayBuffer): Promise<void> {
  if (!nes) {
    alert('模擬器核心尚未初始化完成，請稍候再試。');
    return;
  }

  const romBytes = new Uint8Array(romData);
  
  // 根據副檔名選擇對應的載入方法
  const lower = currentRomFilename.toLowerCase();
  console.log(`[DEBUG] Loading ROM: "${currentRomFilename}", lower: "${lower}", size: ${romBytes.length}`);
  if (isN64RomName(currentRomFilename)) {
    await startN64Game(romData);
    return;
  }

  await stopN64Backend();
  activeBackend = 'wasm';
  let loaded = false;
  if (lower.endsWith('.gg')) {
    loaded = nes.loadGgRom(romBytes);
  } else if (lower.endsWith('.sms')) {
    loaded = nes.loadSmsRom(romBytes);
  } else if (lower.endsWith('.smc') || lower.endsWith('.sfc')) {
    console.log(`[SNES] Attempting loadSnesRom, data size: ${romBytes.length}, first 4 bytes: ${romBytes[0].toString(16)} ${romBytes[1].toString(16)} ${romBytes[2].toString(16)} ${romBytes[3].toString(16)}`);
    try {
      loaded = nes.loadSnesRom(romBytes);
      console.log(`[SNES] loadSnesRom returned: ${loaded}`);
    } catch (e) {
      console.error('[SNES] loadSnesRom threw:', e);
    }
  } else {
    loaded = nes.loadRom(romBytes);
  }
  
  if (loaded) {
    // 取得核心類型及對應的螢幕尺寸
    const coreType = nes.getCoreType();
    const screenW = nes.getScreenWidth();
    const screenH = nes.getScreenHeight();
    console.log(`ROM 載入成功 [${coreType.toUpperCase()}] ${screenW}×${screenH}，開始執行`);

    // 更新 Canvas 與 ImageData 為對應尺寸
    if (canvas && ctx) {
      canvas.width = screenW;
      canvas.height = screenH;
      imageData = ctx.createImageData(screenW, screenH);
      // 更新 CSS aspect-ratio (NES = 256:240 ≈ 4:3, GB = 160:144 = 10:9)
      canvas.style.aspectRatio = `${screenW} / ${screenH}`;
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
    ringW = 0;
    ringR = 0;
    ringCount = 0;
    lastAudioSample = 0;
    
    // 開始模擬
    startEmulation();

    // 載入 SRAM（遊戲內建電池存檔）
    loadSram();

    // 特殊 ROM 自動重整：部分遊戲首次載入有問題，需自動 reset 一次
    if (AUTO_RESET_ROMS.some(name => currentRomFilename === name)) {
      console.log(`[Auto-Reset] 偵測到特殊 ROM「${currentRomFilename}」，將自動重整...`);
      setTimeout(() => {
        if (nes && isRunning) {
          nes.reset();
          console.log('[Auto-Reset] 重整完成');
        }
      }, 500);
    }
  } else {
    console.error('ROM 載入失敗');
    alert('無法載入此 ROM 檔案');
  }
}

async function startN64Game(romData: ArrayBuffer): Promise<void> {
  if (!canvas) return;

  stopEmulation();
  await stopN64Backend();

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
    currentN64RomData = romData.slice(0);

    // Mupen64Plus-web 內部 SDL/Emscripten 程式碼會尋找 id="canvas"。
    // 原本的 #screen 已建立 2D context，瀏覽器不允許同一張 canvas 再切成 WebGL，
    // 因此 N64 模式必須替換成全新的 WebGL canvas，否則會在 EGL 層得到 BAD_MATCH。
    const n64Canvas = activateN64Canvas();

    hideRomSelector();
    updateControllerLayout();
    await settleN64CanvasLayout(n64Canvas);
    powerLed?.classList.add('on');
    isRunning = true;

    const baseUrl = import.meta.env.BASE_URL;
    await ensureMupen64Config(baseUrl);
    const { default: createMupen64PlusWeb } = await import('mupen64plus-web');
    n64Controls = await createMupen64PlusWeb({
      canvas: n64Canvas,
      romData,
      // 明確指定 1.5.x 中目前最能啟動的 Rice video plugin。
      arguments: ['--gfx', '/plugins/mupen64plus-video-rice-web-netplay-web.so'],
      coreConfig: {
        // 2 = dynamic recompiler；N64 在瀏覽器中若使用 pure interpreter 會慢到長時間黑畫面。
        emuMode: 2,
        mainLoopTimingMode: 0,
      },
      netplayConfig: { player: 0 },
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          return `${baseUrl}n64-mupen/${path}`;
        }
        return prefix + path;
      },
      setErrorStatus: (message: string) => {
        console.error('[N64/Mupen64Plus]', message);
      },
    });

    console.log(`[N64] Mupen64Plus-web backend ready for ${currentRomFilename}`);
    await settleN64CanvasLayout(n64Canvas);
    await forceN64ResponsiveResize(n64Canvas);
    void n64Controls.start().catch((error) => {
      console.error('[N64] Mupen64Plus start failed:', error);
      showToast('N64 啟動失敗');
    });
    scheduleN64ResponsiveResize(n64Canvas);
  } catch (error) {
    console.error('[N64] Mupen64Plus backend failed:', error);
    await stopN64Backend();
    showRomSelector();
    alert('N64 模擬器啟動失敗，請查看主控台錯誤');
  }
}

async function ensureMupen64Config(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}n64-mupen/mupen64plus.cfg`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`無法載入 N64 設定檔: ${response.status}`);
  }

  const configText = await response.text();
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

  restoreWasmCanvas();
  if (activeBackend === 'mupen64') {
    activeBackend = 'wasm';
  }
}

/**
 * 隱藏 ROM 選擇器
 */
function hideRomSelector(): void {
  if (romSelector) romSelector.style.display = 'none';
  if (gameboyShell) gameboyShell.style.display = 'flex';
}

/**
 * 顯示 ROM 選擇器
 */
function showRomSelector(): void {
  stopEmulation();
  void stopN64Backend();
  powerLed?.classList.remove('on');
  if (romCatalog.length > 0) renderMachineSelector();
  if (romSelector) romSelector.style.display = 'flex';
  if (gameboyShell) gameboyShell.style.display = 'none';
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
    nes?.setButton(0, ControllerButton.Up, newState.up);
  }
  if (!isFbNeoActive() && newState.down !== currentDpadState.down) {
    nes?.setButton(0, ControllerButton.Down, newState.down);
  }
  if (!isFbNeoActive() && newState.left !== currentDpadState.left) {
    nes?.setButton(0, ControllerButton.Left, newState.left);
  }
  if (!isFbNeoActive() && newState.right !== currentDpadState.right) {
    nes?.setButton(0, ControllerButton.Right, newState.right);
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
function setupABButtons(): void {
  const btnA = document.getElementById('btn-a');
  const btnB = document.getElementById('btn-b');
  
  const setupButton = (btn: HTMLElement | null, buttonType: ControllerButton, elementId: string) => {
    if (!btn) return;
    const setPressed = (pressed: boolean) => {
      if (isFbNeoActive()) {
        setArcadeInputBit(buttonType === ControllerButton.A ? ArcadeInputBit.ButtonA : ArcadeInputBit.ButtonB, pressed);
      } else {
        nes?.setButton(0, buttonType, pressed);
      }
    };
    
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.set(touch.identifier, { identifier: touch.identifier, element: elementId });
      }
      setPressed(true);
      btn.classList.add('pressed');
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      setPressed(false);
      btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      setPressed(false);
      btn.classList.remove('pressed');
    }, { passive: false });

    // 滑鼠事件
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setPressed(true);
      btn.classList.add('pressed');
    });

    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      setPressed(false);
      btn.classList.remove('pressed');
    });

    btn.addEventListener('mouseleave', () => {
      setPressed(false);
      btn.classList.remove('pressed');
    });
  };

  setupButton(btnA, ControllerButton.A, 'a');
  setupButton(btnB, ControllerButton.B, 'b');
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
        nes?.setButton(0, buttonEnum, pressed);
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
    nes?.setButton(0, button, pressed);
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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch((error) => console.warn('離開全螢幕失敗:', error));
      return;
    }

    const target = gameboyShell ?? document.documentElement;
    const request = target.requestFullscreen?.();
    void request?.catch((error) => console.warn('進入全螢幕失敗:', error));
  };

  const syncFullscreenState = () => {
    document.body.classList.toggle('fullscreen-active', Boolean(document.fullscreenElement));
  };

  document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('btn-fullscreen-overlay')?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenState);

  document.getElementById('btn-pause')?.addEventListener('click', stopEmulation);
  document.getElementById('btn-resume')?.addEventListener('click', startEmulation);
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (isMupenN64Active() && currentN64RomData) {
      await startN64Game(currentN64RomData.slice(0));
    } else {
      nes?.reset();
    }
  });
  document.getElementById('btn-select-game')?.addEventListener('click', showRomSelector);
  
  // 靜音按鈕
  document.getElementById('btn-mute')?.addEventListener('click', toggleMute);

  // 存檔/讀取按鈕 (電腦版)
  document.getElementById('btn-save-state')?.addEventListener('click', () => {
    if (saveState(0)) {
      showToast('✅ 存檔成功');
    } else {
      showToast('❌ 存檔失敗');
    }
  });
  document.getElementById('btn-load-state')?.addEventListener('click', () => {
    if (loadState(0)) {
      showToast('✅ 讀取成功');
    } else {
      showToast('❌ 沒有存檔');
    }
  });
  
  // 存檔/讀取按鈕 (手機版)
  document.getElementById('mobile-save-state')?.addEventListener('click', () => {
    if (saveState(0)) {
      showToast('✅ 存檔成功');
    } else {
      showToast('❌ 存檔失敗');
    }
  });
  document.getElementById('mobile-load-state')?.addEventListener('click', () => {
    if (loadState(0)) {
      showToast('✅ 讀取成功');
    } else {
      showToast('❌ 沒有存檔');
    }
  });
  document.getElementById('mobile-mute')?.addEventListener('click', toggleMute);
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
  if (isMupenN64Active()) {
    isRunning = true;
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

      drainWasmAudioToRing();  // 每幀後排入環形緩衝區，防止 WASM buffer 溢出

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

  isRunning = true;
  const targetFrameTime = 1000 / 60;
  let lastFrameTime = performance.now();
  let accumulator = 0;

  const frameLoop = (currentTime: number): void => {
    if (!fbneoCore || !ctx || !imageData || !isRunning || !isFbNeoActive()) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    accumulator = Math.min(accumulator + deltaTime, targetFrameTime * 3);

    while (accumulator >= targetFrameTime) {
      pollArcadeGamepads();
      fbneoCore.stepFrame(arcadeInputP1, arcadeInputP2);
      enqueueAudioSamples(fbneoCore.consumeAudioSamples());
      accumulator -= targetFrameTime;
    }

    renderFrame();
    animationId = requestAnimationFrame(frameLoop);
  };

  animationId = requestAnimationFrame(frameLoop);
}

/**
 * 停止模擬
 */
function stopEmulation(): void {
  isRunning = false;
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
  if (isMupenN64Active()) return;
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
  
  imageData.data.set(frameBuffer);
  ctx.putImageData(imageData, 0, 0);
}

function renderFbNeoFrame(): void {
  if (!fbneoCore || !ctx || !imageData) return;
  const frameBuffer = fbneoCore.getFrameBufferView();
  if (arcadeRotateLeft) {
    const output = imageData.data;
    for (let sourceY = 0; sourceY < arcadeSourceHeight; sourceY++) {
      for (let sourceX = 0; sourceX < arcadeSourceWidth; sourceX++) {
        const sourceIndex = (sourceY * arcadeSourceWidth + sourceX) * 4;
        const destX = sourceY;
        const destY = arcadeSourceWidth - 1 - sourceX;
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

function enqueueAudioSamples(samples: Float32Array): void {
  if (audioMuted || samples.length === 0) return;

  for (let i = 0; i < samples.length; i++) {
    jsRing[ringW] = samples[i];
    ringW = (ringW + 1) % JS_RING_SIZE;
    if (ringCount < JS_RING_SIZE) {
      ringCount++;
    } else {
      ringR = (ringR + 1) % JS_RING_SIZE;
    }
  }
}

/**
 * 將 WASM 音頻緩衝區的樣本排入 JS 環形緩衝區
 * 在每次 frame() 後呼叫，確保所有樣本都被捕獲
 */
function drainWasmAudioToRing(): void {
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
  enqueueAudioSamples(samples);

  nes.consumeAudioSamples();
}

/**
 * 初始化音頻系統
 */
async function initAudio(): Promise<void> {
  try {
    audioContext = new AudioContext({ sampleRate: 44100 });
    
    if (nes) {
      nes.setAudioSampleRate(audioContext.sampleRate);
    }
    const audioSampleRate = audioContext.sampleRate;
    audioDiag.active = shouldEnableAudioDiag();
    if (audioDiag.active) {
      resetAudioDiagWindow();
      audioDiag.windowsLogged = 0;
      console.log('[AUDIO DIAG] Enabled for current ROM');
    }
    
    const scriptProcessor = audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 0, 1);
    
    scriptProcessor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      if (!isRunning || audioMuted) {
        output.fill(0);
        return;
      }

      // 從環形緩衝區讀取樣本
      for (let i = 0; i < output.length; i++) {
        if (ringCount > 0) {
          output[i] = jsRing[ringR];
          lastAudioSample = output[i];
          ringR = (ringR + 1) % JS_RING_SIZE;
          ringCount--;
        } else {
          // 欠載：用最後一個有效值漸變到靜音，避免爆音
          lastAudioSample *= 0.999;
          output[i] = lastAudioSample;
        }

        if (audioDiag.active) {
          const v = output[i];
          audioDiag.sampleCount++;
          audioDiag.sumSq += v * v;
          if (i > 0) {
            const diff = v - output[i - 1];
            audioDiag.sumDiffSq += diff * diff;
          }
          const abs = Math.abs(v);
          if (abs > audioDiag.maxAbs) audioDiag.maxAbs = abs;
          if (abs > 0.98) audioDiag.clipCount++;
          if (audioDiag.sampleCount >= audioSampleRate) {
            const rms = Math.sqrt(audioDiag.sumSq / audioDiag.sampleCount);
            const diffRms = Math.sqrt(audioDiag.sumDiffSq / Math.max(1, audioDiag.sampleCount - 1));
            const snrLike = rms > 1e-6 ? (rms / Math.max(1e-6, diffRms)) : 0;
            console.log(`[AUDIO DIAG] window=${audioDiag.windowsLogged + 1} rms=${rms.toFixed(4)} diffRms=${diffRms.toFixed(4)} snrLike=${snrLike.toFixed(2)} maxAbs=${audioDiag.maxAbs.toFixed(3)} clips=${audioDiag.clipCount}`);
            audioDiag.windowsLogged++;
            resetAudioDiagWindow();
            if (audioDiag.windowsLogged >= 12) {
              audioDiag.active = false;
              console.log('[AUDIO DIAG] Completed 12 windows, auto-disabled');
            }
          }
        }
      }
    };
    
    scriptProcessor.connect(audioContext.destination);
    console.log('音頻系統已初始化，取樣率:', audioContext.sampleRate);
  } catch (e) {
    console.error('音頻初始化失敗:', e);
  }
}

/**
 * 恢復音頻
 */
function resumeAudio(): void {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
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
    ringW = 0;
    ringR = 0;
    ringCount = 0;
    lastAudioSample = 0;
  }

  // 更新按鈕文字
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = audioMuted ? '🔇 靜音 (M)' : '🔊 音頻 (M)';
  const mobileBtn = document.getElementById('mobile-mute');
  if (mobileBtn) mobileBtn.textContent = audioMuted ? '🔇' : '🔊';
  const arcadeMobileBtn = document.getElementById('arcade-mobile-mute');
  if (arcadeMobileBtn) arcadeMobileBtn.textContent = audioMuted ? '🔇' : '🔊';

  showToast(audioMuted ? '🔇 音頻已關閉（APU IRQ 同時停用）' : '🔊 音頻已開啟');
}

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'emu_savestate_';

/**
 * 取得帶有核心類型 + ROM 名稱的存檔 key（每個遊戲獨立存檔）
 */
function getSaveKey(slot: number): string {
  const coreType = isMupenN64Active() ? 'n64' : isFbNeoActive() ? 'fbneo' : (nes?.getCoreType() || 'nes');
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
  if (isFbNeoActive()) {
    console.log(`[FBNeo] 即時狀態存檔尚未接入，slot=${slot}`);
    return false;
  }
  if (isMupenN64Active()) {
    void n64Controls?.forceDumpSaveFiles?.();
    console.log(`[N64] Mupen64Plus 使用遊戲內建存檔/IDBFS，slot=${slot} 的即時狀態存檔尚未接入`);
    return false;
  }
  if (!nes) return false;
  
  try {
    const saveData = nes.exportSaveState();
    const key = getSaveKey(slot);
    localStorage.setItem(key, saveData);
    console.log(`[SaveState] 存檔成功 ROM="${currentRomFilename}" key="${key}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (e) {
    console.error('[SaveState] 存檔失敗:', e);
    return false;
  }
}

function loadState(slot: number = 0): boolean {
  if (isFbNeoActive()) {
    console.log(`[FBNeo] 即時狀態讀取尚未接入，slot=${slot}`);
    return false;
  }
  if (isMupenN64Active()) {
    console.log(`[N64] Mupen64Plus 使用遊戲內建存檔/IDBFS，slot=${slot} 的即時狀態讀取尚未接入`);
    return false;
  }
  if (!nes) return false;
  
  try {
    const key = getSaveKey(slot);
    const saveData = localStorage.getItem(key);
    
    if (!saveData) {
      console.log(`[SaveState] ROM="${currentRomFilename}" key="${key}" slot=${slot} 沒有存檔`);
      return false;
    }
    
    const success = nes.importSaveState(saveData);
    if (success) {
      console.log(`[SaveState] 讀取成功 ROM="${currentRomFilename}" key="${key}" slot=${slot}`);
      // Diagnostic: dump PPU state after loading save state (for transparency diagnosis)
      try {
        const colorState = (nes as any).debugPpuColorState?.() || 'N/A';
        const dspInfo = (nes as any).debugDspVoices?.() || 'N/A';
        const cgram = (nes as any).debugCgram?.(32) || 'N/A';
        console.log(`[LOAD STATE DIAG] PPU Color:\n${colorState}\nDSP:\n${dspInfo}\nCGRAM[0-31]:\n${cgram}`);
      } catch(e) { /* ignore */ }
    } else {
      console.warn(`[SaveState] 讀取失敗（資料不相容）ROM="${currentRomFilename}" key="${key}"`);
    }
    return success;
  } catch (e) {
    console.error('[SaveState] 讀取存檔失敗:', e);
    return false;
  }
}

function exportSaveToFile(): void {
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
  if (!nes || !currentRomFilename) return;
  if (nes.getCoreType() !== 'snes') return;
  
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
  if (!nes || !currentRomFilename) return;
  if (nes.getCoreType() !== 'snes') return;
  
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
  document.body.classList.toggle('snes-mode', !isMupenN64Active() && !isFbNeoActive() && isSnesCore());
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
  } else if (isSnesCore()) {
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

  const muteButton = document.getElementById('arcade-mobile-mute');
  if (muteButton && !muteButton.dataset.arcadeWired) {
    muteButton.dataset.arcadeWired = '1';
    muteButton.addEventListener('click', toggleMute);
  }
}

function setupArcadeDpad(): void {
  const dpad = document.getElementById('arcade-dpad');
  const touchArea = document.getElementById('arcade-dpad-touch-area');
  if (!dpad || !touchArea || touchArea.dataset.arcadeWired) return;
  touchArea.dataset.arcadeWired = '1';

  let currentState: DpadState = { up: false, down: false, left: false, right: false };
  let mouseDown = false;

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

  const clearState = () => applyState({ up: false, down: false, left: false, right: false });

  const calculateState = (clientX: number, clientY: number): DpadState => {
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deadZone = rect.width / 2 * 0.15;
    const state: DpadState = { up: false, down: false, left: false, right: false };

    if (distance > deadZone) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle >= -22.5 && angle < 22.5) state.right = true;
      else if (angle >= 22.5 && angle < 67.5) { state.right = true; state.down = true; }
      else if (angle >= 67.5 && angle < 112.5) state.down = true;
      else if (angle >= 112.5 && angle < 157.5) { state.left = true; state.down = true; }
      else if (angle >= 157.5 || angle < -157.5) state.left = true;
      else if (angle >= -157.5 && angle < -112.5) { state.left = true; state.up = true; }
      else if (angle >= -112.5 && angle < -67.5) state.up = true;
      else if (angle >= -67.5 && angle < -22.5) { state.right = true; state.up = true; }
    }
    return state;
  };

  touchArea.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyState(calculateState(touch.clientX, touch.clientY));
  }, { passive: false });

  touchArea.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyState(calculateState(touch.clientX, touch.clientY));
  }, { passive: false });

  touchArea.addEventListener('touchend', (event) => { event.preventDefault(); clearState(); }, { passive: false });
  touchArea.addEventListener('touchcancel', (event) => { event.preventDefault(); clearState(); }, { passive: false });

  touchArea.addEventListener('mousedown', (event) => {
    event.preventDefault();
    mouseDown = true;
    applyState(calculateState(event.clientX, event.clientY));
  });

  document.addEventListener('mousemove', (event) => {
    if (mouseDown) applyState(calculateState(event.clientX, event.clientY));
  });

  document.addEventListener('mouseup', () => {
    if (mouseDown) {
      mouseDown = false;
      clearState();
    }
  });
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
    saveButton.addEventListener('click', async () => {
      try {
        await n64Controls?.forceDumpSaveFiles?.();
        showToast('✅ N64 存檔已寫入');
      } catch (error) {
        console.warn('[N64] 寫入存檔失敗:', error);
        showToast('❌ N64 存檔失敗');
      }
    });
  }

  const loadButton = document.getElementById('n64-mobile-load');
  if (loadButton && !loadButton.dataset.n64Wired) {
    loadButton.dataset.n64Wired = '1';
    loadButton.addEventListener('click', () => showToast('N64 即時讀檔尚未支援'));
  }

  const muteButton = document.getElementById('n64-mobile-mute');
  if (muteButton && !muteButton.dataset.n64Wired) {
    muteButton.dataset.n64Wired = '1';
    muteButton.addEventListener('click', toggleMute);
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

  const applyState = (newState: DpadState) => {
    for (const direction of ['up', 'down', 'left', 'right'] as Array<keyof DpadState>) {
      if (newState[direction] !== currentState[direction]) {
        setN64ButtonPressed(bindings[direction], newState[direction]);
      }
      document.getElementById(visualIds[direction])?.classList.toggle('pressed', newState[direction]);
    }
    currentState = { ...newState };
  };

  const clearState = () => applyState({ up: false, down: false, left: false, right: false });

  const calculateState = (clientX: number, clientY: number): DpadState => {
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const deadZone = rect.width / 2 * 0.15;
    const state: DpadState = { up: false, down: false, left: false, right: false };

    if (distance > deadZone) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle >= -22.5 && angle < 22.5) state.right = true;
      else if (angle >= 22.5 && angle < 67.5) { state.right = true; state.down = true; }
      else if (angle >= 67.5 && angle < 112.5) state.down = true;
      else if (angle >= 112.5 && angle < 157.5) { state.left = true; state.down = true; }
      else if (angle >= 157.5 || angle < -157.5) state.left = true;
      else if (angle >= -157.5 && angle < -112.5) { state.left = true; state.up = true; }
      else if (angle >= -112.5 && angle < -67.5) state.up = true;
      else if (angle >= -67.5 && angle < -22.5) { state.right = true; state.up = true; }
    }

    return state;
  };

  touchArea.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyState(calculateState(touch.clientX, touch.clientY));
  }, { passive: false });

  touchArea.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (touch) applyState(calculateState(touch.clientX, touch.clientY));
  }, { passive: false });

  touchArea.addEventListener('touchend', (event) => { event.preventDefault(); clearState(); }, { passive: false });
  touchArea.addEventListener('touchcancel', (event) => { event.preventDefault(); clearState(); }, { passive: false });

  touchArea.addEventListener('mousedown', (event) => {
    event.preventDefault();
    mouseDown = true;
    applyState(calculateState(event.clientX, event.clientY));
  });

  document.addEventListener('mousemove', (event) => {
    if (mouseDown) applyState(calculateState(event.clientX, event.clientY));
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
  // --- ABXY + L/R: multi-touch aware ---
  const faceBtnDefs: { id: string; btn: number }[] = [
    { id: 'snes-btn-a', btn: SnesButton.A },
    { id: 'snes-btn-b', btn: SnesButton.B },
    { id: 'snes-btn-x', btn: SnesButton.X },
    { id: 'snes-btn-y', btn: SnesButton.Y },
    { id: 'snes-btn-l', btn: SnesButton.L },
    { id: 'snes-btn-r', btn: SnesButton.R },
  ];

  // Track active touches per button for proper multi-touch
  const activeTouches = new Map<string, Set<number>>(); // id → Set<touchId>

  for (const { id, btn } of faceBtnDefs) {
    const el = document.getElementById(id);
    if (!el || el.dataset.snesWired) continue;
    el.dataset.snesWired = '1';
    activeTouches.set(id, new Set());

    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touches = activeTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.add(t.identifier);
      }
      nes?.setButton(0, btn, true);
      el.classList.add('pressed');
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const touches = activeTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier);
      }
      if (touches.size === 0) {
        nes?.setButton(0, btn, false);
        el.classList.remove('pressed');
      }
    }, { passive: false });

    el.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      const touches = activeTouches.get(id)!;
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier);
      }
      if (touches.size === 0) {
        nes?.setButton(0, btn, false);
        el.classList.remove('pressed');
      }
    }, { passive: false });

    // Mouse events (for desktop testing)
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      nes?.setButton(0, btn, true);
      el.classList.add('pressed');
    });
    el.addEventListener('mouseup', (e) => {
      e.preventDefault();
      nes?.setButton(0, btn, false);
      el.classList.remove('pressed');
    });
    el.addEventListener('mouseleave', () => {
      nes?.setButton(0, btn, false);
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

    el.addEventListener('touchstart', (e) => { e.preventDefault(); nes?.setButton(0, btnId, true); el.classList.add('pressed'); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); nes?.setButton(0, btnId, false); el.classList.remove('pressed'); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); nes?.setButton(0, btnId, false); el.classList.remove('pressed'); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); nes?.setButton(0, btnId, true); el.classList.add('pressed'); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); nes?.setButton(0, btnId, false); el.classList.remove('pressed'); });
    el.addEventListener('mouseleave', () => { nes?.setButton(0, btnId, false); el.classList.remove('pressed'); });
  });

  // SNES D-Pad (reuse same logic)
  const snesDpad = document.getElementById('snes-dpad');
  const snesDpadArea = document.getElementById('snes-dpad-touch-area');
  if (snesDpadArea && snesDpad && !snesDpadArea.dataset.snesWired) {
    snesDpadArea.dataset.snesWired = '1';
    let snesCurrentDpad: DpadState = { up: false, down: false, left: false, right: false };

    const applySnesDpad = (newState: DpadState) => {
      if (newState.up !== snesCurrentDpad.up) nes?.setButton(0, SnesButton.Up, newState.up);
      if (newState.down !== snesCurrentDpad.down) nes?.setButton(0, SnesButton.Down, newState.down);
      if (newState.left !== snesCurrentDpad.left) nes?.setButton(0, SnesButton.Left, newState.left);
      if (newState.right !== snesCurrentDpad.right) nes?.setButton(0, SnesButton.Right, newState.right);
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
  // SNES Save/Load/Mute buttons
  document.getElementById('snes-mobile-save')?.addEventListener('click', () => {
    if (saveState(0)) showToast('✅ 存檔成功'); else showToast('❌ 存檔失敗');
  });
  document.getElementById('snes-mobile-load')?.addEventListener('click', () => {
    if (loadState(0)) showToast('✅ 讀取成功'); else showToast('❌ 沒有存檔');
  });
  document.getElementById('snes-mobile-mute')?.addEventListener('click', toggleMute);
}

// ===== 鍵盤快捷鍵 =====

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      saveState(0);
    }
    if (e.key === 'F7') {
      e.preventDefault();
      loadState(0);
    }
    if (e.key >= 'F1' && e.key <= 'F4' && e.shiftKey) {
      e.preventDefault();
      const slot = parseInt(e.key[1]);
      saveState(slot);
    }
    if (e.key >= '1' && e.key <= '4' && e.ctrlKey) {
      e.preventDefault();
      const slot = parseInt(e.key);
      loadState(slot);
    }
    // ESC 鍵返回選擇畫面
    if (e.key === 'Escape') {
      showRomSelector();
    }
    // M 鍵切換靜音
    if (e.key === 'm' || e.key === 'M') {
      toggleMute();
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
    showRomSelector: () => void;
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

  try {
    await initWasm();
  } catch (error) {
    console.error('WASM 核心初始化失敗:', error);
    showToast('核心初始化失敗，仍可瀏覽遊戲列表或使用 FBNeo 遊戲');
  }

  try {
    await initAudio();
  } catch (error) {
    console.warn('音頻初始化失敗:', error);
  }

  setupKeyboardShortcuts();
  window.nes = nes;
  
  // 用戶交互後恢復音頻
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });

  // 定期自動儲存 SRAM（每 30 秒）
  setInterval(() => {
    if (isRunning) saveSram();
  }, 30000);

  // 頁面關閉時儲存 SRAM
  window.addEventListener('beforeunload', () => {
    saveSram();
  });
});
