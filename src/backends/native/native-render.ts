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
