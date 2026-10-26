/**
 * 載入遊戲（伺服器或本機檔案）與返回大廳。
 */
import { getRomAssetUrl } from '../rom-assets';
import JSZip from 'jszip';
import { runtime } from '../app/runtime';
import { isAbortError, throwIfSignalAborted } from '../app/async';
import { clearAudioQueue } from '../audio/audio-output';
import { isSnes9xActive } from '../backends/active';
import { stopSnes9xBackend } from '../backends/emulatorjs/emulatorjs-backend';
import { startFbNeoGame, stopFbNeoBackend } from '../backends/fbneo/fbneo-backend';
import { isFbNeoArcadeRomName } from '../backends/fbneo/fbneo-games';
import { stopEmulation } from '../backends/lifecycle';
import { stopN64Backend } from '../backends/n64/n64-backend';
import { resetWasmCore, startGame } from '../backends/native/native-core';
import { getRomCatalogEntry, getRomDisplayName } from '../catalog/machines';
import { resetSpeedControls } from '../features/speed';
import { startLobbyCrtPreview, stopLobbyCrtPreview } from '../lobby/crt-preview';
import { renderMachineSelector, romCatalog } from '../lobby/lobby-view';
import { autosaveNow, hideResumeBanner } from '../saves/autosave';
import { saveSram } from '../saves/sram';
import { endGameSession } from './game-session';
import { touchControls } from '../ui/controller-layout';
import { showAppAlert, showAppConfirm } from '../ui/dialogs';
import { cancelPendingGameLoad, hideGameLoading, readResponseWithProgress, showGameLoading, updateGameLoading, updateGameLoadingProgress } from '../ui/loading-overlay';
import { updateIOSInstallHint } from '../ui/responsive';

function beginGameLoad(): AbortController {
  if (runtime.gameSessionActive) {
    // 遊戲中改載入另一款：先同步擷取自動存檔，再拆掉目前核心。
    void autosaveNow();
    runtime.gameSessionActive = false;
    hideResumeBanner();
    resetSpeedControls();
  }
  runtime.gameLoadAbortController?.abort();
  runtime.gameLoadAbortController = new AbortController();
  return runtime.gameLoadAbortController;
}


/**
 * 從伺服器載入 ROM（支援 ZIP）
 */
export async function loadRomFromServer(filename: string): Promise<void> {
  const loadController = beginGameLoad();
  runtime.currentCatalogFile = filename;
  const rom = getRomCatalogEntry(filename);
  runtime.currentGameTitle = getRomDisplayName(rom);
  let loadingSequence = 0;
  try {
    loadingSequence = await showGameLoading(rom.name, '正在下載遊戲檔案…');
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(getRomAssetUrl(baseUrl, filename), { signal: loadController.signal });
    if (!response.ok) {
      throw new Error(`無法載入 ROM: ${filename}`);
    }
    
    const buffer = await readResponseWithProgress(response, loadingSequence);
    throwIfSignalAborted(loadController.signal);
    const lower = filename.toLowerCase();
    updateGameLoading(loadingSequence, '正在啟動模擬器…');

    if (isFbNeoArcadeRomName(filename)) {
      runtime.currentRomFilename = filename;
      await startFbNeoGame(filename, buffer, loadingSequence, loadController.signal);
      return;
    }

    if (lower.endsWith('.zip')) {
      // 解壓 ZIP
      updateGameLoading(loadingSequence, '正在解壓縮遊戲檔案…');
      const zip = await JSZip.loadAsync(buffer);
      const romExtensions = ['.nes', '.smc', '.sfc', '.fig', '.gb', '.gbc', '.gg', '.sms', '.md', '.gen', '.smd', '.z64', '.n64', '.v64'];
      let romFile: JSZip.JSZipObject | null = null;
      let romFileName = '';

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const nameLower = name.toLowerCase();
        if (romExtensions.some(ext => nameLower.endsWith(ext))) {
          romFile = entry;
          romFileName = name;
          break;
        }
      }

      if (!romFile) {
        await showAppAlert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      const romBuffer = await romFile.async('arraybuffer', metadata => {
        updateGameLoadingProgress(
          loadingSequence,
          metadata.percent,
          `正在解壓縮遊戲檔案… ${Math.round(metadata.percent)}%`,
        );
      });
      throwIfSignalAborted(loadController.signal);
      runtime.currentRomFilename = romFileName.split('/').pop() || romFileName;
      updateGameLoading(loadingSequence, '正在啟動模擬器…');
      await startGame(romBuffer, loadController.signal);
    } else {
      runtime.currentRomFilename = filename;
      await startGame(buffer, loadController.signal);
    }
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('載入 ROM 失敗:', error);
    await showAppAlert('載入遊戲失敗，請重試');
  } finally {
    if (runtime.gameLoadAbortController === loadController) runtime.gameLoadAbortController = null;
    if (loadingSequence > 0) hideGameLoading(loadingSequence);
  }
}


/**
 * 從檔案載入 ROM（支援 ZIP）
 */
export async function loadRomFromFile(file: File): Promise<void> {
  const loadController = beginGameLoad();
  runtime.currentCatalogFile = '';
  const rom = getRomCatalogEntry(file.name, file.name);
  runtime.currentGameTitle = getRomDisplayName(rom).replace(/\.[^.]+$/, '');
  let loadingSequence = 0;
  try {
    loadingSequence = await showGameLoading(rom.name, '正在讀取遊戲檔案…');
    const lower = file.name.toLowerCase();
    let buffer: ArrayBuffer;
    let romName = file.name;

    if (lower.endsWith('.zip')) {
      if (isFbNeoArcadeRomName(file.name)) {
        const zipBuffer = await file.arrayBuffer();
        throwIfSignalAborted(loadController.signal);
        runtime.currentRomFilename = file.name;
        updateGameLoading(loadingSequence, '正在啟動模擬器…');
        await startFbNeoGame(file.name, zipBuffer, loadingSequence, loadController.signal);
        return;
      }

      // 解壓 ZIP，找第一個遊戲檔案
      updateGameLoading(loadingSequence, '正在解壓縮遊戲檔案…');
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const romExtensions = ['.nes', '.smc', '.sfc', '.fig', '.gb', '.gbc', '.gg', '.sms', '.md', '.gen', '.smd', '.z64', '.n64', '.v64'];
      let romFile: JSZip.JSZipObject | null = null;
      let romFileName = '';

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const nameLower = name.toLowerCase();
        if (romExtensions.some(ext => nameLower.endsWith(ext))) {
          romFile = entry;
          romFileName = name;
          break;
        }
      }

      if (!romFile) {
        await showAppAlert('ZIP 檔案中找不到遊戲 ROM');
        return;
      }

      buffer = await romFile.async('arraybuffer', metadata => {
        updateGameLoadingProgress(
          loadingSequence,
          metadata.percent,
          `正在解壓縮遊戲檔案… ${Math.round(metadata.percent)}%`,
        );
      });
      throwIfSignalAborted(loadController.signal);
      // Use the actual ROM filename inside the ZIP for extension detection
      romName = romFileName.split('/').pop() || romFileName;
    } else {
      buffer = await file.arrayBuffer();
    }

    runtime.currentRomFilename = romName;
    updateGameLoading(loadingSequence, '正在啟動模擬器…');
    await startGame(buffer, loadController.signal);
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('載入 ROM 失敗:', error);
    await showAppAlert('載入遊戲失敗，請重試');
  } finally {
    if (runtime.gameLoadAbortController === loadController) runtime.gameLoadAbortController = null;
    if (loadingSequence > 0) hideGameLoading(loadingSequence);
  }
}


/**
 * 隱藏 ROM 選擇器
 */
export function hideRomSelector(): void {
  stopLobbyCrtPreview();
  if (runtime.romSelector) runtime.romSelector.style.display = 'none';
  if (runtime.gameboyShell) runtime.gameboyShell.style.removeProperty('display');
  document.body.classList.add('game-active');
  updateIOSInstallHint();
}


/**
 * 顯示 ROM 選擇器
 */
export async function showRomSelector(): Promise<void> {
  cancelPendingGameLoad();
  await endGameSession();
  if (!isSnes9xActive()) saveSram();
  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  clearAudioQueue();
  runtime.currentN64RomData = null;
  touchControls?.releaseAll();
  runtime.powerLed?.classList.remove('on');
  if (romCatalog.length > 0) renderMachineSelector();
  if (runtime.romSelector) runtime.romSelector.style.display = 'flex';
  if (runtime.gameboyShell) runtime.gameboyShell.style.display = 'none';
  document.body.classList.remove('game-active', 'screen-shrunk');
  updateIOSInstallHint();
  void startLobbyCrtPreview();
}


export async function confirmReturnToMachineMenu(): Promise<void> {
  if (await showAppConfirm('是否返回遊戲主機選單')) {
    await showRomSelector();
  }
}
