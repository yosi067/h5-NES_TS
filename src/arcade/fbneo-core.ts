import JSZip from 'jszip';
import initFbNeo from '@mantou/fbneo/fbneo-arcade';
import fbneoWasmUrl from '@mantou/fbneo/fbneo-arcade.wasm?url';

export const FBNEO_SUPPORTED_GAMES = [
  'knights',
  'kof94',
  'kof95',
  'kof96',
  'kof97',
  'kof98',
  'ms5pcb',
  'samsho2',
  'samsho4',
  'samshoh',
  'mslug',
  'mslug2t',
  'mslug3',
  'mslug4',
  'kof2002',
  'pacman',
  'tetris',
  'outrun',
  'shinobi',
  'strider',
  'raiden',
  'wof',
  'ffight',
  'dino',
  'captcomm',
  'punisher',
  'tmnt',
  'simpsons',
  'ssriders',
  'snowbros',
  'bublbobl',
  'pang',
  'sf2',
  '1943',
  'area88',
  'rtype',
  'parodius',
] as const;
export type FbNeoGameName = typeof FBNEO_SUPPORTED_GAMES[number];

export const ArcadeInputBit = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  ButtonA: 1 << 4,
  ButtonB: 1 << 5,
  ButtonC: 1 << 6,
  ButtonD: 1 << 7,
  Coin: 1 << 8,
  Start: 1 << 9,
  ButtonE: 1 << 10,
  ButtonF: 1 << 11,
} as const;

export interface FbNeoRomFile {
  path: string;
  name: string;
  data: Uint8Array;
}

export interface FbNeoRomSet {
  gameName: FbNeoGameName;
  archiveName: string;
  archiveData: Uint8Array;
  files: FbNeoRomFile[];
}

export interface FbNeoValidityResult {
  ok: boolean;
  gameName: FbNeoGameName;
  log: string;
}

export interface FbNeoResolution {
  width: number;
  height: number;
}

interface EmscriptenFs {
  mkdir(path: string): void;
  analyzePath(path: string): { exists: boolean };
  readFile(path: string): Uint8Array;
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
  readdir(path: string): string[];
  isDir(mode: number): boolean;
  stat(path: string): { mode: number };
  rmdir(path: string): void;
}

interface MantouFbNeoModule {
  FS: EmscriptenFs;
  HEAP8: Int8Array;
  HEAP16: Int16Array;
  cwrap(ident: string, returnType: string | null, argTypes: string[]): (...args: unknown[]) => unknown;
  start(): void;
  _collectGameInputs(): void;
  _doLoop(): void;
  _setEmInput(playerIndex: number, state: number, alx: number, aly: number, arx: number, ary: number): void;
  _saveAllState(save: number): void;
  _getFireButtonCount?(): number;
}

type MantouFbNeoFactory = (options: Record<string, unknown>) => Promise<MantouFbNeoModule>;

const createFbNeoModule = initFbNeo as MantouFbNeoFactory;

const MANTOU_INPUT = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  Start: 1 << 4,
  Coin: 1 << 5,
  B1: 1 << 6,
  B2: 1 << 7,
  B3: 1 << 8,
  B4: 1 << 9,
  B5: 1 << 10,
  B6: 1 << 11,
} as const;

export function getFbNeoGameName(filename: string): FbNeoGameName | null {
  const baseName = filename.split(/[\\/]/).pop()?.toLowerCase().replace(/\.zip$/, '') ?? '';
  return (FBNEO_SUPPORTED_GAMES as readonly string[]).includes(baseName) ? baseName as FbNeoGameName : null;
}

export async function extractFbNeoRomSet(archiveName: string, zipData: ArrayBuffer): Promise<FbNeoRomSet> {
  const gameName = getFbNeoGameName(archiveName);
  if (!gameName) {
    throw new Error(`目前 FBNeo arcade backend 僅允許 ${FBNEO_SUPPORTED_GAMES.map((name) => `${name}.zip`).join(' / ')}`);
  }

  const archiveData = new Uint8Array(zipData.slice(0));
  const zip = await JSZip.loadAsync(zipData);
  const files: FbNeoRomFile[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const name = path.split('/').pop() ?? path;
    if (!name || name.startsWith('.')) continue;
    files.push({
      path,
      name,
      data: new Uint8Array(await entry.async('arraybuffer')),
    });
  }

  if (files.length === 0) {
    throw new Error(`${archiveName} 內沒有可寫入 MEMFS 的 ROM 晶片檔案`);
  }

  return { gameName, archiveName, archiveData, files };
}

export class FbNeoArcadeCore {
  private modulePromise: Promise<MantouFbNeoModule> | null = null;
  private module: MantouFbNeoModule | null = null;
  private stdout: string[] = [];
  private stderr: string[] = [];
  private pendingGameName: FbNeoGameName | null = null;
  private loadedGameName: FbNeoGameName | null = null;
  private width = 320;
  private height = 240;
  private videoDepth = 32;
  private frameBuffer = new Uint8Array(this.width * this.height * 4);
  private audioSamples = new Float32Array();
  private romReadyResolve: (() => void) | null = null;
  private statePath = '';

  async init(): Promise<void> {
    await this.loadModule();
  }

  async mountRomSet(romSet: FbNeoRomSet): Promise<void> {
    const module = await this.loadModule();
    this.ensureDir('/roms');

    module.FS.writeFile(`/roms/${romSet.gameName}.zip`, romSet.archiveData);

    const gameDir = `/roms/${romSet.gameName}`;
    this.removeTree(gameDir);
    this.ensureDir(gameDir);
    for (const file of romSet.files) {
      module.FS.writeFile(`${gameDir}/${file.name}`, file.data);
    }
  }

  async checkRomValidity(romSet: FbNeoRomSet): Promise<FbNeoValidityResult> {
    this.clearLog();
    try {
      await this.startGameFromRomSet(romSet);
      return {
        ok: true,
        gameName: romSet.gameName,
        log: this.getLog() || `FBNeo ROM set '${romSet.gameName}' recognized`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        gameName: romSet.gameName,
        log: [detail, this.getLog()].filter(Boolean).join('\n'),
      };
    }
  }

  async loadGame(gameName: FbNeoGameName): Promise<boolean> {
    return this.loadedGameName === gameName;
  }

  getResolution(): FbNeoResolution {
    return { width: this.width, height: this.height };
  }

  stepFrame(p1Input: number, p2Input: number): void {
    const module = this.requireModule();
    module._setEmInput(0, this.toMantouInput(p1Input), 0, 0, 0, 0);
    module._setEmInput(1, this.toMantouInput(p2Input), 0, 0, 0, 0);
    module._collectGameInputs();
    module._doLoop();
  }

  getFrameBufferView(): Uint8Array {
    return this.frameBuffer;
  }

  consumeAudioSamples(): Float32Array {
    const samples = this.audioSamples;
    this.audioSamples = new Float32Array();
    return samples;
  }

  saveState(): Uint8Array {
    const module = this.requireModule();
    if (!this.statePath) {
      throw new Error('FBNeo 尚未建立狀態存檔路徑');
    }
    module._saveAllState(1);
    return module.FS.readFile(this.statePath);
  }

  loadState(state: Uint8Array): void {
    const module = this.requireModule();
    if (!this.statePath) {
      throw new Error('FBNeo 尚未建立狀態存檔路徑');
    }
    module.FS.writeFile(this.statePath, state);
    module._saveAllState(0);
  }

  getLog(): string {
    return [...this.stdout, ...this.stderr].join('\n').trim();
  }

  private async startGameFromRomSet(romSet: FbNeoRomSet): Promise<void> {
    const module = await this.loadModule();
    await this.mountRomSet(romSet);
    this.pendingGameName = romSet.gameName;
    this.loadedGameName = null;
    this.ensureDir('/libsdl');
    this.ensureDir('/libsdl/fbneo');
    this.ensureDir('/libsdl/fbneo/states');
    this.statePath = `/libsdl/fbneo/states/${romSet.gameName}.fs.all`;

    const romReady = new Promise<void>((resolve) => {
      this.romReadyResolve = resolve;
    });

    module.start();
    await this.withTimeout(romReady, 8000, `FBNeo 載入 ${romSet.archiveName} 逾時。可能是 Missing Files 或 CRC32 不符。`);
    this.loadedGameName = romSet.gameName;
  }

  private async loadModule(): Promise<MantouFbNeoModule> {
    if (this.module) return this.module;
    if (!this.modulePromise) {
      this.modulePromise = this.createModule();
    }
    this.module = await this.modulePromise;
    return this.module;
  }

  private async createModule(): Promise<MantouFbNeoModule> {
    let moduleRef: MantouFbNeoModule | null = null;
    const module = await createFbNeoModule({
      print: (line: string) => this.stdout.push(line),
      printErr: (line: string) => this.stderr.push(line),
      locateFile: (path: string, prefix: string) => path === 'fbneo-arcade.wasm' ? fbneoWasmUrl : prefix + path,
      start: () => {
        if (!this.pendingGameName || !moduleRef) return;
        moduleRef.cwrap('startMain', 'number', ['string'])(this.pendingGameName);
      },
      setRomProps: (width: number, height: number, _rotateGame: number, _flipped: number, videoDepth: number) => {
        this.width = width || 320;
        this.height = height || 240;
        this.videoDepth = videoDepth || 32;
        this.frameBuffer = new Uint8Array(this.width * this.height * 4);
        this.romReadyResolve?.();
        this.romReadyResolve = null;
      },
      setVisibleSize: () => {},
      setAspectRatio: () => {},
      audioCallback: (soundPtr: number, length: number) => this.captureAudio(soundPtr, length),
      drawScreen: (videoPtr: number) => this.captureFrame(videoPtr),
      addFile: (romName: number, _type: number, result: number) => {
        this.stdout.push(`ROM file ${this.ptrToString(romName)} result=${result}`);
      },
      addInput: () => {},
      addArchive: (name: number, fullName: number, found: number) => {
        this.stdout.push(`Archive ${this.ptrToString(name)} ${this.ptrToString(fullName)} found=${found}`);
      },
    });
    moduleRef = module;
    return module;
  }

  private captureFrame(videoPtr: number): void {
    const module = this.requireModule();
    const pixelCount = this.width * this.height;
    if (this.frameBuffer.length !== pixelCount * 4) {
      this.frameBuffer = new Uint8Array(pixelCount * 4);
    }

    if (this.videoDepth === 16) {
      const source = new Uint8Array(module.HEAP8.buffer, videoPtr, pixelCount * 2);
      let out = 0;
      for (let i = 0; i < pixelCount; i++) {
        const offset = i * 2;
        const color = ((source[offset + 1] << 8) & 0xff00) | (source[offset] & 0xff);
        this.frameBuffer[out++] = ((color >> 11) & 0x1f) << 3;
        this.frameBuffer[out++] = ((color >> 5) & 0x3f) << 2;
        this.frameBuffer[out++] = (color & 0x1f) << 3;
        this.frameBuffer[out++] = 255;
      }
      return;
    }

    const source = new Uint8Array(module.HEAP8.buffer, videoPtr, pixelCount * 4);
    let out = 0;
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      this.frameBuffer[out++] = source[offset + 2];
      this.frameBuffer[out++] = source[offset + 1];
      this.frameBuffer[out++] = source[offset];
      this.frameBuffer[out++] = 255;
    }
  }

  private captureAudio(soundPtr: number, length: number): void {
    const module = this.requireModule();
    const source = new Int16Array(module.HEAP16.buffer, soundPtr, length);
    const frames = Math.floor(length / 2);
    const mixed = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      mixed[i] = (source[i * 2] + source[i * 2 + 1]) / 65534;
    }
    this.audioSamples = mixed;
  }

  private toMantouInput(input: number): number {
    let state = 0;
    if (input & ArcadeInputBit.Left) state |= MANTOU_INPUT.Left;
    if (input & ArcadeInputBit.Right) state |= MANTOU_INPUT.Right;
    if (input & ArcadeInputBit.Up) state |= MANTOU_INPUT.Up;
    if (input & ArcadeInputBit.Down) state |= MANTOU_INPUT.Down;
    if (input & ArcadeInputBit.Start) state |= MANTOU_INPUT.Start;
    if (input & ArcadeInputBit.Coin) state |= MANTOU_INPUT.Coin;
    if (input & ArcadeInputBit.ButtonA) state |= MANTOU_INPUT.B1;
    if (input & ArcadeInputBit.ButtonB) state |= MANTOU_INPUT.B2;
    if (input & ArcadeInputBit.ButtonC) state |= MANTOU_INPUT.B3;
    if (input & ArcadeInputBit.ButtonD) state |= MANTOU_INPUT.B4;
    if (input & ArcadeInputBit.ButtonE) state |= MANTOU_INPUT.B5;
    if (input & ArcadeInputBit.ButtonF) state |= MANTOU_INPUT.B6;
    return state;
  }

  private ptrToString(ptr: number): string {
    if (!ptr || !this.module) return '';
    const heap = new Uint8Array(this.module.HEAP8.buffer);
    let end = ptr;
    while (heap[end] !== 0) end++;
    return new TextDecoder().decode(heap.subarray(ptr, end));
  }

  private ensureDir(path: string): void {
    const module = this.requireModule();
    if (!module.FS.analyzePath(path).exists) {
      module.FS.mkdir(path);
    }
  }

  private removeTree(path: string): void {
    const module = this.requireModule();
    if (!module.FS.analyzePath(path).exists) return;

    for (const entry of module.FS.readdir(path)) {
      if (entry === '.' || entry === '..') continue;
      const child = `${path}/${entry}`;
      const stat = module.FS.stat(child);
      if (module.FS.isDir(stat.mode)) {
        this.removeTree(child);
      } else {
        module.FS.unlink(child);
      }
    }
    module.FS.rmdir(path);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private clearLog(): void {
    this.stdout = [];
    this.stderr = [];
  }

  private requireModule(): MantouFbNeoModule {
    if (!this.module) {
      throw new Error('FBNeo module 尚未初始化');
    }
    return this.module;
  }
}
