/**
 * 自製核心的畫面輸出與遊戲設定檔的畫面提示（presentation cues）。
 */
import { runtime } from '../../app/runtime';
import type { GamePresentationRegionGuard } from './game-profiles';

// 靜音旗標（同時停用 APU IRQ）
export const NES_OVERSCAN_TOP = 8;

export const NES_OVERSCAN_BOTTOM = 8;


export function renderGamePresentation(): void {
  if (!runtime.ctx || !runtime.imageData || !runtime.activeGamePresentation || runtime.nes?.getCoreType() !== 'nes') return;

  const inputFrame = runtime.activeGamePresentationInputFrame;
  for (const cue of runtime.activeGamePresentation.cues) {
    const elapsed = cue.trigger.type === 'frame'
      ? runtime.activeGamePresentationFrame
      : inputFrame === null ? -1 : runtime.activeGamePresentationFrame - inputFrame;
    const openEndedFrameCueWasDismissed = cue.trigger.type === 'frame'
      && cue.trigger.to === undefined
      && inputFrame !== null;
    if (elapsed < cue.trigger.from
        || (cue.trigger.to !== undefined && elapsed > cue.trigger.to)
        || openEndedFrameCueWasDismissed) continue;
    if (cue.regionGuard && hashPresentationRegion(runtime.imageData, cue.regionGuard) !== cue.regionGuard.hash) continue;

    runtime.ctx.save();
    for (const mask of cue.masks) {
      runtime.ctx.fillStyle = mask.color ?? '#000000';
      runtime.ctx.fillRect(mask.x, mask.y, mask.width, mask.height);
    }
    for (const label of cue.labels) {
      runtime.ctx.font = `700 ${label.size}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
      runtime.ctx.textAlign = label.align ?? 'left';
      runtime.ctx.textBaseline = 'middle';
      runtime.ctx.fillStyle = label.color ?? '#ffffff';
      runtime.ctx.shadowColor = '#000000';
      runtime.ctx.shadowBlur = 1;
      runtime.ctx.fillText(label.text, label.x, label.y);
    }
    runtime.ctx.restore();
  }
}


function hashPresentationRegion(frame: ImageData, region: GamePresentationRegionGuard): string {
  let hash = 0x811c9dc5;
  const sampleStep = region.sampleStep ?? 1;
  const endX = Math.min(region.x + region.width, frame.width);
  const endY = Math.min(region.y + region.height, frame.height);
  for (let y = region.y; y < endY; y += sampleStep) {
    for (let x = region.x; x < endX; x += sampleStep) {
      const offset = (y * frame.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        hash ^= frame.data[offset + channel];
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}


/**
 * 把自製核心的畫面緩衝畫到畫布（FC 會裁掉上方 overscan），再疊上畫面提示與中文化圖層。
 */
export function renderNativeFrame(): void {
  if (!runtime.nes || !runtime.ctx || !runtime.imageData) return;

  // 重要：每次都重新取得 WASM memory 參考
  // 因為 WASM 記憶體增長後 buffer 會變為 detached
  const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;

  // 從 WASM 記憶體讀取 RGBA 畫面資料
  const ptr = runtime.nes.getFrameBufferPtr();
  const len = runtime.nes.getFrameBufferLen();
  const frameBuffer = new Uint8Array(memory.buffer, ptr, len);

  if (runtime.nes.getCoreType() === 'nes') {
    const rowStride = runtime.nes.getScreenWidth() * 4;
    const visibleStart = NES_OVERSCAN_TOP * rowStride;
    runtime.imageData.data.set(frameBuffer.subarray(visibleStart, visibleStart + runtime.imageData.data.length));
  } else {
    runtime.imageData.data.set(frameBuffer);
  }
  runtime.ctx.putImageData(runtime.imageData, 0, 0);
  renderGamePresentation();
  if (runtime.textOverlay && runtime.nes) {
    try { runtime.textOverlay.render(runtime.nes, NES_OVERSCAN_TOP); }
    catch (error) {
      console.error('[中文化] 顯示失敗，保留原遊戲繼續執行', error);
      runtime.textOverlay.dispose(); runtime.textOverlay = null;
      runtime.nes.enableTextObserver(false);
    }
  }
}
