/**
 * 一局遊戲的開始與結束（最近玩過、自動存檔、快轉狀態重設）。
 */
import { runtime } from '../app/runtime';
import { lobbyPrefs } from '../app/preferences';
import { mobileTools, refreshToolsPanels } from '../features/player-features';
import { resetSpeedControls, syncFastForwardBackend } from '../features/speed';
import { heldNativeButtons } from '../input/native-input';
import { autosaveNow, hideResumeBanner, offerAutoSaveResume } from '../saves/autosave';

/** 每款遊戲成功開始執行後呼叫一次。 */
export function onGameStarted(): void {
  runtime.gameSessionActive = true;
  resetSpeedControls();
  heldNativeButtons[0].clear();
  heldNativeButtons[1].clear();
  if (runtime.currentCatalogFile) lobbyPrefs.noteRecent(runtime.currentCatalogFile);
  syncFastForwardBackend();
  refreshToolsPanels();
  void offerAutoSaveResume();
}


/** 離開目前遊戲前呼叫：自動存檔並清除本局的暫時狀態。 */
export async function endGameSession(): Promise<void> {
  if (!runtime.gameSessionActive) return;
  await autosaveNow();
  runtime.gameSessionActive = false;
  hideResumeBanner();
  resetSpeedControls();
  mobileTools?.close();
}
