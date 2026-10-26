/**
 * 遊戲內建電池存檔（SRAM）的保存與載入；實際存放方式由各後端決定。
 */
import { runtime } from '../app/runtime';
import { getActiveBackend } from '../backends/registry';

// ===== SRAM 持久化 (遊戲內建存檔) =====

const SRAM_PREFIX = 'emu_sram_';


/** 自製核心的 SRAM 存放位置；玩家既有的電池存檔都在這個 key，不可更改。 */
export function getSramKey(): string {
  return `${SRAM_PREFIX}${runtime.currentRomFilename}`;
}


/** 保存目前遊戲的電池存檔 */
export function saveSram(): void {
  getActiveBackend().persistBatterySave();
}


/** 載入目前遊戲的電池存檔 */
export function loadSram(): void {
  getActiveBackend().restoreBatterySave();
}
