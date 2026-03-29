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

// ===== 型別定義 =====

interface RomInfo {
  name: string;
  file: string;
  system?: string;  // 'nes' | 'gb' | 'gg' (可選，自動偵測)
}

interface RomListResponse {
  roms: RomInfo[];
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
  return nes?.getCoreType() === 'snes';
}

// ===== 全域變數 =====

let nes: EmuWasm | null = null;
let animationId: number | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let audioContext: AudioContext | null = null;
let isRunning: boolean = false;
let currentRomFilename: string = '';

// 需要自動重整的特殊 ROM（首次載入有問題，需重整一次才能正常）
const AUTO_RESET_ROMS: string[] = [
  'Captain Tsubasa II - Super Striker (Japan).nes',
  'SuperMarioBros3.nes',
];

// ===== UI 元素 =====

let romSelector: HTMLElement | null = null;
let gameboyShell: HTMLElement | null = null;
let powerLed: HTMLElement | null = null;

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
 * 初始化模擬器（載入 WASM 模組）
 */
async function initWasm(): Promise<void> {
  // 初始化 WASM 模組
  await init();
  
  // 建立統一模擬器實例（支援 NES 及 Game Boy）
  nes = new EmuWasm();

  // 取得 UI 元素
  romSelector = document.getElementById('rom-selector');
  gameboyShell = document.getElementById('gameboy-shell');
  powerLed = document.getElementById('power-led');
  
  // 建立畫布
  canvas = document.getElementById('screen') as HTMLCanvasElement;
  if (!canvas) {
    console.error('找不到畫布元素');
    return;
  }

  ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('無法取得 Canvas 2D 上下文');
    return;
  }

  imageData = ctx.createImageData(256, 240);  // 預設 NES 尺寸，載入 ROM 後會更新

  // 設定鍵盤輸入（直接對 WASM 控制器操作）
  setupKeyboardInput();

  // 設定虛擬控制器
  setupVirtualController();

  // 設定電腦版控制按鈕
  setupDesktopControls();

  // 設定 ROM 選擇器
  setupRomSelector();

  // 設定檔案選擇器
  setupFileInput();

  console.log('H5-NES 模擬器已初始化（WASM 核心）');
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

function setupKeyboardInput(): void {
  window.addEventListener('keydown', (e) => {
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
  if (!romListEl) return;

  try {
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}roms.json`);
    if (!response.ok) {
      throw new Error('無法載入 ROM 列表');
    }
    
    const data: RomListResponse = await response.json();
    renderRomList(data.roms);
  } catch (error) {
    console.error('載入 ROM 列表失敗:', error);
    romListEl.innerHTML = `
      <div class="rom-error">
        <p>⚠️ 無法載入遊戲列表</p>
        <p>請使用下方按鈕選擇 ROM 檔案</p>
      </div>
    `;
  }
}

/**
 * 渲染 ROM 列表
 */
function renderRomList(roms: RomInfo[]): void {
  const romListEl = document.getElementById('rom-list');
  if (!romListEl) return;

  if (roms.length === 0) {
    romListEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  romListEl.innerHTML = roms.map((rom, index) => {
    const lower = rom.file.toLowerCase();
    const isGb = lower.endsWith('.gb') || lower.endsWith('.gbc');
    const isGg = lower.endsWith('.gg') || lower.endsWith('.sms');
    const isSnes = lower.endsWith('.smc') || lower.endsWith('.sfc');
    const isZip = lower.endsWith('.zip');
    const icon = isZip ? '📦' : isSnes ? '🟣' : isGg ? '🟠' : isGb ? '🟢' : '🎮';
    const systemTag = isZip
      ? '<span class="rom-system zip">ZIP</span>'
      : isSnes
        ? '<span class="rom-system snes">SNES</span>'
        : isGg
          ? '<span class="rom-system gg">GG</span>'
          : isGb
            ? '<span class="rom-system gb">GB</span>'
            : '<span class="rom-system nes">NES</span>';
    return `
      <button class="rom-item" data-index="${index}" data-file="${encodeURIComponent(rom.file)}">
        <span class="rom-icon">${icon}</span>
        <span class="rom-name">${rom.name}</span>
        ${systemTag}
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

    if (lower.endsWith('.zip')) {
      // 解壓 ZIP
      const zip = await JSZip.loadAsync(buffer);
      const romExtensions = ['.nes', '.smc', '.sfc', '.gb', '.gbc', '.gg', '.sms'];
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
      startGame(romBuffer);
    } else {
      currentRomFilename = filename;
      startGame(buffer);
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
      // 解壓 ZIP，找第一個遊戲檔案
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const romExtensions = ['.nes', '.smc', '.sfc', '.gb', '.gbc', '.gg', '.sms'];
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
    startGame(buffer);
  } catch (error) {
    console.error('載入 ROM 失敗:', error);
    alert('載入遊戲失敗，請重試');
  }
}

/**
 * 開始遊戲
 */
function startGame(romData: ArrayBuffer): void {
  if (!nes) return;

  const romBytes = new Uint8Array(romData);
  
  // 根據副檔名選擇對應的載入方法
  const lower = currentRomFilename.toLowerCase();
  console.log(`[DEBUG] Loading ROM: "${currentRomFilename}", lower: "${lower}", size: ${romBytes.length}`);
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
  powerLed?.classList.remove('on');
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
  // 更新控制器（透過 WASM 介面）
  if (newState.up !== currentDpadState.up) {
    nes?.setButton(0, ControllerButton.Up, newState.up);
  }
  if (newState.down !== currentDpadState.down) {
    nes?.setButton(0, ControllerButton.Down, newState.down);
  }
  if (newState.left !== currentDpadState.left) {
    nes?.setButton(0, ControllerButton.Left, newState.left);
  }
  if (newState.right !== currentDpadState.right) {
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
    
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.set(touch.identifier, { identifier: touch.identifier, element: elementId });
      }
      nes?.setButton(0, buttonType, true);
      btn.classList.add('pressed');
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      nes?.setButton(0, buttonType, false);
      btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      nes?.setButton(0, buttonType, false);
      btn.classList.remove('pressed');
    }, { passive: false });

    // 滑鼠事件
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonType, true);
      btn.classList.add('pressed');
    });

    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonType, false);
      btn.classList.remove('pressed');
    });

    btn.addEventListener('mouseleave', () => {
      nes?.setButton(0, buttonType, false);
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

    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonEnum, true);
      button.classList.add('pressed');
    }, { passive: false });

    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonEnum, false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonEnum, false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonEnum, true);
      button.classList.add('pressed');
    });

    button.addEventListener('mouseup', (e) => {
      e.preventDefault();
      nes?.setButton(0, buttonEnum, false);
      button.classList.remove('pressed');
    });

    button.addEventListener('mouseleave', () => {
      nes?.setButton(0, buttonEnum, false);
      button.classList.remove('pressed');
    });
  });
}

/**
 * 處理按鈕按下/釋放 (保留給其他用途)
 */
function handleButtonPress(btnType: string, pressed: boolean): void {
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

// ===== 電腦版控制 =====

/**
 * 設定電腦版控制按鈕
 */
function setupDesktopControls(): void {
  document.getElementById('btn-pause')?.addEventListener('click', stopEmulation);
  document.getElementById('btn-resume')?.addEventListener('click', startEmulation);
  document.getElementById('btn-reset')?.addEventListener('click', () => nes?.reset());
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
      drainWasmAudioToRing();  // 每幀後排入環形緩衝區，防止 WASM buffer 溢出
      accumulator -= TARGET_FRAME_TIME;
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
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

/**
 * 渲染一幀到畫布
 */
function renderFrame(): void {
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

// ===== 音頻系統 =====

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

  for (let i = 0; i < available; i++) {
    jsRing[ringW] = samples[i];
    ringW = (ringW + 1) % JS_RING_SIZE;
    if (ringCount < JS_RING_SIZE) {
      ringCount++;
    } else {
      // 環形緩衝區已滿：覆蓋最舊的樣本
      ringR = (ringR + 1) % JS_RING_SIZE;
    }
  }

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

  showToast(audioMuted ? '🔇 音頻已關閉（APU IRQ 同時停用）' : '🔊 音頻已開啟');
}

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'emu_savestate_';

/**
 * 取得帶有核心類型的存檔 key
 */
function getSaveKey(slot: number): string {
  const coreType = nes?.getCoreType() || 'nes';
  return `${SAVE_STATE_PREFIX}${coreType}_${slot}`;
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
  if (!nes) return false;
  
  try {
    const saveData = nes.exportSaveState();
    const key = getSaveKey(slot);
    localStorage.setItem(key, saveData);
    console.log(`存檔成功 (Slot ${slot})`);
    return true;
  } catch (e) {
    console.error('存檔失敗:', e);
    return false;
  }
}

function loadState(slot: number = 0): boolean {
  if (!nes) return false;
  
  try {
    const key = getSaveKey(slot);
    const saveData = localStorage.getItem(key);
    
    if (!saveData) {
      console.log(`Slot ${slot} 沒有存檔`);
      return false;
    }
    
    const success = nes.importSaveState(saveData);
    if (success) {
      console.log(`讀取存檔成功 (Slot ${slot})`);
    }
    return success;
  } catch (e) {
    console.error('讀取存檔失敗:', e);
    return false;
  }
}

function exportSaveToFile(): void {
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
  if (isSnesCore()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'flex';
    setupSnesButtons();
  } else {
    if (nesCtrl) nesCtrl.style.display = 'flex';
    if (snesCtrl) snesCtrl.style.display = 'none';
  }
}

/**
 * 設定 SNES 按鈕觸控/滑鼠事件
 */
function setupSnesButtons(): void {
  const btnDefs: { id: string; btn: number }[] = [
    { id: 'snes-btn-a', btn: SnesButton.A },
    { id: 'snes-btn-b', btn: SnesButton.B },
    { id: 'snes-btn-x', btn: SnesButton.X },
    { id: 'snes-btn-y', btn: SnesButton.Y },
    { id: 'snes-btn-l', btn: SnesButton.L },
    { id: 'snes-btn-r', btn: SnesButton.R },
  ];

  for (const { id, btn } of btnDefs) {
    const el = document.getElementById(id);
    if (!el || el.dataset.snesWired) continue;
    el.dataset.snesWired = '1';

    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      nes?.setButton(0, btn, true);
      el.classList.add('pressed');
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      nes?.setButton(0, btn, false);
      el.classList.remove('pressed');
    }, { passive: false });
    el.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      nes?.setButton(0, btn, false);
      el.classList.remove('pressed');
    }, { passive: false });
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
  await initWasm();
  await initAudio();
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
