/**
 * N64 的 WebGL 畫布切換與尺寸鎖定。
 */
import { type N64PerformanceProfile } from '../../n64/performance';
import { runtime } from '../../app/runtime';
import { waitForNextFrame } from '../../app/async';

interface N64GraphicsCapability {
  supported: boolean;
  message: string;
  renderer?: string;
}


// N64 的 Mupen64Plus/Rice 後端需要瀏覽器提供 WebGL2，也就是 WebGL ES 3 等級的 context。
export function getN64GraphicsCapability(): N64GraphicsCapability {
  if (typeof WebGL2RenderingContext === 'undefined') {
    return { supported: false, message: '這個瀏覽器沒有提供 WebGL2 API。' };
  }

  const testCanvas = document.createElement('canvas');
  const gl = testCanvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) {
    return { supported: false, message: '瀏覽器無法建立 WebGL2 context，常見原因是硬體加速關閉或顯示卡/驅動被瀏覽器封鎖。' };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  return { supported: true, message: 'WebGL2 可用', renderer };
}


export function drawN64GraphicsError(message: string): void {
  if (!runtime.canvas) return;

  runtime.canvas.id = 'screen';
  runtime.canvas.width = 320;
  runtime.canvas.height = 240;
  runtime.canvas.style.aspectRatio = '4 / 3';

  const errorContext = runtime.canvas.getContext('2d');
  if (!errorContext) return;

  errorContext.fillStyle = '#20202a';
  errorContext.fillRect(0, 0, runtime.canvas.width, runtime.canvas.height);
  errorContext.fillStyle = '#f2e9d8';
  errorContext.font = 'bold 18px sans-serif';
  errorContext.fillText('N64 圖形初始化失敗', 24, 62);
  errorContext.font = '13px sans-serif';
  const lines = [
    message,
    '請使用新版 Chrome/Edge，並確認硬體加速已開啟。',
    'chrome://gpu 可檢查 WebGL2 是否為 Hardware accelerated。',
  ];
  lines.forEach((line, index) => errorContext.fillText(line, 24, 102 + index * 26));
}


export function activateN64Canvas(profile: N64PerformanceProfile): HTMLCanvasElement {
  if (!runtime.wasmCanvas) {
    throw new Error('找不到可替換的 2D 畫布');
  }

  document.body.classList.add('n64-mode', 'n64-initializing');
  const n64Canvas = document.createElement('canvas');
  n64Canvas.id = 'canvas';
  n64Canvas.width = profile.width;
  n64Canvas.height = profile.height;
  n64Canvas.style.setProperty('--n64-render-width', `${profile.width}px`);
  n64Canvas.style.aspectRatio = '4 / 3';
  n64Canvas.style.width = '100%';
  n64Canvas.style.height = 'auto';
  runtime.wasmCanvas.replaceWith(n64Canvas);

  runtime.canvas = n64Canvas;
  runtime.ctx = null;
  runtime.imageData = null;
  return n64Canvas;
}


export async function settleN64CanvasLayout(n64Canvas: HTMLCanvasElement): Promise<void> {
  await waitForNextFrame();
  await waitForNextFrame();
  n64Canvas.getBoundingClientRect();
}


export function lockN64RenderSize(
  n64Canvas: HTMLCanvasElement,
  profile: N64PerformanceProfile,
): void {
  n64Canvas.width = profile.width;
  n64Canvas.height = profile.height;
  const gl = n64Canvas.getContext('webgl2') ?? n64Canvas.getContext('webgl');
  gl?.viewport(0, 0, profile.width, profile.height);
}


export function restoreWasmCanvas(): void {
  document.body.classList.remove('n64-initializing');
  if (!runtime.wasmCanvas || runtime.canvas === runtime.wasmCanvas) return;

  runtime.canvas?.replaceWith(runtime.wasmCanvas);
  runtime.canvas = runtime.wasmCanvas;
  runtime.canvas.id = 'screen';
  runtime.ctx = runtime.canvas.getContext('2d');
  if (runtime.ctx) runtime.ctx.imageSmoothingEnabled = false;
  runtime.imageData = null;
}
