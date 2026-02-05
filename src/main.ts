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
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}roms/${encodeURIComponent(filename)}`);
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
function setupVirtualController(controller: Controller): void {
  // 設定 D-Pad 觸控區域 (支援斜向)
  setupDpad(controller);
  
  // 設定 A/B 按鈕 (支援同時按)
  setupABButtons(controller);
  
  // 設定功能按鈕 (Select/Start)
  setupFunctionButtons(controller);

  // 防止頁面捲動
  const virtualController = document.getElementById('virtual-controller');
  virtualController?.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
}

/**
 * 設定 D-Pad (區域偵測，支援斜向輸入)
 */
function setupDpad(controller: Controller): void {
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
    
    applyDpadState(controller, newState);
  };

  const clearDpad = () => {
    const newState: DpadState = { up: false, down: false, left: false, right: false };
    applyDpadState(controller, newState);
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
    applyDpadState(controller, newState);
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
    applyDpadState(controller, newState);
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
function applyDpadState(controller: Controller, newState: DpadState): void {
  // 更新控制器
  if (newState.up !== currentDpadState.up) {
    controller.setButton(ControllerButton.Up, newState.up);
  }
  if (newState.down !== currentDpadState.down) {
    controller.setButton(ControllerButton.Down, newState.down);
  }
  if (newState.left !== currentDpadState.left) {
    controller.setButton(ControllerButton.Left, newState.left);
  }
  if (newState.right !== currentDpadState.right) {
    controller.setButton(ControllerButton.Right, newState.right);
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
function setupABButtons(controller: Controller): void {
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
      controller.setButton(buttonType, true);
      btn.classList.add('pressed');
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      controller.setButton(buttonType, false);
      btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        activeTouches.delete(touch.identifier);
      }
      controller.setButton(buttonType, false);
      btn.classList.remove('pressed');
    }, { passive: false });

    // 滑鼠事件
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      controller.setButton(buttonType, true);
      btn.classList.add('pressed');
    });

    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      controller.setButton(buttonType, false);
      btn.classList.remove('pressed');
    });

    btn.addEventListener('mouseleave', () => {
      controller.setButton(buttonType, false);
      btn.classList.remove('pressed');
    });
  };

  setupButton(btnA, ControllerButton.A, 'a');
  setupButton(btnB, ControllerButton.B, 'b');
}

/**
 * 設定功能按鈕 (Select/Start)
 */
function setupFunctionButtons(controller: Controller): void {
  const buttons = document.querySelectorAll('[data-btn="select"], [data-btn="start"]');
  
  buttons.forEach(btn => {
    const button = btn as HTMLElement;
    const btnType = button.dataset.btn;
    const buttonEnum = btnType === 'start' ? ControllerButton.Start : ControllerButton.Select;

    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      controller.setButton(buttonEnum, true);
      button.classList.add('pressed');
    }, { passive: false });

    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      controller.setButton(buttonEnum, false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      controller.setButton(buttonEnum, false);
      button.classList.remove('pressed');
    }, { passive: false });

    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      controller.setButton(buttonEnum, true);
      button.classList.add('pressed');
    });

    button.addEventListener('mouseup', (e) => {
      e.preventDefault();
      controller.setButton(buttonEnum, false);
      button.classList.remove('pressed');
    });

    button.addEventListener('mouseleave', () => {
      controller.setButton(buttonEnum, false);
      button.classList.remove('pressed');
    });
  });
}

/**
 * 處理按鈕按下/釋放 (保留給其他用途)
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
