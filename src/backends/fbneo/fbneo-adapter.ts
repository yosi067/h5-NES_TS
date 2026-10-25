/**
 * FBNeo 街機核心的後端 adapter。
 */
import { clearAudioQueue } from '../../audio/audio-output';
import { readLocalStateSlot, writeLocalStateSlot } from '../../saves/local-state-slot';
import { showToast } from '../../ui/dialogs';
import { cancelFrameLoop } from '../lifecycle';
import type { EmulatorBackend } from '../types';
import { fbneoCore, renderFbNeoFrame, startFbNeoEmulation } from './fbneo-backend';

export const fbneoAdapter: EmulatorBackend = {
  id: 'fbneo',
  supportsSaveStates: true,
  supportsFastForward: true,
  supportsPlayerTwo: () => true,
  rewindBlockedReason: () => null,

  saveKeyTag: () => 'fbneo',

  resume: startFbNeoEmulation,
  pause: cancelFrameLoop,
  render: renderFbNeoFrame,
  // FBNeo 核心沒有提供重置 API；維持原本行為（不做事）。
  reset() {},

  saveStateNow(slot) {
    const core = fbneoCore;
    if (!core) return false;
    return writeLocalStateSlot('FBNeo', slot, () => core.saveState());
  },
  loadStateNow(slot) {
    const core = fbneoCore;
    if (!core) return false;
    return readLocalStateSlot('FBNeo', slot, (data) => core.loadState(data));
  },
  saveState(slot) {
    return Promise.resolve(fbneoAdapter.saveStateNow(slot));
  },
  loadState(slot) {
    return Promise.resolve(fbneoAdapter.loadStateNow(slot));
  },

  captureSnapshot: () => fbneoCore?.saveState() ?? null,
  restoreSnapshot(data) {
    if (!fbneoCore) return false;
    fbneoCore.loadState(data);
    clearAudioQueue();
    return true;
  },

  // 街機沒有電池存檔。
  persistBatterySave() {},
  restoreBatterySave() {},

  // 快轉由幀迴圈每個時間片多跑幾幀處理。
  applySpeed() {},

  exportStateFile() {
    showToast('FBNeo 即時存檔尚未支援');
  },
};
