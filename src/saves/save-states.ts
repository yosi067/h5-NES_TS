/**
 * 即時存檔的對外入口：存讀、玩家提示、欄位說明。
 * 各後端怎麼存由各自的 adapter 決定（backends 底下的 *-adapter.ts），這裡只負責分派與共同的 UI 行為。
 */
import { formatSaveTime, getSaveTime, recordSaveTime } from '../features/save-meta';
import { readBinaryState } from '../storage/binary-state-store';
import { getSafeStorage } from '../app/storage';
import { getActiveBackend } from '../backends/registry';
import { showToast } from '../ui/dialogs';
import { getSaveKey } from './save-keys';

export { getSaveKey } from './save-keys';


/** 同步即時存檔（主控台 window.saveState 與街機觸控存檔鈕）。 */
export function saveState(slot: number = 0): boolean {
  return getActiveBackend().saveStateNow(slot);
}


export function loadState(slot: number = 0): boolean {
  return getActiveBackend().loadStateNow(slot);
}


/** 玩家操作的存檔：可跨重新整理保存，成功時記錄存檔時間。 */
export function saveStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  return getActiveBackend().saveState(slot).then(success => {
    if (success) recordSaveTime(getSafeStorage(), getSaveKey(slot));
    if (showResult) showToast(success ? '✅ 存檔成功（可跨重新整理）' : '❌ 存檔失敗');
    return success;
  });
}


export function loadStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  return getActiveBackend().loadState(slot).then(success => {
    if (showResult) showToast(success ? '✅ 讀取成功' : '❌ 沒有有效存檔');
    return success;
  });
}


/** 主控台 window.exportSaveToFile：把目前狀態下載成檔案（除錯用）。 */
export function exportSaveToFile(): void {
  getActiveBackend().exportStateFile();
}


// ---- 存檔欄位說明 ----

export async function describeSaveSlot(slot: number): Promise<string> {
  if (!getActiveBackend().supportsSaveStates) return '使用遊戲內存檔';
  const key = getSaveKey(slot);
  const savedAt = getSaveTime(getSafeStorage(), key);
  if (savedAt) return formatSaveTime(savedAt);
  try {
    if (localStorage.getItem(key)) return '有存檔';
  } catch {
    // ignore
  }
  try {
    if ((await readBinaryState(key))?.length) return '有存檔';
  } catch {
    // ignore
  }
  return '空';
}
