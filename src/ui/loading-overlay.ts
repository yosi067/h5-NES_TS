/**
 * 遊戲載入中的覆蓋畫面與下載進度。
 */
import { runtime } from '../app/runtime';
import { nextAnimationFrameOrTimeout } from '../app/async';

// ===== ROM 選擇器 =====

let gameLoadingSequence = 0;


export function cancelPendingGameLoad(): void {
  gameLoadingSequence++;
  runtime.gameLoadAbortController?.abort();
  runtime.gameLoadAbortController = null;
  const overlay = document.getElementById('game-loading-overlay');
  if (overlay) overlay.hidden = true;
}


export async function showGameLoading(gameName: string, status: string): Promise<number> {
  const sequence = ++gameLoadingSequence;
  const overlay = document.getElementById('game-loading-overlay');
  const nameElement = document.getElementById('game-loading-name');
  const statusElement = document.getElementById('game-loading-status');
  const progressElement = document.getElementById('game-loading-progress');
  const progressBar = document.getElementById('game-loading-progress-bar');

  if (nameElement) nameElement.textContent = gameName;
  if (statusElement) statusElement.textContent = status;
  if (progressElement) {
    progressElement.hidden = true;
    progressElement.removeAttribute('aria-valuenow');
  }
  if (progressBar) progressBar.style.width = '0%';
  if (overlay) overlay.hidden = false;

  // 先讓瀏覽器畫出動畫；背景分頁暫停 rAF 時仍要繼續載入。
  await nextAnimationFrameOrTimeout();
  return sequence;
}


export function updateGameLoading(sequence: number, status: string): void {
  if (sequence !== gameLoadingSequence) return;
  const statusElement = document.getElementById('game-loading-status');
  if (statusElement) statusElement.textContent = status;
}


export function updateGameLoadingProgress(sequence: number, progress: number | null, status: string): void {
  if (sequence !== gameLoadingSequence) return;
  updateGameLoading(sequence, status);
  const progressElement = document.getElementById('game-loading-progress');
  const progressBar = document.getElementById('game-loading-progress-bar');
  if (!progressElement || !progressBar) return;

  if (progress === null) {
    progressElement.hidden = true;
    progressElement.removeAttribute('aria-valuenow');
    return;
  }

  const percentage = Math.max(0, Math.min(100, Math.round(progress)));
  progressElement.hidden = false;
  progressElement.setAttribute('aria-valuemin', '0');
  progressElement.setAttribute('aria-valuemax', '100');
  progressElement.setAttribute('aria-valuenow', String(percentage));
  progressBar.style.width = `${percentage}%`;
}


export function hideGameLoading(sequence: number): void {
  if (sequence !== gameLoadingSequence) return;
  const overlay = document.getElementById('game-loading-overlay');
  const cartridgeSequence = document.getElementById('cartridge-sequence');
  overlay?.removeAttribute('data-loading-mode');
  if (cartridgeSequence) {
    cartridgeSequence.hidden = true;
    cartridgeSequence.classList.remove('is-playing');
  }
  if (overlay) overlay.hidden = true;
}


export async function readResponseWithProgress(response: Response, sequence: number): Promise<ArrayBuffer> {
  const totalBytes = Number(response.headers.get('Content-Length'));
  if (!response.body || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    updateGameLoadingProgress(sequence, null, '正在下載遊戲檔案…');
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  let bytes = new Uint8Array(totalBytes);
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (receivedBytes + value.length > bytes.length) {
      const expanded = new Uint8Array(Math.max(receivedBytes + value.length, bytes.length * 2));
      expanded.set(bytes.subarray(0, receivedBytes));
      bytes = expanded;
    }
    bytes.set(value, receivedBytes);
    receivedBytes += value.length;
    const percentage = receivedBytes / totalBytes * 100;
    updateGameLoadingProgress(sequence, percentage, `正在下載遊戲檔案… ${Math.min(100, Math.round(percentage))}%`);
  }

  if (receivedBytes === bytes.byteLength) return bytes.buffer;
  return bytes.slice(0, receivedBytes).buffer;
}
