/**
 * 遊戲內建電池存檔（SRAM）的保存與載入。
 */
import { runtime } from '../app/runtime';
import { isSnes9xActive } from '../backends/active';
import { snes9xBackend } from '../backends/emulatorjs-backend';

// ===== SRAM 持久化 (遊戲內建存檔) =====

const SRAM_PREFIX = 'emu_sram_';


function getSramKey(): string {
  return `${SRAM_PREFIX}${runtime.currentRomFilename}`;
}


/** 將 SRAM 儲存到 localStorage */
export function saveSram(): void {
  if (isSnes9xActive()) {
    void snes9xBackend?.syncSaveData().catch(error => {
      console.warn('[Snes9x] 自動儲存 SRAM 發生問題:', error);
    });
    return;
  }

  if (runtime.activeBackend !== 'wasm' || !runtime.nes || !runtime.currentRomFilename) return;
  
  try {
    const sramData = runtime.nes.exportSram();
    if (sramData && sramData.length > 0) {
      localStorage.setItem(getSramKey(), sramData);
    }
  } catch (e) {
    console.error('SRAM 儲存失敗:', e);
  }
}


/** 從 localStorage 讀取 SRAM */
export function loadSram(): void {
  if (runtime.activeBackend !== 'wasm' || !runtime.nes || !runtime.currentRomFilename) return;
  
  try {
    const sramData = localStorage.getItem(getSramKey());
    if (sramData) {
      runtime.nes.importSram(sramData);
      console.log('SRAM 已從 localStorage 載入');
    }
  } catch (e) {
    console.error('SRAM 讀取失敗:', e);
  }
}
