export interface Snes9xBackend {
  setButton(button: number, pressed: boolean): void;
  saveState(): Uint8Array;
  loadState(state: Uint8Array): void;
  pause(): void;
  resume(): void;
  reset(): void;
  stop(): void;
}

interface EmulatorJsGameManager {
  simulateInput(player: number, button: number, value: number): void;
  restart(): void;
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

function escapeInlineScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function isSa1Rom(rom: Uint8Array): boolean {
  const copierHeaderSize = rom.length % 0x8000 === 512 ? 512 : 0;
  for (const headerOffset of [0x7FD5, 0xFFD5, 0x40FFD5]) {
    const mapMode = rom[copierHeaderSize + headerOffset];
    if (mapMode !== undefined && (mapMode & 0x3F) === 0x23) return true;
  }
  return false;
}

function isSdd1Rom(rom: Uint8Array): boolean {
  const copierHeaderSize = rom.length % 0x8000 === 512 ? 512 : 0;
  for (const headerOffset of [0x7FD6, 0xFFD6, 0x40FFD6]) {
    const cartridgeType = rom[copierHeaderSize + headerOffset];
    if (cartridgeType === 0x43 || cartridgeType === 0x45) return true;
  }
  return false;
}

export function shouldUseSnes9x(rom: Uint8Array, romName: string): boolean {
  return isSa1Rom(rom)
    || isSdd1Rom(rom)
    || /(?:^|\s)super mario kart(?:\s|\.|$)/i.test(romName);
}

export async function startSnes9xBackend(
  host: HTMLElement,
  rom: Uint8Array,
  romName: string,
): Promise<Snes9xBackend> {
  const runtimeUrl = new URL(`${import.meta.env.BASE_URL}emulatorjs/data/loader.js`, window.location.href).href;
  const dataPath = new URL(`${import.meta.env.BASE_URL}emulatorjs/data/`, window.location.href).href;
  const romBlob = new Blob([rom.slice()], { type: 'application/octet-stream' });
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
.ejs_virtualGamepad_parent{display:none!important}
</style></head><body><div id="game"></div><script>
window.EJS_player='#game';
window.EJS_core='snes';
window.EJS_gameUrl=${escapeInlineScript(romUrl)};
window.EJS_gameName=${escapeInlineScript(romName)};
window.EJS_pathtodata=${escapeInlineScript(dataPath)};
window.EJS_startOnLoaded=true;
window.EJS_DEBUG_XX=true;
window.EJS_threads=false;
window.EJS_disableAutoLang=true;
window.EJS_language='en-US';
</script><script src=${escapeInlineScript(runtimeUrl)}></script></body></html>`;
  host.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Snes9x 啟動逾時'));
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
      reject(new Error('Snes9x runtime 載入失敗'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      iframe.removeEventListener('error', onError);
    };
    iframe.addEventListener('error', onError);
  });

  const getEmulator = (): EmulatorJsInstance | undefined =>
    (iframe.contentWindow as EmulatorJsWindow | null)?.EJS_emulator;

  return {
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
      getEmulator()?.callEvent?.('exit');
      iframe.remove();
      URL.revokeObjectURL(romUrl);
    },
  };
}