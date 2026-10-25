/**
 * 模擬執行的開始、暫停與畫面繪製；實際做法由目前的後端 adapter 決定。
 */
import { runtime } from '../app/runtime';
import { resumeAudio, syncAudioWorkletState } from '../audio/audio-output';
import { getActiveBackend } from './registry';

// ===== 模擬器控制 =====

/**
 * 開始模擬
 */
export function startEmulation(): void {
  resumeAudio();
  getActiveBackend().resume();
}


/**
 * 停止模擬
 */
export function stopEmulation(): void {
  runtime.isRunning = false;
  syncAudioWorkletState();
  getActiveBackend().pause();
}


/**
 * 渲染一幀到畫布
 */
export function renderFrame(): void {
  getActiveBackend().render();
}


/** 停掉以 requestAnimationFrame 驅動的幀迴圈（自製核心與 FBNeo 共用）。 */
export function cancelFrameLoop(): void {
  if (runtime.animationId !== null) {
    cancelAnimationFrame(runtime.animationId);
    runtime.animationId = null;
  }
}
