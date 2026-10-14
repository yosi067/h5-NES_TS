export interface StageFitInput {
  /** 舞台可用範圍（視窗扣掉頂部列後）。 */
  areaWidth: number;
  areaHeight: number;
  /** 外框與跑馬燈等額外佔用的像素。 */
  chromeX: number;
  chromeY: number;
  /** 邊緣留白。 */
  margin: number;
  /** 顯示比例（寬 / 高）。 */
  aspect: number;
  /** 核心原生高度，整數倍縮放使用；未知時為 0。 */
  nativeHeight: number;
  integerScale: boolean;
}

export interface StageFit {
  width: number;
  height: number;
  /** 實際縮放是否為整數倍。 */
  integer: boolean;
}

/** 在範圍內放入最大的畫面，不裁切、不變形；整數倍模式在放得下時取整。 */
export function computeStageFit(input: StageFitInput): StageFit {
  const aspect = input.aspect > 0 ? input.aspect : 4 / 3;
  const availWidth = Math.max(1, input.areaWidth - input.chromeX - input.margin * 2);
  const availHeight = Math.max(1, input.areaHeight - input.chromeY - input.margin * 2);
  let height = Math.min(availHeight, availWidth / aspect);
  let integer = false;

  if (input.integerScale && input.nativeHeight > 0) {
    const steps = Math.floor(height / input.nativeHeight);
    if (steps >= 1) {
      height = steps * input.nativeHeight;
      integer = true;
    }
  }
  return { width: Math.floor(height * aspect), height: Math.floor(height), integer };
}

export interface FreeSpace {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type HudPlacement = 'right-bar' | 'top-bar' | 'overlay';

const HUD_SIDE_MIN = 64;
const HUD_TOP_MIN = 56;

/** 全螢幕時選單按鈕優先放進黑邊；沒有黑邊才浮在畫面角落。 */
export function chooseHudPlacement(free: FreeSpace): HudPlacement {
  if (Math.max(free.left, free.right) >= HUD_SIDE_MIN) return 'right-bar';
  if (Math.max(free.top, free.bottom) >= HUD_TOP_MIN) return 'top-bar';
  return 'overlay';
}

/** 把 CSS aspect-ratio 字串（"4 / 3"、"1.333"）轉成數字。 */
export function parseAspectRatio(value: string): number | null {
  const parts = value.split('/').map((part) => Number.parseFloat(part.trim()));
  if (parts.length === 1 && Number.isFinite(parts[0]) && parts[0] > 0) return parts[0];
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part) && part > 0)) return parts[0] / parts[1];
  return null;
}
