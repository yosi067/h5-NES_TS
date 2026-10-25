/**
 * 把核心狀態以 base64 存進 localStorage 欄位（FBNeo 與 EmulatorJS 的同步存讀共用）。
 */
import { runtime } from '../app/runtime';
import { base64ToBytes, bytesToBase64 } from '../app/storage';
import { getSaveKey } from './save-keys';

export function writeLocalStateSlot(label: string, slot: number, capture: () => Uint8Array): boolean {
  try {
    const saveData = capture();
    localStorage.setItem(getSaveKey(slot), bytesToBase64(saveData));
    console.log(`[${label}] 即時存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (error) {
    console.error(`[${label}] 即時存檔失敗:`, error);
    return false;
  }
}


export function readLocalStateSlot(label: string, slot: number, apply: (saveData: Uint8Array) => void): boolean {
  try {
    const saveData = localStorage.getItem(getSaveKey(slot));
    if (!saveData) {
      console.log(`[${label}] ROM="${runtime.currentRomFilename}" slot=${slot} 沒有存檔`);
      return false;
    }
    apply(base64ToBytes(saveData));
    console.log(`[${label}] 即時讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error(`[${label}] 即時讀檔失敗:`, error);
    return false;
  }
}


/** 讓瀏覽器下載一份檔案。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
