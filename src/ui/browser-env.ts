const IN_APP_PATTERN = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|KAKAOTALK|Snapchat|Twitter|NAVER\(inapp|GSA\/|; wv\)/i;

/** LINE、Facebook、Instagram 等內嵌瀏覽器沒有 Safari 的網址列收合行為。 */
export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_PATTERN.test(userAgent);
}

export interface PortraitFitInput {
  viewportHeight: number;
  /** 控制區（含底部內距與安全區域）最底端的文件座標。 */
  contentBottom: number;
  screenHeight: number;
  screenWidth: number;
}

export interface PortraitFitResult {
  aspect: number;
  /** 需要縮小畫面時的最大高度；不需要縮小時為 null。 */
  maxScreenHeight: number | null;
}

/** 直立版：內容超出可視高度時，優先縮小遊戲畫面（至多縮到 55%），保留完整大小的按鍵。 */
export function computePortraitFit(input: PortraitFitInput): PortraitFitResult {
  const aspect = input.screenHeight > 0 ? input.screenWidth / input.screenHeight : 4 / 3;
  const overflow = input.contentBottom - input.viewportHeight;
  if (overflow <= 1 || input.screenHeight <= 0) return { aspect, maxScreenHeight: null };
  const minimum = input.screenHeight * 0.55;
  return { aspect, maxScreenHeight: Math.max(minimum, input.screenHeight - overflow) };
}

export interface DesktopUiInput {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  hasFinePointerAndHover: boolean;
  viewportWidth: number;
}

/** 電腦版舞台只給「滑鼠鍵盤為主」的環境；手機、平板（含 iPadOS 偽裝成 Mac）一律走觸控版面。 */
export function shouldUseDesktopUi(input: DesktopUiInput): boolean {
  if (/iPad|iPhone|iPod|Android/i.test(input.userAgent)) return false;
  if (input.platform === 'MacIntel' && input.maxTouchPoints > 1) return false;
  return input.hasFinePointerAndHover && input.viewportWidth >= 769;
}
