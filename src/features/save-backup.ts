/**
 * 存檔備份：把瀏覽器內的即時存檔、SRAM、N64 遊戲存檔匯出成單一 JSON 檔，
 * 之後可在另一台裝置或清除快取後匯入。
 *
 * 原則：資料逐字搬運（key 與內容都不轉換），匯入後由原本的讀檔流程讀取，
 * 因此舊存檔格式完全不受影響。
 */
export const BACKUP_FORMAT = 'h5emu-save-backup';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

/** 會被備份的 localStorage key 前綴（只含存檔與玩家資料，不含介面設定或翻譯草稿）。 */
export const BACKUP_LOCAL_PREFIXES = [
  'emu_savestate_',
  'emu_sram_',
  'snes9x-save-cache:',
  'h5emu.save-meta.v1',
  'h5emu.cheats.v1:',
  'h5emu.lobby.favorites.v1',
  'h5emu.lobby.recents.v1',
] as const;

export const N64_SAVE_PREFIX = '/mupen64plus/saves/';

export interface SaveBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
  binaryStates: Record<string, string>;
  n64Saves: Record<string, string>;
}

export interface BackupSummary {
  localCount: number;
  binaryCount: number;
  n64Count: number;
}

export function isBackupLocalKey(key: string): boolean {
  return BACKUP_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function buildBackup(input: {
  localEntries: Array<[string, string]>;
  binaryEntries: Array<[string, Uint8Array]>;
  n64Entries: Array<[string, Uint8Array]>;
  now?: Date;
}): SaveBackup {
  const localStorageEntries: Record<string, string> = {};
  for (const [key, value] of input.localEntries) {
    if (isBackupLocalKey(key)) localStorageEntries[key] = value;
  }
  const binaryStates: Record<string, string> = {};
  for (const [key, bytes] of input.binaryEntries) binaryStates[key] = bytesToBase64(bytes);
  const n64Saves: Record<string, string> = {};
  for (const [key, bytes] of input.n64Entries) {
    if (key.startsWith(N64_SAVE_PREFIX)) n64Saves[key] = bytesToBase64(bytes);
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    localStorage: localStorageEntries,
    binaryStates,
    n64Saves,
  };
}

export function summarizeBackup(backup: SaveBackup): BackupSummary {
  return {
    localCount: Object.keys(backup.localStorage).length,
    binaryCount: Object.keys(backup.binaryStates).length,
    n64Count: Object.keys(backup.n64Saves).length,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string');
}

/** 驗證匯入檔；格式不對時丟出可直接顯示給玩家的錯誤。 */
export function parseBackup(text: string): SaveBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('備份檔太大，無法匯入');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('這不是 H5-EMU 存檔備份檔（JSON 格式錯誤）');
  }
  const value = parsed as Partial<SaveBackup> | null;
  if (!value || value.format !== BACKUP_FORMAT) throw new Error('這不是 H5-EMU 存檔備份檔');
  if (typeof value.version !== 'number' || value.version > BACKUP_VERSION) {
    throw new Error('備份檔版本較新，請先更新網頁後再匯入');
  }
  const localStorageEntries = value.localStorage ?? {};
  const binaryStates = value.binaryStates ?? {};
  const n64Saves = value.n64Saves ?? {};
  if (!isStringRecord(localStorageEntries) || !isStringRecord(binaryStates) || !isStringRecord(n64Saves)) {
    throw new Error('備份檔內容損壞');
  }
  for (const key of Object.keys(localStorageEntries)) {
    if (!isBackupLocalKey(key)) throw new Error(`備份檔含有不允許的資料：${key}`);
  }
  for (const key of Object.keys(n64Saves)) {
    if (!key.startsWith(N64_SAVE_PREFIX)) throw new Error(`備份檔含有不允許的 N64 路徑：${key}`);
  }
  for (const encoded of [...Object.values(binaryStates), ...Object.values(n64Saves)]) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('備份檔內容損壞（base64）');
  }
  return {
    format: BACKUP_FORMAT,
    version: value.version,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    localStorage: localStorageEntries,
    binaryStates,
    n64Saves,
  };
}

// ---- 瀏覽器端：N64（Mupen64Plus IDBFS）----

const N64_DB_NAME = '/mupen64plus';
const N64_STORE = 'FILE_DATA';

/** 只在資料庫已存在時才開啟，避免建立空資料庫讓 Mupen 之後無法初始化。 */
async function n64DatabaseExists(): Promise<boolean> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof factory.databases !== 'function') return false;
  try {
    const list = await factory.databases();
    return list.some((entry) => entry.name === N64_DB_NAME);
  } catch {
    return false;
  }
}

export async function listN64Saves(): Promise<Array<[string, Uint8Array]>> {
  if (typeof indexedDB === 'undefined' || !(await n64DatabaseExists())) return [];
  return new Promise((resolve) => {
    const request = indexedDB.open(N64_DB_NAME);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(N64_STORE)) {
        db.close();
        resolve([]);
        return;
      }
      const result: Array<[string, Uint8Array]> = [];
      const transaction = db.transaction(N64_STORE, 'readonly');
      const cursorRequest = transaction.objectStore(N64_STORE).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const key = cursor.key;
        const contents = (cursor.value as { contents?: unknown } | null)?.contents;
        if (typeof key === 'string' && key.startsWith(N64_SAVE_PREFIX) && contents instanceof Uint8Array) {
          result.push([key, new Uint8Array(contents)]);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        resolve(result);
      };
    };
  });
}

/** 與遊戲啟動時相同的寫法：必要時建立 FILE_DATA 與目錄節點。 */
export async function writeN64Saves(entries: Array<[string, Uint8Array]>): Promise<void> {
  if (entries.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(N64_DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(N64_STORE)) {
        const store = db.createObjectStore(N64_STORE);
        store.createIndex('timestamp', 'timestamp', { unique: false, multiEntry: false });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(N64_STORE)) {
        db.close();
        reject(new Error('N64 存檔資料庫結構不完整，請先開啟任一款 N64 遊戲後再匯入'));
        return;
      }
      const transaction = db.transaction(N64_STORE, 'readwrite');
      const store = transaction.objectStore(N64_STORE);
      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/saves');
      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/data');
      for (const [key, contents] of entries) {
        store.put({ contents, timestamp: new Date(), mode: 33206 }, key);
      }
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}
