/**
 * 離開時自動存檔與「繼續上次進度」提示。
 */
import { formatSaveTime, getSaveTime, recordSaveTime } from '../features/save-meta';
import { readBinaryState, writeBinaryState } from '../storage/binary-state-store';
import { runtime } from '../app/runtime';
import { getSafeStorage } from '../app/storage';
import { getActiveBackend } from '../backends/registry';
import { getSaveKey } from './save-keys';
import { showToast } from '../ui/dialogs';

// ---- 自動存檔與續玩（一律開啟，不需設定） ----

function getAutoSaveKey(): string {
  return getSaveKey('auto');
}


/** 同步擷取目前狀態（必須在核心被拆掉之前呼叫）。 */
function captureAutoSave(): Uint8Array | null {
  try {
    return getActiveBackend().captureSnapshot();
  } catch (error) {
    console.warn('[自動存檔] 擷取失敗:', error);
  }
  return null;
}


/** 自動存檔只寫 IndexedDB，不占用 localStorage 配額（避免擠掉電池存檔）。 */
export function autosaveNow(): Promise<void> {
  if (!runtime.gameSessionActive || runtime.gameLoadAbortController) return Promise.resolve();
  const key = getAutoSaveKey();
  const data = captureAutoSave();
  if (!data || data.length === 0) return Promise.resolve();
  return writeBinaryState(key, data)
    .then(() => recordSaveTime(getSafeStorage(), key))
    .catch((error) => console.warn('[自動存檔] 寫入失敗:', error));
}


async function restoreAutoSave(): Promise<boolean> {
  let data: Uint8Array | null = null;
  try {
    data = await readBinaryState(getAutoSaveKey());
  } catch {
    data = null;
  }
  if (!data || data.length === 0) return false;
  try {
    return getActiveBackend().restoreSnapshot(data);
  } catch (error) {
    console.warn('[自動存檔] 讀取失敗:', error);
  }
  return false;
}


let resumeBanner: HTMLElement | null = null;


export function hideResumeBanner(): void {
  resumeBanner?.remove();
  resumeBanner = null;
}


export async function offerAutoSaveResume(): Promise<void> {
  hideResumeBanner();
  if (!getActiveBackend().supportsSaveStates) return;
  const key = getAutoSaveKey();
  let exists = false;
  try {
    exists = Boolean((await readBinaryState(key))?.length);
  } catch {
    exists = false;
  }
  if (!exists || !runtime.gameSessionActive || getAutoSaveKey() !== key) return;
  const savedAt = getSaveTime(getSafeStorage(), key);

  const banner = document.createElement('div');
  banner.className = 'resume-banner';
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = savedAt ? `上次玩到 ${formatSaveTime(savedAt)}` : '有上次的進度';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'resume-banner-go';
  resume.textContent = '繼續上次進度';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'resume-banner-close';
  close.setAttribute('aria-label', '不用了');
  close.textContent = '✕';
  banner.append(text, resume, close);
  document.body.appendChild(banner);
  resumeBanner = banner;

  const timer = window.setTimeout(() => { if (resumeBanner === banner) hideResumeBanner(); }, 12_000);
  close.addEventListener('click', () => {
    window.clearTimeout(timer);
    hideResumeBanner();
  });
  resume.addEventListener('click', () => {
    window.clearTimeout(timer);
    hideResumeBanner();
    void restoreAutoSave().then((ok) => showToast(ok ? '✅ 已回到上次進度' : '❌ 上次進度無法讀取'));
  });
}
