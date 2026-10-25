/**
 * 快轉與倒帶（自製核心與街機的快照環形緩衝）。
 */
import { RewindBuffer } from './rewind';
import { runtime } from '../app/runtime';
import { featureSettings, featureState } from '../app/preferences';
import { clearAudioQueue } from '../audio/audio-output';
import { isFbNeoActive, isMupenN64Active, isNativeCoreActive, isSnes9xActive } from '../backends/active';
import { snes9xBackend } from '../backends/emulatorjs-backend';
import { fbneoCore } from '../backends/fbneo/fbneo-backend';
import { exportNativeSnapshot, importNativeSnapshot } from '../backends/native/native-core';
import { refreshToolsPanels } from './player-features';
import { showToast } from '../ui/dialogs';

// ===== 玩家功能：快轉、倒帶（電腦版）、自動存檔、存檔備份 =====
// 未使用時，模擬迴圈、存檔格式與按鍵配置都維持原樣。

let fastForwardHeld = false;

/** 手機／選單切換的快轉倍率；1 表示關閉。 */
export let fastForwardLevel: 1 | 2 | 4 = 1;

export let rewindHeld = false;

let rewindStepCountdown = 0;

let rewindAudioCleared = false;

/** 倒帶時每隔幾個顯示幀退回一份快照（快照間隔 20 幀 → 約 4 倍速倒退）。 */
const REWIND_STEP_TICKS = 5;

const rewindBuffer = new RewindBuffer<string | Uint8Array>({ captureInterval: 20 });


export function getSpeedMultiplier(): number {
  if (rewindHeld) return 1;
  if (fastForwardLevel > 1) return fastForwardLevel;
  return fastForwardHeld ? featureState.fastForwardSpeed : 1;
}


/**
 * 倒帶只在電腦版自動啟用（記憶體充足、有 Backspace 可按住）。
 * 手機選單會蓋住畫面，無法邊看邊倒帶，所以不提供；中文化圖層遊戲也不提供。
 */
function rewindCaptureActive(): boolean {
  return document.body.classList.contains('desktop-ui') && runtime.gameSessionActive;
}


function nativeRewindBlockedReason(): string | null {
  if (!isNativeCoreActive()) return '這款遊戲不支援倒帶';
  if (runtime.textOverlay) return '中文化遊戲不支援倒帶';
  return null;
}


export function captureNativeRewind(): void {
  if (!rewindCaptureActive() || !rewindBuffer.tick() || nativeRewindBlockedReason()) return;
  try {
    const snapshot = exportNativeSnapshot();
    if (snapshot) rewindBuffer.push(snapshot);
  } catch (error) {
    console.warn('[倒帶] 擷取快照失敗:', error);
  }
}


/** 倒帶中回傳 true，代表這個時間片不執行模擬。 */
export function stepNativeRewind(): boolean {
  if (!runtime.nes || nativeRewindBlockedReason()) return false;
  if (!rewindAudioCleared) {
    clearAudioQueue();
    rewindAudioCleared = true;
  }
  if (--rewindStepCountdown > 0) return true;
  rewindStepCountdown = REWIND_STEP_TICKS;
  const snapshot = rewindBuffer.pop();
  if (typeof snapshot !== 'string') return true;
  try {
    if (importNativeSnapshot(snapshot) && runtime.nes.getCoreType() !== 'nes') {
      // 部分核心快照不含畫面緩衝，跑一幀讓畫面跟上（不出聲）。
      runtime.nes.frame();
      runtime.nes.consumeAudioSamples();
    }
  } catch (error) {
    console.warn('[倒帶] 還原快照失敗:', error);
  }
  return true;
}


export function runFastForwardNativeFrames(coreType: string): void {
  for (let extra = getSpeedMultiplier() - 1; extra > 0 && runtime.nes; extra--) {
    runtime.nes.frame();
    if (coreType === 'nes' && runtime.activeGamePresentation) runtime.activeGamePresentationFrame++;
    runtime.nes.consumeAudioSamples();
    captureNativeRewind();
  }
}


export function captureFbNeoRewind(): void {
  if (!rewindCaptureActive() || !fbneoCore || !rewindBuffer.tick()) return;
  try {
    rewindBuffer.push(fbneoCore.saveState());
  } catch (error) {
    console.warn('[倒帶] FBNeo 快照失敗:', error);
  }
}


export function stepFbNeoRewind(): boolean {
  if (!fbneoCore) return false;
  if (!rewindAudioCleared) {
    clearAudioQueue();
    rewindAudioCleared = true;
  }
  if (--rewindStepCountdown > 0) return true;
  rewindStepCountdown = REWIND_STEP_TICKS;
  const snapshot = rewindBuffer.pop();
  if (!(snapshot instanceof Uint8Array)) return true;
  try {
    fbneoCore.loadState(snapshot);
    fbneoCore.consumeAudioSamples();
  } catch (error) {
    console.warn('[倒帶] FBNeo 還原失敗:', error);
  }
  return true;
}


function rewindUnavailableReason(): string | null {
  if (!runtime.gameSessionActive) return '請先開始遊戲';
  if (!document.body.classList.contains('desktop-ui')) return '倒帶只在電腦版提供';
  if (isFbNeoActive()) return null;
  if (isMupenN64Active() || isSnes9xActive()) return '這款遊戲不支援倒帶';
  return nativeRewindBlockedReason();
}


let speedIndicator: HTMLElement | null = null;


function updateSpeedIndicator(): void {
  if (!speedIndicator) {
    speedIndicator = document.createElement('div');
    speedIndicator.className = 'speed-indicator';
    speedIndicator.setAttribute('aria-live', 'polite');
    document.body.appendChild(speedIndicator);
  }
  const multiplier = getSpeedMultiplier();
  const text = rewindHeld ? '⏪ 倒帶中' : multiplier > 1 ? `⏩ ${multiplier}×` : '';
  speedIndicator.textContent = text;
  speedIndicator.hidden = !text;
}


export function canFastForward(): boolean {
  return runtime.gameSessionActive && !isMupenN64Active();
}


export function syncFastForwardBackend(): void {
  if (isSnes9xActive()) {
    const multiplier = getSpeedMultiplier();
    snes9xBackend?.setFastForward(multiplier > 1, multiplier > 1 ? multiplier : 2);
  }
  updateSpeedIndicator();
}


export function setFastForwardHeld(active: boolean): void {
  if (fastForwardHeld === active) return;
  if (active && !canFastForward()) return;
  fastForwardHeld = active;
  syncFastForwardBackend();
}


export function setFastForwardLevel(level: 1 | 2 | 4): void {
  if (level > 1 && !canFastForward()) {
    showToast('這款遊戲不能快轉');
    return;
  }
  fastForwardLevel = level;
  if (level !== 1) featureSettings.update({ fastForwardSpeed: level });
  syncFastForwardBackend();
  refreshToolsPanels();
}


export function setRewindHeld(active: boolean): void {
  if (active === rewindHeld) return;
  if (active) {
    const reason = rewindUnavailableReason();
    if (reason) {
      showToast(reason);
      return;
    }
    rewindHeld = true;
    rewindStepCountdown = 0;
    rewindAudioCleared = false;
  } else {
    rewindHeld = false;
    rewindAudioCleared = false;
  }
  syncFastForwardBackend();
}


export function resetSpeedControls(): void {
  fastForwardHeld = false;
  fastForwardLevel = 1;
  rewindHeld = false;
  rewindAudioCleared = false;
  rewindBuffer.clear();
  updateSpeedIndicator();
}
