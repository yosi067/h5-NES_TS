/**
 * 即時存檔與自動存檔的 key 命名。
 *
 * 格式：emu_savestate_<核心標籤>_<ROM 名稱>_<欄位>。玩家既有存檔都依這個格式存放，
 * 改動任何一段都會讓舊存檔讀不到。
 */
import { runtime } from '../app/runtime';
import { getActiveBackend } from '../backends/registry';

const SAVE_STATE_PREFIX = 'emu_savestate_';


/**
 * 取得帶有核心類型 + ROM 名稱的存檔 key（每個遊戲獨立存檔）
 */
export function getSaveKey(slot: number | 'auto'): string {
  const coreType = getActiveBackend().saveKeyTag();
  // Use ROM filename to isolate saves per game
  const romId = runtime.currentRomFilename
    ? runtime.currentRomFilename.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 60)
    : 'unknown';
  return `${SAVE_STATE_PREFIX}${coreType}_${romId}_${slot}`;
}
