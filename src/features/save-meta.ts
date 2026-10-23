/**
 * 即時存檔欄位的時間戳記。只記錄「何時存的」，不改動既有存檔資料或 key。
 * 舊存檔沒有紀錄時，介面顯示「有存檔（時間不明）」。
 */
export const SAVE_META_KEY = 'h5emu.save-meta.v1';
const MAX_ENTRIES = 400;

type SaveMetaMap = Record<string, number>;

function read(storage: Storage | null): SaveMetaMap {
  try {
    const raw = storage?.getItem(SAVE_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: SaveMetaMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function recordSaveTime(storage: Storage | null, saveKey: string, at = Date.now()): void {
  const meta = read(storage);
  meta[saveKey] = at;
  const entries = Object.entries(meta).sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
  try {
    storage?.setItem(SAVE_META_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 時間戳記只是輔助資訊；寫入失敗不影響存檔本身。
  }
}

export function getSaveTime(storage: Storage | null, saveKey: string): number | null {
  return read(storage)[saveKey] ?? null;
}

export function forgetSaveTime(storage: Storage | null, saveKey: string): void {
  const meta = read(storage);
  if (!(saveKey in meta)) return;
  delete meta[saveKey];
  try {
    storage?.setItem(SAVE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export function formatSaveTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date(now);
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  if (sameDay) return `今天 ${time}`;
  const sameYear = date.getFullYear() === today.getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}/`}${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
