/**
 * 遊戲大廳：最愛、最近玩過與搜尋。以 roms.json 的 `file` 當識別碼，
 * 與既有存檔 key（ROM 內部檔名）分開，不會互相影響。
 */
export const FAVORITES_KEY = 'h5emu.lobby.favorites.v1';
export const RECENTS_KEY = 'h5emu.lobby.recents.v1';
export const MAX_RECENTS = 12;

export interface RecentEntry {
  file: string;
  at: number;
}

function readJson(storage: Storage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 偏好無法保存時仍保留本次操作結果。
  }
}

export class LobbyPrefs {
  constructor(private readonly storage: Storage | null) {}

  favorites(): string[] {
    const raw = readJson(this.storage, FAVORITES_KEY);
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  }

  isFavorite(file: string): boolean {
    return this.favorites().includes(file);
  }

  /** 切換最愛並回傳切換後狀態。 */
  toggleFavorite(file: string): boolean {
    const list = this.favorites();
    const index = list.indexOf(file);
    if (index >= 0) list.splice(index, 1);
    else list.unshift(file);
    writeJson(this.storage, FAVORITES_KEY, list.slice(0, 500));
    return index < 0;
  }

  recents(): RecentEntry[] {
    const raw = readJson(this.storage, RECENTS_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is RecentEntry => Boolean(item)
      && typeof (item as RecentEntry).file === 'string'
      && typeof (item as RecentEntry).at === 'number');
  }

  noteRecent(file: string, at = Date.now()): void {
    if (!file) return;
    const next = [{ file, at }, ...this.recents().filter((entry) => entry.file !== file)].slice(0, MAX_RECENTS);
    writeJson(this.storage, RECENTS_KEY, next);
  }

  clearRecents(): void {
    writeJson(this.storage, RECENTS_KEY, []);
  }
}

export interface SearchableRom {
  file: string;
  name?: string;
  displayName?: string;
  systemLabel?: string;
  description?: string;
}

/** 全形轉半形、去除空白與常見標點並轉小寫，讓「洛克人 3」「洛克人3」「ROCKMAN」都能比對。 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.,:;'"!?！？、。・·()（）[\]【】「」『』\/\\]+/g, '');
}

/** 以空白切成多個關鍵字，全部命中才算符合（名稱、檔名、主機或簡介任一欄位）。 */
export function matchesSearch(rom: SearchableRom, query: string): boolean {
  const terms = query.split(/\s+/).map(normalizeSearchText).filter(Boolean);
  if (terms.length === 0) return false;
  const haystack = normalizeSearchText([
    rom.displayName ?? '',
    rom.name ?? '',
    rom.file,
    rom.systemLabel ?? '',
    rom.description ?? '',
  ].join(' '));
  return terms.every((term) => haystack.includes(term));
}

/** 名稱開頭或名稱內命中排前面，只命中簡介的排後面。 */
export function rankSearchResults<T extends SearchableRom>(roms: T[], query: string, limit = 60): T[] {
  const terms = query.split(/\s+/).map(normalizeSearchText).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: Array<{ rom: T; score: number; index: number }> = [];
  roms.forEach((rom, index) => {
    if (!matchesSearch(rom, query)) return;
    const title = normalizeSearchText(`${rom.displayName ?? ''}${rom.name ?? ''}`);
    let score = 0;
    for (const term of terms) {
      if (title.startsWith(term)) score += 3;
      else if (title.includes(term)) score += 2;
      else if (normalizeSearchText(rom.file).includes(term)) score += 1;
    }
    scored.push({ rom, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((item) => item.rom);
}
