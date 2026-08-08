export interface Snes9xBackend {
  setButton(button: number, pressed: boolean): void;
  saveState(): Uint8Array;
  loadState(state: Uint8Array): void;
  hasSaveMarker(marker: string): boolean;
  installSaveBootstrap(saveData: Uint8Array, rtcData: Uint8Array): Promise<boolean>;
  syncSaveData(): Promise<void>;
  pause(): void;
  resume(): void;
  reset(): void;
  stop(): void;
}

interface EmulatorJsFileSystem {
  analyzePath(path: string): { exists: boolean };
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: Uint8Array): void;
  syncfs(populate: boolean, callback: (error?: unknown) => void): void;
}

interface EmulatorJsGameManager {
  simulateInput(player: number, button: number, value: number): void;
  restart(): void;
  saveSaveFiles(): void;
  loadSaveFiles(): void;
  getSaveFilePath(): string;
  FS: EmulatorJsFileSystem;
  toggleMainLoop(running: number): void;
  getState(): Uint8Array;
  loadState(state: Uint8Array): void;
}

interface EmulatorJsInstance {
  gameManager?: EmulatorJsGameManager;
  started?: boolean;
  callEvent?(event: string): void;
}

interface EmulatorJsWindow extends Window {
  EJS_emulator?: EmulatorJsInstance;
}

const START_TIMEOUT_MS = 30_000;
const TENGAI_MAKYO_ZERO_SRAM_MARKER = 'SPC7110 CHECK OK';
const TENGAI_MAKYO_ZERO_RTC_BYTES = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 15, 6, 221, 53, 119, 106] as const;

export function isTengaiMakyoZero(romName: string): boolean {
  return /天外魔境(?:[_\s-]*零|[_\s-]*zero)|tengai\s+makyou?\s+zero/i.test(romName);
}

export function hasSnes9xSaveMarker(saveData: Uint8Array, marker: string): boolean {
  const markerBytes = new TextEncoder().encode(marker);
  for (let start = 0; start <= saveData.length - markerBytes.length; start++) {
    if (markerBytes.every((value, index) => saveData[start + index] === value)) return true;
  }
  return false;
}

export function isUninitializedSnes9xSave(saveData: Uint8Array): boolean {
  return saveData.length === 0 || saveData.every(value => value === 0xAA);
}

function createTengaiMakyoZeroBootstrapSram(): Uint8Array {
  const saveData = new Uint8Array(0x2000).fill(0xFF);
  const markerBytes = new TextEncoder().encode(TENGAI_MAKYO_ZERO_SRAM_MARKER);
  saveData.set(markerBytes, saveData.length - markerBytes.length);
  return saveData;
}

function createTengaiMakyoZeroBootstrapRtc(): Uint8Array {
  return new Uint8Array(TENGAI_MAKYO_ZERO_RTC_BYTES);
}

function syncFileSystem(fileSystem: EmulatorJsFileSystem): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fileSystem.syncfs(false, error => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Snes9x 儲存資料同步失敗'));
        return;
      }
      resolve();
    });
  });
}

function waitFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('遊戲載入已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    let timeout = 0;
    const onAbort = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('遊戲載入已取消', 'AbortError'));
    };
    timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function tapButton(
  backend: Snes9xBackend,
  button: number,
  signal?: AbortSignal,
): Promise<void> {
  backend.setButton(button, true);
  try {
    await waitFor(300, signal);
  } finally {
    backend.setButton(button, false);
  }
}

async function autoStartTengaiMakyoZero(
  backend: Snes9xBackend,
  signal?: AbortSignal,
): Promise<void> {
  const hasSaveMarker = backend.hasSaveMarker(TENGAI_MAKYO_ZERO_SRAM_MARKER);
  if (hasSaveMarker) return;

  const bootstrapInstalled = await backend.installSaveBootstrap(
    createTengaiMakyoZeroBootstrapSram(),
    createTengaiMakyoZeroBootstrapRtc(),
  );
  if (bootstrapInstalled) {
    backend.reset();
    await waitFor(3_000, signal);
    return;
  }

  await waitFor(5_000, signal);
  await tapButton(backend, 8, signal);
  await waitFor(6_000, signal);
  await backend.syncSaveData();
  backend.reset();

  await waitFor(5_000, signal);
  await tapButton(backend, 0, signal);
  await waitFor(2_000, signal);
  await backend.syncSaveData();
  backend.reset();
  await waitFor(5_000, signal);
}

function escapeInlineScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function shouldUseSnes9x(rom: Uint8Array, romName: string): boolean {
  const copierHeaderSize = rom.length % 0x8000 === 512 ? 512 : 0;
  for (const headerOffset of [0x7FD5, 0xFFD5, 0x40FFD5]) {
    const mapMode = rom[copierHeaderSize + headerOffset];
    const cartridgeType = rom[copierHeaderSize + headerOffset + 1];
    if (mapMode !== undefined && (mapMode & 0x3F) === 0x23) return true;
    if (cartridgeType === 0x43 || cartridgeType === 0x45) return true;
    if ([0x13, 0x14, 0x15, 0x1A, 0xF5, 0xF9].includes(cartridgeType)) return true;
  }
  return /(?:^|\s)super mario kart(?:\s|\.|$)/i.test(romName)
    || /super butouden 3|超武鬥傳3|超武斗传3/i.test(romName);
}

export function shouldForceLegacySnesCore(userAgent: string): boolean {
  const chromeVersion = /(?:Chrome|CriOS)\/(\d+)/i.exec(userAgent);
  return chromeVersion !== null && Number(chromeVersion[1]) < 91;
}

export function shouldUseDigitalArcadeDpad(userAgent: string, hasPointerEvents: boolean): boolean {
  if (!/Android/i.test(userAgent)) return false;
  const androidVersion = /Android\s+(\d+)/i.exec(userAgent);
  const chromeVersion = /(?:Chrome|CriOS)\/(\d+)/i.exec(userAgent);
  return !hasPointerEvents
    || (androidVersion !== null && Number(androidVersion[1]) <= 8)
    || (chromeVersion !== null && Number(chromeVersion[1]) < 91);
}

export function getSnes9xUnsupportedReason(
  userAgent: string,
  deviceMemory: number | undefined,
  hasWebAssembly: boolean,
): string | null {
  if (!hasWebAssembly) return '此瀏覽器不支援 WebAssembly，無法啟動 SFC 核心。';
  if (/Android/i.test(userAgent) && deviceMemory !== undefined && deviceMemory <= 1) {
    return `裝置回報僅 ${deviceMemory} GB 記憶體，無法穩定啟動 SFC 核心。`;
  }
  const chromeVersion = /Chrome\/(\d+)/i.exec(userAgent);
  if (/Android/i.test(userAgent) && chromeVersion !== null && Number(chromeVersion[1]) < 61) {
    return 'Android 瀏覽器版本過舊，無法啟動 SFC 核心，請更新瀏覽器。';
  }
  return null;
}

export async function startSnes9xBackend(
  host: HTMLElement,
  rom: ArrayBuffer,
  romName: string,
  core: 'snes' | 'nes' = 'snes',
  signal?: AbortSignal,
): Promise<Snes9xBackend> {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const unsupportedReason = getSnes9xUnsupportedReason(
    navigator.userAgent,
    navigatorWithMemory.deviceMemory,
    typeof WebAssembly !== 'undefined',
  );
  if (unsupportedReason) throw new Error(unsupportedReason);

  const runtimeUrl = new URL(`${import.meta.env.BASE_URL}emulatorjs/data/loader.js`, window.location.href).href;
  const dataPath = new URL(`${import.meta.env.BASE_URL}emulatorjs/data/`, window.location.href).href;
  const forceLegacyCore = shouldForceLegacySnesCore(navigator.userAgent);
  const romBlob = new Blob([rom], { type: 'application/octet-stream' });
  const romUrl = URL.createObjectURL(romBlob);
  const iframe = document.createElement('iframe');
  iframe.id = 'snes9x-screen';
  iframe.title = 'Snes9x game screen';
  iframe.allow = 'autoplay; fullscreen; gamepad';
  iframe.style.aspectRatio = '256 / 224';
  iframe.srcdoc = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body,#game{width:100%;height:100%;margin:0;overflow:hidden;background:#000}
.ejs_parent{width:100%!important;height:100%!important;min-height:0!important}
.ejs_game,.ejs_canvas_parent,.ejs_canvas{width:100%!important;height:100%!important}
.ejs_canvas{object-fit:contain}
.ejs_virtualGamepad_parent,.ejs_virtualGamepad_open,.ejs_menu_bar,.ejs_context_menu,.ejs_settings_parent{display:none!important}
</style></head><body><div id="game"></div><script>
window.addEventListener('unhandledrejection',event=>{
const reason=event.reason;
if(reason&&reason.name==='NotAllowedError'&&/wake\s*lock|WakeLock/i.test(reason.message||''))event.preventDefault();
});
window.EJS_player='#game';
window.EJS_core=${escapeInlineScript(core)};
window.EJS_gameUrl=${escapeInlineScript(romUrl)};
window.EJS_gameName=${escapeInlineScript(romName)};
window.EJS_pathtodata=${escapeInlineScript(dataPath)};
window.EJS_startOnLoaded=true;
window.EJS_DEBUG_XX=true;
window.EJS_threads=false;
window.EJS_forceLegacyCores=${forceLegacyCore};
window.EJS_disableAutoLang=true;
window.EJS_language='en-US';
</script><script src=${escapeInlineScript(runtimeUrl)}></script></body></html>`;
  host.appendChild(iframe);

  let disposed = false;
  let romUrlRevoked = false;
  const revokeRomUrl = () => {
    if (romUrlRevoked) return;
    romUrlRevoked = true;
    URL.revokeObjectURL(romUrl);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    (iframe.contentWindow as EmulatorJsWindow | null)?.EJS_emulator?.callEvent?.('exit');
    iframe.remove();
    revokeRomUrl();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`${core === 'nes' ? 'NES' : 'Snes9x'} 核心啟動逾時`));
      }, START_TIMEOUT_MS);
      const poll = window.setInterval(() => {
        const emulator = (iframe.contentWindow as EmulatorJsWindow | null)?.EJS_emulator;
        if (emulator?.gameManager && emulator.started) {
          cleanup();
          resolve();
        }
      }, 50);
      const onError = () => {
        cleanup();
        reject(new Error(`${core === 'nes' ? 'NES' : 'Snes9x'} runtime 載入失敗`));
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('遊戲載入已取消', 'AbortError'));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        iframe.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      iframe.addEventListener('error', onError);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  } catch (error) {
    dispose();
    throw error;
  }
  revokeRomUrl();

  const getEmulator = (): EmulatorJsInstance | undefined =>
    (iframe.contentWindow as EmulatorJsWindow | null)?.EJS_emulator;

  const backend: Snes9xBackend = {
    setButton(button, pressed) {
      getEmulator()?.gameManager?.simulateInput(0, button, pressed ? 1 : 0);
    },
    saveState() {
      const state = getEmulator()?.gameManager?.getState();
      if (!state) throw new Error('Snes9x 尚未準備好即時存檔');
      return new Uint8Array(state);
    },
    loadState(state) {
      const gameManager = getEmulator()?.gameManager;
      if (!gameManager) throw new Error('Snes9x 尚未準備好即時讀檔');
      gameManager.loadState(state);
    },
    hasSaveMarker(marker) {
      const gameManager = getEmulator()?.gameManager;
      if (!gameManager) return false;
      try {
        const path = gameManager.getSaveFilePath();
        if (!gameManager.FS.analyzePath(path).exists) return false;
        return hasSnes9xSaveMarker(gameManager.FS.readFile(path), marker);
      } catch {
        return false;
      }
    },
    async installSaveBootstrap(saveData, rtcData) {
      const gameManager = getEmulator()?.gameManager;
      if (!gameManager) throw new Error('Snes9x 尚未準備好載入初始化存檔');
      const savePath = gameManager.getSaveFilePath();
      const rtcPath = savePath.replace(/\.srm$/i, '.rtc');
      try {
        const saveExists = gameManager.FS.analyzePath(savePath).exists;
        const rtcExists = gameManager.FS.analyzePath(rtcPath).exists;
        if (saveExists) {
          const currentSave = gameManager.FS.readFile(savePath);
          if (!isUninitializedSnes9xSave(currentSave)) return false;
        } else if (rtcExists) {
          return false;
        }
        gameManager.FS.writeFile(savePath, new Uint8Array(saveData));
        gameManager.FS.writeFile(rtcPath, new Uint8Array(rtcData));
        gameManager.loadSaveFiles();
        await syncFileSystem(gameManager.FS);
        return true;
      } catch {
        return false;
      }
    },
    async syncSaveData() {
      const gameManager = getEmulator()?.gameManager;
      if (!gameManager) throw new Error('Snes9x 尚未準備好儲存資料');
      gameManager.saveSaveFiles();
      await syncFileSystem(gameManager.FS);
    },
    pause() {
      getEmulator()?.gameManager?.toggleMainLoop(0);
    },
    resume() {
      getEmulator()?.gameManager?.toggleMainLoop(1);
    },
    reset() {
      getEmulator()?.gameManager?.restart();
    },
    stop() {
      dispose();
    },
  };

  try {
    if (core === 'snes' && isTengaiMakyoZero(romName)) {
      await autoStartTengaiMakyoZero(backend, signal);
    }
  } catch (error) {
    backend.stop();
    throw error;
  }

  return backend;
}