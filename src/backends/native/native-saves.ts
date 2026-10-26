/**
 * 自製 WASM 核心的存檔：即時存檔欄位、FC 的持久存檔、電池存檔（SRAM）與匯出。
 *
 * FC：同一個核心實例內用「暫存 token」快速存讀；玩家存檔另外寫一份可跨重新整理的
 *     持久格式（NES-SAVE-1:），先寫 localStorage，額度不足才改用 IndexedDB。
 * GB / GG / SFC：核心匯出的字串直接存在 localStorage。
 */
import { readBinaryState, writeBinaryState } from '../../storage/binary-state-store';
import { EmuWasm } from '../../wasm/nes_wasm.js';
import { runtime } from '../../app/runtime';
import { audioMuted, clearAudioQueue } from '../../audio/audio-output';
import { downloadBlob } from '../../app/storage';
import { getSaveKey } from '../../saves/save-keys';
import { getSramKey } from '../../saves/sram';
import { showToast } from '../../ui/dialogs';
import { renderFrame } from '../lifecycle';
import { logSnesLoadStateDiagnostics } from './snes-diagnostics';

// Native NES snapshots own complete hardware inside the current Rust instance.
// A token is NOT a portable save file: never put it in localStorage. WeakMap
// also prevents a replacement/freed EmuWasm from inheriting another core's slots.
const nesTemporaryStates = new WeakMap<EmuWasm, Map<string, string>>();

const NES_TEMP_STATE_PREFIX = '#NES-TEMP-2:';

const NES_PERSISTENT_STATE_PREFIX = 'NES-SAVE-1:';

/** FC 存檔欄位上限（Rust 端固定 16 格）。 */
const NES_SLOT_COUNT = 16;


export function isNesPersistentState(state: string | null): state is string {
  return Boolean(state?.startsWith(NES_PERSISTENT_STATE_PREFIX));
}


function isNativeNes(core: EmuWasm | null): boolean {
  return core?.getCoreType() === 'nes';
}


/** FC 存讀前的共同檢查：載入中或欄位超出範圍時一律拒絕。 */
function canUseNesSlot(slot: number): boolean {
  return Boolean(runtime.currentRomFilename) && !runtime.gameLoadAbortController
    && Number.isInteger(slot) && slot >= 0 && slot < NES_SLOT_COUNT;
}


function rememberNesToken(core: EmuWasm, key: string, token: string): void {
  let slots = nesTemporaryStates.get(core);
  if (!slots) { slots = new Map(); nesTemporaryStates.set(core, slots); }
  slots.delete(key);
  slots.set(key, token);
  // User slots are stable in Rust; diagnostic exports use a separate registry.
  while (slots.size > NES_SLOT_COUNT) slots.delete(slots.keys().next().value!);
}


/** 讀檔後丟掉舊的聲音、維持玩家的靜音設定，並立刻畫出新畫面。 */
function settleNesAfterLoad(core: EmuWasm): void {
  clearAudioQueue();
  core.consumeAudioSamples();
  core.setAudioEnabled(!audioMuted);
  renderFrame();
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
    try { localStorage.removeItem(key); } catch { /* ignore */ }
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


/** 同步即時存檔：FC 存成同核心暫存 token，其他核心寫進 localStorage。 */
export function saveNativeStateNow(slot: number): boolean {
  const core = runtime.nes;
  if (!core) return false;

  try {
    const nativeNes = isNativeNes(core);
    if (nativeNes && !canUseNesSlot(slot)) return false;
    const saveData = nativeNes ? core.exportSaveStateForSlot(slot) : core.exportSaveState();
    if (!saveData) return false;
    const key = getSaveKey(slot);
    if (nativeNes) {
      // Fail closed with an older WASM build; its NESW v1 export is incomplete.
      if (!saveData.includes(NES_TEMP_STATE_PREFIX)) {
        console.warn('[NES] 核心尚未支援安全暫存，請更新 WASM；未寫入不完整存檔');
        return false;
      }
      rememberNesToken(core, key, saveData);
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


export function loadNativeStateNow(slot: number): boolean {
  const core = runtime.nes;
  if (!core) return false;

  try {
    const key = getSaveKey(slot);
    const nativeNes = isNativeNes(core);
    if (nativeNes && !canUseNesSlot(slot)) return false;
    const saveData = nativeNes ? nesTemporaryStates.get(core)?.get(key) : localStorage.getItem(key);

    if (!saveData) {
      console.log(`[SaveState] ROM="${runtime.currentRomFilename}" key="${key}" slot=${slot} 沒有存檔`);
      return false;
    }

    const success = core.importSaveState(saveData);
    if (success) {
      if (nativeNes) settleNesAfterLoad(core);
      console.log(`[SaveState] 讀取成功 ROM="${runtime.currentRomFilename}" key="${key}" slot=${slot}`);
      logSnesLoadStateDiagnostics();
    } else {
      if (nativeNes) nesTemporaryStates.get(core)?.delete(key);
      console.warn(`[SaveState] 讀取失敗（資料不相容）ROM="${runtime.currentRomFilename}" key="${key}"`);
    }
    return success;
  } catch (e) {
    console.error('[SaveState] 讀取存檔失敗:', e);
    return false;
  }
}


/** 玩家存檔：FC 另外寫一份可跨重新整理的持久存檔；其他核心本來就存在 localStorage。 */
export async function saveNativeState(slot: number): Promise<boolean> {
  const core = runtime.nes;
  if (!core || !isNativeNes(core)) return saveNativeStateNow(slot);
  if (!canUseNesSlot(slot)) return false;

  try {
    const token = core.exportSaveStateForSlot(slot);
    const persistentState = core.exportPersistentSaveState();
    if (!token || !persistentState) return false;
    const key = getSaveKey(slot);
    await writeNesPersistentState(key, persistentState);
    rememberNesToken(core, key, token);
    console.log(`[NES] 持久存檔成功 ROM="${runtime.currentRomFilename}" slot=${slot} size=${persistentState.length}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久存檔失敗:', error);
    return false;
  }
}


export async function loadNativeState(slot: number): Promise<boolean> {
  const core = runtime.nes;
  if (!core || !isNativeNes(core)) return loadNativeStateNow(slot);
  if (!canUseNesSlot(slot)) return false;

  const key = getSaveKey(slot);
  // 同一次遊玩中存過的欄位，直接用同核心 token（最快也最完整）。
  if (nesTemporaryStates.get(core)?.get(key)) return loadNativeStateNow(slot);

  const persistentState = await readNesPersistentState(key);
  if (!persistentState) return false;
  try {
    const success = core.importPersistentSaveState(persistentState);
    if (!success) {
      console.warn(`[NES] 持久存檔不相容或已損壞 ROM="${runtime.currentRomFilename}" slot=${slot}`);
      return false;
    }
    settleNesAfterLoad(core);
    console.log(`[NES] 持久讀檔成功 ROM="${runtime.currentRomFilename}" slot=${slot}`);
    return true;
  } catch (error) {
    console.error('[NES] 持久讀檔失敗:', error);
    return false;
  }
}


/** 遊戲內建電池存檔 → localStorage。 */
export function persistNativeSram(): void {
  if (!runtime.nes || !runtime.currentRomFilename) return;
  try {
    const sramData = runtime.nes.exportSram();
    if (sramData && sramData.length > 0) {
      localStorage.setItem(getSramKey(), sramData);
    }
  } catch (e) {
    console.error('SRAM 儲存失敗:', e);
  }
}


export function restoreNativeSram(): void {
  if (!runtime.nes || !runtime.currentRomFilename) return;
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


export function exportNativeStateFile(): void {
  const core = runtime.nes;
  if (!core) return;
  if (isNativeNes(core)) {
    const saveData = core.exportPersistentSaveState();
    if (!saveData) {
      showToast('NES 尚未準備好，不能匯出存檔');
      return;
    }
    downloadBlob(new Blob([saveData], { type: 'application/x-nes-save' }), `nes_savestate_${Date.now()}.nes-save`);
    showToast('✅ 存檔已匯出');
    return;
  }
  const saveData = core.exportSaveState();
  downloadBlob(new Blob([saveData], { type: 'text/plain' }), `${core.getCoreType() || 'emu'}_savestate_${Date.now()}.txt`);
}
