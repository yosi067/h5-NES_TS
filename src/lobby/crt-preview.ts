/**
 * 大廳電視裡的超級瑪利歐示範畫面。
 */
import { getRomAssetUrl } from '../rom-assets';
import { EmuWasm } from '../wasm/nes_wasm.js';
import { runtime } from '../app/runtime';
import { NES_OVERSCAN_BOTTOM, NES_OVERSCAN_TOP } from '../backends/native/native-render';
import { LOBBY_MARIO_ROM_FILE } from '../catalog/machines';
import { ControllerButton } from '../input/buttons';
import { romCatalog } from './lobby-view';
import { loadRomFromServer } from '../session/game-loader';
import { showAppAlert } from '../ui/dialogs';

let lobbyCrtPreviewCore: EmuWasm | null = null;

let lobbyCrtPreviewAnimationId: number | null = null;

let lobbyCrtPreviewStarting = false;

let lobbyMarioRomData: Uint8Array | null = null;


export function setupLobbyCrt(): void {
  const crtButton = document.getElementById('lobby-crt') as HTMLButtonElement | null;
  const crtCanvas = document.getElementById('lobby-crt-screen') as HTMLCanvasElement | null;
  const crtContext = crtCanvas?.getContext('2d');
  if (!crtButton || !crtCanvas || !crtContext) return;

  crtContext.fillStyle = '#000';
  crtContext.fillRect(0, 0, crtCanvas.width, crtCanvas.height);

  crtButton.addEventListener('click', async () => {
    if (crtButton.getAttribute('aria-busy') === 'true') return;

    const marioRom = romCatalog.find(rom => rom.file === LOBBY_MARIO_ROM_FILE)
      ?? romCatalog.find(rom => rom.system === 'nes' && rom.name === '超級瑪利歐兄弟');
    if (!marioRom) {
      await showAppAlert(romCatalog.length === 0 ? '遊戲列表尚未載入完成。' : '找不到超級瑪利歐兄弟 ROM。');
      return;
    }

    crtButton.setAttribute('aria-busy', 'true');
    crtButton.classList.remove('is-powering');
    void crtButton.offsetWidth;
    crtButton.classList.add('is-powering');

    await new Promise<void>(resolve => {
      const sweep = crtButton.querySelector('.crt-power-sweep');
      const timeoutId = window.setTimeout(resolve, 850);
      sweep?.addEventListener('animationend', () => {
        window.clearTimeout(timeoutId);
        resolve();
      }, { once: true });
    });

    try {
      stopLobbyCrtPreview();
      await loadRomFromServer(marioRom.file);
    } finally {
      crtButton.classList.remove('is-powering');
      crtButton.removeAttribute('aria-busy');
      if (runtime.romSelector && getComputedStyle(runtime.romSelector).display !== 'none') {
        void startLobbyCrtPreview();
      }
    }
  });
}


export async function startLobbyCrtPreview(): Promise<void> {
  if (lobbyCrtPreviewStarting || lobbyCrtPreviewCore || runtime.romSelector?.style.display === 'none') return;

  const marioRom = romCatalog.find(rom => rom.file === LOBBY_MARIO_ROM_FILE);
  const crtButton = document.getElementById('lobby-crt');
  const crtCanvas = document.getElementById('lobby-crt-screen') as HTMLCanvasElement | null;
  const crtContext = crtCanvas?.getContext('2d');
  if (!marioRom || !crtCanvas || !crtContext) return;

  lobbyCrtPreviewStarting = true;
  try {
    if (runtime.wasmInitPromise) await runtime.wasmInitPromise;
    if (!lobbyMarioRomData) {
      const response = await fetch(getRomAssetUrl(import.meta.env.BASE_URL, marioRom.file));
      if (!response.ok) throw new Error(`無法載入大廳預覽: ${marioRom.file}`);
      lobbyMarioRomData = new Uint8Array(await response.arrayBuffer());
    }
    if (runtime.romSelector?.style.display === 'none') return;

    const previewCore = new EmuWasm();
    previewCore.setAudioEnabled(false);
    if (!previewCore.loadRom(lobbyMarioRomData)) {
      previewCore.free();
      throw new Error('大廳 CRT 無法啟動超級瑪利歐兄弟');
    }

    lobbyCrtPreviewCore = previewCore;
    const screenWidth = previewCore.getScreenWidth();
    const screenHeight = previewCore.getScreenHeight() - NES_OVERSCAN_TOP - NES_OVERSCAN_BOTTOM;
    crtCanvas.width = screenWidth;
    crtCanvas.height = screenHeight;
    const previewImage = crtContext.createImageData(screenWidth, screenHeight);
    let emulatedFrames = 0;
    let lastRenderedAt = 0;

    const renderPreview = (timestamp: number) => {
      if (lobbyCrtPreviewCore !== previewCore || runtime.romSelector?.style.display === 'none') {
        stopLobbyCrtPreview();
        return;
      }

      for (let step = 0; step < 2; step++) {
        emulatedFrames++;
        const startingGame = emulatedFrames >= 105 && emulatedFrames < 111;
        const running = emulatedFrames >= 165;
        const jumping = running && emulatedFrames % 105 < 24;
        previewCore.setButton(0, ControllerButton.Start, startingGame);
        previewCore.setButton(0, ControllerButton.Right, running);
        previewCore.setButton(0, ControllerButton.B, running);
        previewCore.setButton(0, ControllerButton.A, jumping);
        previewCore.frame();
      }
      previewCore.consumeAudioSamples();

      if (timestamp - lastRenderedAt >= 1000 / 30) {
        const memory = previewCore.getWasmMemory() as WebAssembly.Memory;
        const frameBuffer = new Uint8Array(
          memory.buffer,
          previewCore.getFrameBufferPtr(),
          previewCore.getFrameBufferLen(),
        );
        const rowStride = screenWidth * 4;
        const visibleStart = NES_OVERSCAN_TOP * rowStride;
        previewImage.data.set(frameBuffer.subarray(visibleStart, visibleStart + previewImage.data.length));
        crtContext.putImageData(previewImage, 0, 0);
        lastRenderedAt = timestamp;
      }

      lobbyCrtPreviewAnimationId = requestAnimationFrame(renderPreview);
    };

    crtButton?.classList.add('is-on');
    lobbyCrtPreviewAnimationId = requestAnimationFrame(renderPreview);
  } catch (error) {
    console.warn('[Lobby CRT] 預覽啟動失敗，保留黑屏:', error);
  } finally {
    lobbyCrtPreviewStarting = false;
  }
}


export function stopLobbyCrtPreview(): void {
  if (lobbyCrtPreviewAnimationId !== null) {
    cancelAnimationFrame(lobbyCrtPreviewAnimationId);
    lobbyCrtPreviewAnimationId = null;
  }
  lobbyCrtPreviewCore?.free();
  lobbyCrtPreviewCore = null;
  document.getElementById('lobby-crt')?.classList.remove('is-on');
}
