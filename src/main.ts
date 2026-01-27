/**
 * H5-NES 模擬器主程式入口
 */

import { 
  Nes, 
  KeyboardInputHandler, 
  DEFAULT_KEYBOARD_MAP_P1 
} from './core';

// 全域 NES 實例
let nes: Nes | null = null;
let animationId: number | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;

/**
 * 初始化模擬器
 */
function init(): void {
  // 建立畫布
  canvas = document.getElementById('screen') as HTMLCanvasElement;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'screen';
    canvas.width = 256;
    canvas.height = 240;
    document.body.appendChild(canvas);
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

  // 設定檔案選擇器
  setupFileInput();

  console.log('H5-NES 模擬器已初始化');
}

/**
 * 設定 ROM 檔案選擇器
 */
function setupFileInput(): void {
  let fileInput = document.getElementById('rom-input') as HTMLInputElement;
  
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'rom-input';
    fileInput.accept = '.nes';
    document.body.insertBefore(fileInput, canvas);
  }

  fileInput.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file && nes) {
      const buffer = await file.arrayBuffer();
      if (nes.loadRom(buffer)) {
        console.log('ROM 載入成功，開始執行');
        
        // 確保音頻系統設定正確
        if (audioContext) {
          nes.setAudioSampleRate(audioContext.sampleRate);
          resumeAudio();
        }
        
        startEmulation();
      } else {
        console.error('ROM 載入失敗');
      }
    }
  });
}

/**
 * 開始模擬
 */
function startEmulation(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  // NES NTSC 幀率：60.0988 fps
  const TARGET_FRAME_TIME = 1000 / 60.0988; // 約 16.6392 毫秒
  let lastFrameTime = performance.now();
  let accumulator = 0;

  const frameLoop = (currentTime: number): void => {
    if (!nes || !ctx || !imageData) return;

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    // 累積經過的時間
    accumulator += deltaTime;
    
    // 限制最大累積時間，避免長時間暫停後瘋狂追趕
    if (accumulator > TARGET_FRAME_TIME * 3) {
      accumulator = TARGET_FRAME_TIME;
    }

    // 執行足夠的幀數以趕上目標時間
    while (accumulator >= TARGET_FRAME_TIME) {
      nes.frame();
      accumulator -= TARGET_FRAME_TIME;
    }

    // 渲染到畫布（只渲染最後一幀）
    renderFrame();

    // 排程下一幀
    animationId = requestAnimationFrame(frameLoop);
  };

  animationId = requestAnimationFrame(frameLoop);
}

/**
 * 停止模擬
 */
function stopEmulation(): void {
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

  // 將幀緩衝區轉換為 RGBA 格式
  for (let i = 0; i < 256 * 240; i++) {
    const pixel = frameBuffer[i];
    const offset = i * 4;
    data[offset + 0] = (pixel >> 16) & 0xFF; // R
    data[offset + 1] = (pixel >> 8) & 0xFF;  // G
    data[offset + 2] = pixel & 0xFF;         // B
    data[offset + 3] = 255;                   // A
  }

  ctx.putImageData(imageData, 0, 0);
}

// ===== 音頻系統 =====

let audioContext: AudioContext | null = null;
const AUDIO_BUFFER_SIZE = 4096; // 增大緩衝區以減少卡頓

/**
 * 初始化音頻系統
 */
async function initAudio(): Promise<void> {
  try {
    audioContext = new AudioContext({ sampleRate: 44100 });
    
    // 設定 NES 的音頻取樣率
    if (nes) {
      nes.setAudioSampleRate(audioContext.sampleRate);
    }
    
    // 使用 ScriptProcessor (較舊但相容性較好)
    const scriptProcessor = audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 0, 1);
    
    scriptProcessor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      if (nes) {
        // 使用新的 readSamples API
        const samplesRead = nes.readAudioSamples(output);
        
        // 如果沒有讀到任何取樣，靜音
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
 * 恢復音頻 (用於用戶交互後)
 */
function resumeAudio(): void {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'nes_savestate_';

/**
 * 儲存遊戲狀態
 */
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

/**
 * 載入遊戲狀態
 */
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

/**
 * 匯出存檔為檔案
 */
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

/**
 * 從檔案匯入存檔
 */
async function _importSaveFromFile(file: File): Promise<boolean> {
  if (!nes) return false;
  
  try {
    const text = await file.text();
    return nes.importSaveState(text);
  } catch (e) {
    console.error('匯入存檔失敗:', e);
    return false;
  }
}

// ===== 鍵盤快捷鍵 =====

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // F5: 快速存檔
    if (e.key === 'F5') {
      e.preventDefault();
      saveState(0);
    }
    // F7: 快速讀檔
    if (e.key === 'F7') {
      e.preventDefault();
      loadState(0);
    }
    // F1-F4: 存檔槽 1-4
    if (e.key >= 'F1' && e.key <= 'F4' && e.shiftKey) {
      e.preventDefault();
      const slot = parseInt(e.key[1]);
      saveState(slot);
    }
    // 1-4: 讀檔槽 1-4
    if (e.key >= '1' && e.key <= '4' && e.ctrlKey) {
      e.preventDefault();
      const slot = parseInt(e.key);
      loadState(slot);
    }
  });
}

// 匯出給全域使用
declare global {
  interface Window {
    nes: Nes | null;
    startEmulation: () => void;
    stopEmulation: () => void;
    saveState: (slot?: number) => boolean;
    loadState: (slot?: number) => boolean;
    exportSaveToFile: () => void;
  }
}

window.nes = null;
window.startEmulation = startEmulation;
window.stopEmulation = stopEmulation;
window.saveState = saveState;
window.loadState = loadState;
window.exportSaveToFile = exportSaveToFile;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  init();
  await initAudio();
  setupKeyboardShortcuts();
  window.nes = nes;
  
  // 用戶交互後恢復音頻
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
});
