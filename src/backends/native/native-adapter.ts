/**
 * 自製 WASM 核心（FC / GB / GG / SFC）的後端 adapter。
 */
import { runtime } from '../../app/runtime';
import { clearAudioQueue } from '../../audio/audio-output';
import { nativeRewindBlockedReason } from '../../features/speed';
import { isNativeCoreActive } from '../active';
import { cancelFrameLoop } from '../lifecycle';
import type { EmulatorBackend } from '../types';
import { exportNativeSnapshot, importNativeSnapshot } from './native-core';
import { startNativeLoop } from './native-loop';
import { renderNativeFrame } from './native-render';
import {
  exportNativeStateFile, loadNativeState, loadNativeStateNow, persistNativeSram,
  restoreNativeSram, saveNativeState, saveNativeStateNow,
} from './native-saves';

export const nativeAdapter: EmulatorBackend = {
  id: 'wasm',
  supportsSaveStates: true,
  supportsFastForward: true,

  supportsPlayerTwo() {
    const core = runtime.nes?.getCoreType();
    return core === 'nes' || core === 'snes';
  },
  rewindBlockedReason: nativeRewindBlockedReason,

  saveKeyTag: () => runtime.nes?.getCoreType() || 'nes',

  resume: startNativeLoop,
  pause: cancelFrameLoop,
  render: renderNativeFrame,
  reset() {
    runtime.nes?.reset();
  },

  saveStateNow: saveNativeStateNow,
  loadStateNow: loadNativeStateNow,
  saveState: saveNativeState,
  loadState: loadNativeState,

  captureSnapshot() {
    if (!isNativeCoreActive()) return null;
    const snapshot = exportNativeSnapshot();
    return snapshot ? new TextEncoder().encode(snapshot) : null;
  },
  restoreSnapshot(data) {
    if (!isNativeCoreActive()) return false;
    clearAudioQueue();
    if (!importNativeSnapshot(new TextDecoder().decode(data))) return false;
    renderNativeFrame();
    return true;
  },

  persistBatterySave: persistNativeSram,
  restoreBatterySave: restoreNativeSram,

  // 快轉由幀迴圈每個時間片多跑幾幀處理。
  applySpeed() {},

  exportStateFile: exportNativeStateFile,
};
