/**
 * EmulatorJS 後端 adapter（Snes9x、FCEUmm、Genesis Plus GX）。
 * 畫面、聲音與幀迴圈都在 EmulatorJS 的 iframe 裡，這裡只負責控制與存檔。
 */
import { runtime } from '../../app/runtime';
import { downloadBlob } from '../../app/storage';
import { readLocalStateSlot, writeLocalStateSlot } from '../../saves/local-state-slot';
import type { EmulatorBackend } from '../types';
import { emulatorJsCore, snes9xBackend } from './emulatorjs-backend';
import { loadEmulatorJsState, saveEmulatorJsState } from './emulatorjs-saves';

export const emulatorJsAdapter: EmulatorBackend = {
  id: 'snes9x',
  supportsSaveStates: true,
  supportsFastForward: true,
  supportsPlayerTwo: () => true,
  rewindBlockedReason: () => '這款遊戲不支援倒帶',

  // 歷史因素：三種 EmulatorJS 核心的存檔都標成 snes9x。
  saveKeyTag: () => 'snes9x',

  resume() {
    runtime.isRunning = true;
    snes9xBackend?.resume();
  },
  pause() {
    snes9xBackend?.pause();
  },
  render() {},
  reset() {
    snes9xBackend?.reset();
  },

  saveStateNow(slot) {
    const backend = snes9xBackend;
    if (!backend) return false;
    return writeLocalStateSlot('Snes9x', slot, () => backend.saveState());
  },
  loadStateNow(slot) {
    const backend = snes9xBackend;
    if (!backend) return false;
    return readLocalStateSlot('Snes9x', slot, (data) => backend.loadState(data));
  },
  saveState: saveEmulatorJsState,
  loadState: loadEmulatorJsState,

  captureSnapshot: () => snes9xBackend?.saveState() ?? null,
  restoreSnapshot(data) {
    if (!snes9xBackend) return false;
    snes9xBackend.loadState(data);
    return true;
  },

  persistBatterySave() {
    void snes9xBackend?.syncSaveData().catch(error => {
      console.warn('[Snes9x] 自動儲存 SRAM 發生問題:', error);
    });
  },
  // EmulatorJS 啟動時會自己還原電池存檔。
  restoreBatterySave() {},

  applySpeed(multiplier) {
    snes9xBackend?.setFastForward(multiplier > 1, multiplier > 1 ? multiplier : 2);
  },

  exportStateFile() {
    if (!snes9xBackend) return;
    const saveData = snes9xBackend.saveState();
    downloadBlob(new Blob([new Uint8Array(saveData)], { type: 'application/octet-stream' }), `${emulatorJsCore || 'snes9x'}_savestate_${Date.now()}.state`);
  },
};
