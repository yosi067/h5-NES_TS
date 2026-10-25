/**
 * EmulatorJS（Snes9x / FCEUmm / Genesis Plus GX）的玩家即時存檔。
 *
 * 狀態檔寫在 IndexedDB；額度不足時退回 localStorage（base64）。
 * 舊版存在 localStorage 的存檔，讀取時會搬進 IndexedDB。
 * 存讀一律排隊執行，避免連按存檔／讀檔時互相覆蓋。
 */
import { readBinaryState, writeBinaryState } from '../../storage/binary-state-store';
import { runtime } from '../../app/runtime';
import { base64ToBytes, bytesToBase64 } from '../../app/storage';
import { getSaveKey } from '../../saves/save-keys';
import { isSnes9xActive } from '../active';
import { snes9xBackend } from './emulatorjs-backend';

let pendingOperation: Promise<void> = Promise.resolve();


function queueStateOperation(operation: () => Promise<boolean>): Promise<boolean> {
  const result = pendingOperation.then(operation, operation);
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}


async function saveWithPersistence(slot: number): Promise<boolean> {
  const backend = snes9xBackend;
  if (!backend || !isSnes9xActive()) return false;
  const key = getSaveKey(slot);

  try {
    const saveData = backend.saveState();
    try {
      await writeBinaryState(key, saveData);
      try {
        localStorage.removeItem(key);
      } catch { /* ignore */ }
    } catch (error) {
      console.warn('[Snes9x] IndexedDB state 儲存失敗，改用 localStorage:', error);
      localStorage.setItem(key, bytesToBase64(saveData));
    }
    console.log(`[Snes9x] 即時存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (error) {
    console.error('[Snes9x] 即時存檔失敗:', error);
    return false;
  }
}


async function loadWithPersistence(slot: number): Promise<boolean> {
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
      } catch { /* ignore */ }
    } catch (error) {
      console.error('[Snes9x] 即時讀檔資料解析失敗:', error);
      return false;
    }
  }

  if (saveData.length === 0) return false;
  try {
    backend.loadState(saveData);
    console.log(`[Snes9x] 即時讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error('[Snes9x] 即時讀檔失敗:', error);
    return false;
  }
}


export function saveEmulatorJsState(slot: number): Promise<boolean> {
  return queueStateOperation(() => saveWithPersistence(slot));
}


export function loadEmulatorJsState(slot: number): Promise<boolean> {
  return queueStateOperation(() => loadWithPersistence(slot));
}
