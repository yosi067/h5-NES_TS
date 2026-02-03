/**
 * H5-NES 模擬器主程式入口
 * 
 * 功能：
 * - GameBoy 風格 UI
 * - ROM 選擇器
 * - 虛擬控制器 (手機版)
 * - RWD 響應式設計
 */

import { 
  Nes, 
  KeyboardInputHandler, 
  DEFAULT_KEYBOARD_MAP_P1,
  Controller,
  ControllerButton
} from './core';

// ===== 型別定義 =====

interface RomInfo {
  name: string;
  file: string;
}

interface RomListResponse {
  roms: RomInfo[];
}

// ===== 全域變數 =====

let nes: Nes | null = null;
let animationId: number | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let audioContext: AudioContext | null = null;
let isRunning: boolean = false;

// ===== UI 元素 =====

let romSelector: HTMLElement | null = null;
let gameboyShell: HTMLElement | null = null;
let powerLed: HTMLElement | null = null;

// ===== 音頻設定 =====
const AUDIO_BUFFER_SIZE = 4096;

// ===== 初始化 =====

/**
 * 初始化模擬器
 */
function init(): void {
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

  imageData = ctx.createImageData(256, 240);

  // 建立 NES 實例
  nes = new Nes();

  // 設定鍵盤輸入
  const inputHandler = new KeyboardInputHandler(
    nes.controller1,
    DEFAULT_KEYBOARD_MAP_P1
  );
  inputHandler.bind();

  // 設定虛擬控制器
  setupVirtualController(nes.controller1);

  // 設定電腦版控制按鈕
  setupDesktopControls();

  // 設定 ROM 選擇器
  setupRomSelector();

  // 設定檔案選擇器
  setupFileInput();

  console.log('H5-NES 模擬器已初始化');
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
    const response = await fetch('./roms.json');
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

  romListEl.innerHTML = roms.map((rom, index) => `
    <button class="rom-item" data-index="${index}" data-file="${encodeURIComponent(rom.file)}">
      <span class="rom-icon">🎮</span>
      <span class="rom-name">${rom.name}</span>
      <span class="rom-arrow">▶</span>
    </button>
  `).join('');

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
 * 從伺服器載入 ROM
 */
async function loadRomFromServer(filename: string): Promise<void> {
  try {
    const response = await fetch(`./roms/${encodeURIComponent(filename)}`);
    if (!response.ok) {
      throw new Error(`無法載入 ROM: ${filename}`);
    }
    
    const buffer = await response.arrayBuffer();
    startGame(buffer);
  } catch (error) {
    console.error('載入 ROM 失敗:', error);
    alert('載入遊戲失敗，請重試');
  }
}

/**
 * 從檔案載入 ROM
 */
async function loadRomFromFile(file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer();
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

  if (nes.loadRom(romData)) {
    console.log('ROM 載入成功，開始執行');
    
    // 隱藏選擇器，顯示遊戲畫面
    hideRomSelector();
    
    // 確保音頻系統設定正確
    if (audioContext) {
      nes.setAudioSampleRate(audioContext.sampleRate);
      resumeAudio();
    }
    
    // 開啟電源指示燈
    powerLed?.classList.add('on');
    
    // 開始模擬
    startEmulation();
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

// ===== 虛擬控制器 =====

/**
 * 設定虛擬控制器
 */
function setupVirtualController(controller: Controller): void {
  const buttons = document.querySelectorAll('[data-btn]');
  
  buttons.forEach(btn => {
    const button = btn as HTMLElement;
    const btnType = button.dataset.btn;

    // 觸控開始
    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleButtonPress(controller, btnType!, true);
      button.classList.add('pressed');
    }, { passive: false });

    // 觸控結束
    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleButtonPress(controller, btnType!, false);
      button.classList.remove('pressed');
    }, { passive: false });

    // 觸控取消
    button.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      handleButtonPress(controller, btnType!, false);
      button.classList.remove('pressed');
    }, { passive: false });

    // 滑鼠事件 (用於測試)
    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handleButtonPress(controller, btnType!, true);
      button.classList.add('pressed');
    });

    button.addEventListener('mouseup', (e) => {
      e.preventDefault();
      handleButtonPress(controller, btnType!, false);
      button.classList.remove('pressed');
    });

    button.addEventListener('mouseleave', () => {
      handleButtonPress(controller, btnType!, false);
      button.classList.remove('pressed');
    });
  });

  // 防止頁面捲動
  const virtualController = document.getElementById('virtual-controller');
  virtualController?.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
}

/**
 * 處理按鈕按下/釋放
 */
function handleButtonPress(controller: Controller, btnType: string, pressed: boolean): void {
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
    controller.setButton(button, pressed);
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

  // NES NTSC 幀率：60.0988 fps
  const TARGET_FRAME_TIME = 1000 / 60.0988;
  let lastFrameTime = performance.now();
  let accumulator = 0;

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

  const frameBuffer = nes.getFrameBuffer();
  const data = imageData.data;

  for (let i = 0; i < 256 * 240; i++) {
    const pixel = frameBuffer[i];
    const offset = i * 4;
    data[offset + 0] = (pixel >> 16) & 0xFF;
    data[offset + 1] = (pixel >> 8) & 0xFF;
    data[offset + 2] = pixel & 0xFF;
    data[offset + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

// ===== 音頻系統 =====

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
      if (nes && isRunning) {
        const samplesRead = nes.readAudioSamples(output);
        if (samplesRead === 0) {
          output.fill(0);
        }
      } else {
        output.fill(0);
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

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'nes_savestate_';

function saveState(slot: number = 0): boolean {
  if (!nes) return false;
  
  try {
    const saveData = nes.exportSaveState();
    const key = `${SAVE_STATE_PREFIX}${slot}`;
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
    const key = `${SAVE_STATE_PREFIX}${slot}`;
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
  const blob = new Blob([saveData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `nes_savestate_${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
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
  });
}

// ===== 全域匯出 =====

declare global {
  interface Window {
    nes: Nes | null;
    startEmulation: () => void;
    stopEmulation: () => void;
    saveState: (slot?: number) => boolean;
    loadState: (slot?: number) => boolean;
    exportSaveToFile: () => void;
    showRomSelector: () => void;
  }
}

window.nes = null;
window.startEmulation = startEmulation;
window.stopEmulation = stopEmulation;
window.saveState = saveState;
window.loadState = loadState;
window.exportSaveToFile = exportSaveToFile;
window.showRomSelector = showRomSelector;

// ===== 啟動 =====

document.addEventListener('DOMContentLoaded', async () => {
  init();
  await initAudio();
  setupKeyboardShortcuts();
  window.nes = nes;
  
  // 用戶交互後恢復音頻
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });
});
