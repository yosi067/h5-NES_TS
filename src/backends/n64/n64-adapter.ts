/**
 * N64（Mupen64Plus-web）後端 adapter。
 * Mupen64Plus-web 沒有可靠的即時狀態 API，存檔只靠遊戲內建存檔（由核心自己寫進 IndexedDB）。
 */
import { runtime } from '../../app/runtime';
import { syncAudioWorkletState } from '../../audio/audio-output';
import { showToast } from '../../ui/dialogs';
import type { EmulatorBackend } from '../types';
import { n64Controls, startN64Game } from './n64-backend';

export const n64Adapter: EmulatorBackend = {
  id: 'mupen64',
  supportsSaveStates: false,
  supportsFastForward: false,
  supportsPlayerTwo: () => false,
  rewindBlockedReason: () => '這款遊戲不支援倒帶',

  saveKeyTag: () => 'n64',

  resume() {
    runtime.isRunning = true;
    syncAudioWorkletState();
    n64Controls?.resume();
  },
  pause() {
    void n64Controls?.pause().catch((error) => console.warn('[N64] 暫停失敗:', error));
  },
  // 畫面由 Mupen64Plus 直接畫在 WebGL 畫布上。
  render() {},
  reset() {
    // 核心沒有重置 API，重新開機同一片卡帶。
    if (runtime.currentN64RomData) void startN64Game(runtime.currentN64RomData);
  },

  saveStateNow() {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態存檔 API');
    return false;
  },
  loadStateNow() {
    console.warn('[N64] Mupen64Plus-web 未提供可靠的即時狀態讀檔 API');
    return false;
  },
  saveState: (slot) => Promise.resolve(n64Adapter.saveStateNow(slot)),
  loadState: (slot) => Promise.resolve(n64Adapter.loadStateNow(slot)),

  captureSnapshot: () => null,
  restoreSnapshot: () => false,

  // 遊戲內建存檔由核心自己寫入；離開遊戲時 stopN64Backend 會強制寫出。
  persistBatterySave() {},
  restoreBatterySave() {},

  applySpeed() {},

  exportStateFile() {
    void n64Controls?.forceDumpSaveFiles?.();
    showToast('N64 會使用遊戲內建存檔');
  },
};
