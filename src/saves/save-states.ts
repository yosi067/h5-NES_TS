/**
 * 即時存檔（各後端的存讀、欄位與持久化）。
 */
import { formatSaveTime, getSaveTime, recordSaveTime } from '../features/save-meta';
import { readBinaryState, writeBinaryState } from '../storage/binary-state-store';
import { EmuWasm } from '../wasm/nes_wasm.js';
import { runtime } from '../app/runtime';
import { base64ToBytes, bytesToBase64, getSafeStorage } from '../app/storage';
import { audioMuted, clearAudioQueue } from '../audio/audio-output';
import { isFbNeoActive, isMupenN64Active, isSnes9xActive } from '../backends/active';
import { snes9xBackend } from '../backends/emulatorjs-backend';
import { fbneoCore } from '../backends/fbneo/fbneo-backend';
import { renderFrame } from '../backends/lifecycle';
import { n64Controls } from '../backends/n64/n64-backend';
import { showToast } from '../ui/dialogs';

// ===== 存檔系統 =====

const SAVE_STATE_PREFIX = 'emu_savestate_';


// Native NES snapshots own complete hardware inside the current Rust instance.
// A token is NOT a portable save file: never put it in localStorage. WeakMap
// also prevents a replacement/freed EmuWasm from inheriting another core's slots.
const nesTemporaryStates = new WeakMap<EmuWasm, Map<string, string>>();

const NES_TEMP_STATE_PREFIX = '#NES-TEMP-2:';


const NES_PERSISTENT_STATE_PREFIX = 'NES-SAVE-1:';


export function isNesPersistentState(state: string | null): state is string {
  return Boolean(state?.startsWith(NES_PERSISTENT_STATE_PREFIX));
}


async function writeNesPersistentState(key: string, state: string): Promise<void> {
  try {
    localStorage.setItem(key, state);
    console.log(`[NES] localStorage 持久存檔成功 key="${key}" size=${state.length}`);
    return;
  } catch (error) {
    console.warn('[NES] localStorage 持久存檔失敗，改用 IndexedDB:', error);
  }
  try {
    await writeBinaryState(key, new TextEncoder().encode(state));
    try { localStorage.removeItem(key); } catch {
    }
  } catch (error) {
    console.error('[NES] IndexedDB 持久存檔也失敗:', error);
    throw error;
  }
}


async function readNesPersistentState(key: string): Promise<string | null> {
  try {
    const state = localStorage.getItem(key);
    if (isNesPersistentState(state)) return state;
    if (state) console.warn('[NES] 忽略舊版或非持久存檔資料，改查 IndexedDB');
  } catch (error) {
    console.warn('[NES] localStorage 持久存檔讀取失敗，改查 IndexedDB:', error);
  }
  try {
    const encoded = await readBinaryState(key);
    if (encoded && encoded.length > 0) {
      const state = new TextDecoder().decode(encoded);
      if (isNesPersistentState(state)) return state;
      console.warn('[NES] 忽略 IndexedDB 中的舊版或非持久存檔資料');
    }
  } catch (error) {
    console.warn('[NES] IndexedDB 持久存檔讀取失敗:', error);
  }
  return null;
}


/**
 * 取得帶有核心類型 + ROM 名稱的存檔 key（每個遊戲獨立存檔）
 */
export function getSaveKey(slot: number | 'auto'): string {
  const coreType = isMupenN64Active() ? 'n64'
    : isFbNeoActive() ? 'fbneo'
    : isSnes9xActive() ? 'snes9x'
    : (runtime.nes?.getCoreType() || 'nes');
  // Use ROM filename to isolate saves per game
  const romId = runtime.currentRomFilename
    ? runtime.currentRomFilename.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 60)
    : 'unknown';
  return `${SAVE_STATE_PREFIX}${coreType}_${romId}_${slot}`;
}


/**
 * 嘗試從舊的不含 ROM 名稱的 key 遷移存檔（向後相容）
 */
function migrateLegacySave(slot: number): void {
  const coreType = isMupenN64Active() ? 'n64' : (runtime.nes?.getCoreType() || 'nes');
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


export function saveState(slot: number = 0): boolean {
  if (isSnes9xActive()) {
    if (!snes9xBackend) return false;
    try {
      const saveData = snes9xBackend.saveState();
      localStorage.setItem(getSaveKey(slot), bytesToBase64(saveData));
      console.log(`[Snes9x] 即時存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${saveData.length}`);
      return true;
    } catch (error) {
      console.error('[Snes9x] 即時存檔失敗:', error);
      return false;
    }
  }
  if (isFbNeoActive()) {
    if (!fbneoCore) return false;
    try {
      const saveData = fbneoCore.saveState();
      localStorage.setItem(getSaveKey(slot), bytesToBase64(saveData));
      console.log(`[FBNeo] 即時存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${saveData.length}`);
      return true;
    } catch (error) {
      console.error('[FBNeo] 即時存檔失敗:', error);
      return false;
    }
  }
  if (isMupenN64Active()) {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態存檔 API');
    return false;
  }
  if (!runtime.nes) return false;
  
  try {
    const nativeNes = runtime.nes.getCoreType() === 'nes';
    if (nativeNes && (!runtime.currentRomFilename || runtime.gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16)) return false;
    const saveData = nativeNes
      ? runtime.nes.exportSaveStateForSlot(slot)
      : runtime.nes.exportSaveState();
    if (!saveData) return false;
    const key = getSaveKey(slot);
    if (runtime.nes.getCoreType() === 'nes') {
      // Fail closed with an older WASM build; its NESW v1 export is incomplete.
      if (!saveData.includes(NES_TEMP_STATE_PREFIX)) {
        console.warn('[NES] 核心尚未支援安全暫存，請更新 WASM；未寫入不完整存檔');
        return false;
      }
      let slots = nesTemporaryStates.get(runtime.nes);
      if (!slots) { slots = new Map(); nesTemporaryStates.set(runtime.nes, slots); }
      slots.delete(key);
      slots.set(key, saveData);
      // User slots are stable in Rust; diagnostic exports use a separate registry.
      while (slots.size > 16) slots.delete(slots.keys().next().value!);
      console.log(`[NES] 快速暫存成功（同核心）ROM="${runtime.currentRomFilename}" slot=${slot}`);
      return true;
    }
    localStorage.setItem(key, saveData);
    console.log(`[SaveState] 存檔成功 ROM="${runtime.currentRomFilename}" key="${key}" slot=${slot} size=${saveData.length}`);
    return true;
  } catch (e) {
    console.error('[SaveState] 存檔失敗:', e);
    return false;
  }
}


export function loadState(slot: number = 0): boolean {
  if (isSnes9xActive()) {
    if (!snes9xBackend) return false;
    try {
      const saveData = localStorage.getItem(getSaveKey(slot));
      if (!saveData) return false;
      snes9xBackend.loadState(base64ToBytes(saveData));
      console.log(`[Snes9x] 即時讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
      return true;
    } catch (error) {
      console.error('[Snes9x] 即時讀檔失敗:', error);
      return false;
    }
  }
  if (isFbNeoActive()) {
    if (!fbneoCore) return false;
    try {
      const saveData = localStorage.getItem(getSaveKey(slot));
      if (!saveData) {
        console.log(`[FBNeo] ROM="${runtime.currentRomFilename}" slot=${slot} 沒有存檔`);
        return false;
      }
      fbneoCore.loadState(base64ToBytes(saveData));
      console.log(`[FBNeo] 即時讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
      return true;
    } catch (error) {
      console.error('[FBNeo] 即時讀檔失敗:', error);
      return false;
    }
  }
  if (isMupenN64Active()) {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態讀檔 API');
    return false;
  }
  if (!runtime.nes) return false;
  
  try {
    const key = getSaveKey(slot);
    const nativeNes = runtime.nes.getCoreType() === 'nes';
    if (nativeNes && (!runtime.currentRomFilename || runtime.gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16)) return false;
    const saveData = nativeNes
      ? nesTemporaryStates.get(runtime.nes)?.get(key)
      : localStorage.getItem(key);
    
    if (!saveData) {
      console.log(`[SaveState] ROM="${runtime.currentRomFilename}" key="${key}" slot=${slot} 沒有存檔`);
      return false;
    }
    
    const success = runtime.nes.importSaveState(saveData);
    if (success) {
      if (nativeNes) {
        clearAudioQueue();
        // Keep the user's current mute preference; discard queued future audio.
        runtime.nes.consumeAudioSamples();
        runtime.nes.setAudioEnabled(!audioMuted);
        renderFrame();
      }
      console.log(`[SaveState] 讀取成功 ROM="${runtime.currentRomFilename}" key="${key}" slot=${slot}`);
      // Diagnostic: dump PPU state after loading save state (for transparency diagnosis)
      try {
        const colorState = (runtime.nes as any).debugPpuColorState?.() || 'N/A';
        const dspInfo = (runtime.nes as any).debugDspVoices?.() || 'N/A';
        const cgram = (runtime.nes as any).debugCgram?.(32) || 'N/A';
        console.log(`[LOAD STATE DIAG] PPU Color:\n${colorState}\nDSP:\n${dspInfo}\nCGRAM[0-31]:\n${cgram}`);
      } catch(e) { /* ignore */ }
    } else {
      if (nativeNes) nesTemporaryStates.get(runtime.nes)?.delete(key);
      console.warn(`[SaveState] 讀取失敗（資料不相容）ROM="${runtime.currentRomFilename}" key="${key}"`);
    }
    return success;
  } catch (e) {
    console.error('[SaveState] 讀取存檔失敗:', e);
    return false;
  }
}


let snes9xStateOperation: Promise<void> = Promise.resolve();


function queueSnes9xStateOperation(operation: () => Promise<boolean>): Promise<boolean> {
  const result = snes9xStateOperation.then(operation, operation);
  snes9xStateOperation = result.then(() => undefined, () => undefined);
  return result;
}


async function saveSnes9xStateWithPersistence(slot: number): Promise<boolean> {
  const backend = snes9xBackend;
  if (!backend || !isSnes9xActive()) return false;
  const key = getSaveKey(slot);

  try {
    const saveData = backend.saveState();
    try {
      await writeBinaryState(key, saveData);
      try {
        localStorage.removeItem(key);
      } catch {
      }
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


async function loadSnes9xStateWithPersistence(slot: number): Promise<boolean> {
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
      } catch {
      }
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


async function saveNesStateWithPersistence(slot: number): Promise<boolean> {
  const core = runtime.nes;
  if (!core || core.getCoreType() !== 'nes' || !runtime.currentRomFilename || runtime.gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16) return false;

  try {
    const token = core.exportSaveStateForSlot(slot);
    const persistentState = core.exportPersistentSaveState();
    if (!token || !persistentState) return false;
    await writeNesPersistentState(getSaveKey(slot), persistentState);
    let slots = nesTemporaryStates.get(core);
    if (!slots) { slots = new Map(); nesTemporaryStates.set(core, slots); }
    const key = getSaveKey(slot);
    slots.delete(key);
    slots.set(key, token);
    while (slots.size > 16) slots.delete(slots.keys().next().value!);
    console.log(`[NES] 持久存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${persistentState.length}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久存檔失敗:', error);
    return false;
  }
}


async function loadNesStateWithPersistence(slot: number): Promise<boolean> {
  const core = runtime.nes;
  if (!core || core.getCoreType() !== 'nes' || !runtime.currentRomFilename || runtime.gameLoadAbortController
      || !Number.isInteger(slot) || slot < 0 || slot >= 16) return false;

  const key = getSaveKey(slot);
  const sessionToken = nesTemporaryStates.get(core)?.get(key);
  if (sessionToken) return loadState(slot);

  const persistentState = await readNesPersistentState(key);
  if (!persistentState) return false;
  try {
    const success = core.importPersistentSaveState(persistentState);
    if (!success) {
      console.warn(`[NES] 持久存檔不相容或已損壞 ROM="${runtime.currentRomFilename}" slot=${slot}`);
      return false;
    }
    clearAudioQueue();
    core.consumeAudioSamples();
    core.setAudioEnabled(!audioMuted);
    renderFrame();
    console.log(`[NES] 持久讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久讀檔失敗:', error);
    return false;
  }
}


export function saveStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  const operation = isSnes9xActive()
    ? queueSnes9xStateOperation(() => saveSnes9xStateWithPersistence(slot))
    : runtime.activeBackend === 'wasm' && runtime.nes?.getCoreType() === 'nes'
      ? saveNesStateWithPersistence(slot)
    : Promise.resolve(saveState(slot));
  return operation.then(success => {
    if (success) recordSaveTime(getSafeStorage(), getSaveKey(slot));
    if (showResult) showToast(success ? '✅ 存檔成功（可跨重新整理）' : '❌ 存檔失敗');
    return success;
  });
}


export function loadStateForUser(slot: number = 0, showResult = false): Promise<boolean> {
  const operation = isSnes9xActive()
    ? queueSnes9xStateOperation(() => loadSnes9xStateWithPersistence(slot))
    : runtime.activeBackend === 'wasm' && runtime.nes?.getCoreType() === 'nes'
      ? loadNesStateWithPersistence(slot)
    : Promise.resolve(loadState(slot));
  return operation.then(success => {
    if (showResult) showToast(success ? '✅ 讀取成功' : '❌ 沒有有效存檔');
    return success;
  });
}


export function exportSaveToFile(): void {
  if (runtime.activeBackend === 'wasm' && runtime.nes?.getCoreType() === 'nes') {
    const saveData = runtime.nes.exportPersistentSaveState();
    if (!saveData) {
      showToast('NES 尚未準備好，不能匯出存檔');
      return;
    }
    const blob = new Blob([saveData], { type: 'application/x-nes-save' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nes_savestate_${Date.now()}.nes-save`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 存檔已匯出');
    return;
  }
  if (isFbNeoActive()) {
    showToast('FBNeo 即時存檔尚未支援');
    return;
  }
  if (isMupenN64Active()) {
    void n64Controls?.forceDumpSaveFiles?.();
    showToast('N64 會使用遊戲內建存檔');
    return;
  }
  if (!runtime.nes) return;
  
  const saveData = runtime.nes.exportSaveState();
  const blob = new Blob([saveData], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  const coreTag = runtime.nes?.getCoreType() || 'emu';
  a.download = `${coreTag}_savestate_${Date.now()}.txt`;
  a.click();
  
  URL.revokeObjectURL(url);
}


// ---- 存檔欄位說明 ----

export async function describeSaveSlot(slot: number): Promise<string> {
  if (isMupenN64Active()) return '使用遊戲內存檔';
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
