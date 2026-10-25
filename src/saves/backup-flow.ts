/**
 * 存檔備份的匯出與還原流程。
 */
import { base64ToBytes as backupBase64ToBytes, buildBackup, listN64Saves, parseBackup, summarizeBackup, writeN64Saves } from '../features/save-backup';
import { listBinaryStates, writeBinaryState } from '../storage/binary-state-store';
import { runtime } from '../app/runtime';
import { downloadBlob, getSafeStorage, timestampForFile } from '../app/storage';
import { refreshToolsPanels } from '../features/player-features';
import { lobbyTools } from '../lobby/lobby-view';
import { autosaveNow } from './autosave';
import { isNesPersistentState } from './save-states';
import { showAppAlert, showAppConfirm, showToast } from '../ui/dialogs';

// ---- 存檔備份 ----

export async function exportSaveBackup(): Promise<void> {
  const storage = getSafeStorage();
  const localEntries: Array<[string, string]> = [];
  if (storage) {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      const value = key ? storage.getItem(key) : null;
      if (key && value !== null) localEntries.push([key, value]);
    }
  }
  if (runtime.gameSessionActive) await autosaveNow();
  const binaryEntries = await listBinaryStates().catch(() => [] as Array<[string, Uint8Array]>);
  const n64Entries = await listN64Saves().catch(() => [] as Array<[string, Uint8Array]>);
  const backup = buildBackup({ localEntries, binaryEntries, n64Entries });
  const summary = summarizeBackup(backup);
  const total = summary.localCount + summary.binaryCount + summary.n64Count;
  if (total === 0) {
    showToast('目前沒有存檔可以備份');
    return;
  }
  downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `h5emu-saves-${timestampForFile()}.json`);
  showToast(`✅ 已備份 ${total} 筆存檔`);
}


function mergeJsonMap(existing: string | null, incoming: string): string {
  try {
    const base = existing ? JSON.parse(existing) as Record<string, number> : {};
    const next = JSON.parse(incoming) as Record<string, number>;
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'number' && (!(key in base) || value > base[key])) base[key] = value;
    }
    return JSON.stringify(base);
  } catch {
    return incoming;
  }
}


function mergeJsonList(existing: string | null, incoming: string): string {
  try {
    const base = existing ? JSON.parse(existing) as unknown[] : [];
    const next = JSON.parse(incoming) as unknown[];
    const merged = [...base];
    for (const item of next) if (!merged.includes(item)) merged.push(item);
    return JSON.stringify(merged);
  } catch {
    return incoming;
  }
}


export async function importSaveBackup(file: File): Promise<void> {
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (error) {
    await showAppAlert(error instanceof Error ? error.message : '無法讀取備份檔', '還原失敗');
    return;
  }
  const summary = summarizeBackup(backup);
  const total = summary.localCount + summary.binaryCount + summary.n64Count;
  if (total === 0) {
    showToast('備份檔裡沒有存檔');
    return;
  }
  const confirmed = await showAppConfirm(
    `備份檔有 ${total} 筆存檔。還原後，同一款遊戲同一格的存檔會被備份取代，其他存檔不受影響。要還原嗎？`,
    '還原存檔備份',
  );
  if (!confirmed) return;

  const storage = getSafeStorage();
  let written = 0;
  const failed: string[] = [];
  for (const [key, value] of Object.entries(backup.localStorage)) {
    try {
      const existing = storage?.getItem(key) ?? null;
      const next = key === 'h5emu.save-meta.v1' ? mergeJsonMap(existing, value)
        : key === 'h5emu.lobby.favorites.v1' ? mergeJsonList(existing, value)
        : value;
      storage?.setItem(key, next);
      written++;
    } catch {
      // NES 持久存檔原本就會在 localStorage 滿時改存 IndexedDB，讀檔流程也會查 IndexedDB。
      if (isNesPersistentState(value)) {
        try {
          await writeBinaryState(key, new TextEncoder().encode(value));
          written++;
          continue;
        } catch {
          // fall through
        }
      }
      failed.push(key);
    }
  }
  for (const [key, encoded] of Object.entries(backup.binaryStates)) {
    try {
      await writeBinaryState(key, backupBase64ToBytes(encoded));
      written++;
    } catch {
      failed.push(key);
    }
  }
  const n64Entries = Object.entries(backup.n64Saves).map(([key, encoded]) => [key, backupBase64ToBytes(encoded)] as [string, Uint8Array]);
  try {
    await writeN64Saves(n64Entries);
    written += n64Entries.length;
  } catch {
    failed.push(...n64Entries.map(([key]) => key));
  }
  lobbyTools?.refresh();
  refreshToolsPanels();
  if (failed.length > 0) {
    await showAppAlert(`已還原 ${written} 筆，${failed.length} 筆因瀏覽器儲存空間不足而失敗。`, '部分還原失敗');
  } else {
    showToast(runtime.gameSessionActive ? `✅ 已還原 ${written} 筆，重新開啟遊戲後生效` : `✅ 已還原 ${written} 筆存檔`);
  }
}
