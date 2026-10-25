/**
 * 電腦版舞台（選單抽屜、全螢幕）與本機 ROM 選擇。
 */
import { type DesktopStage, mountDesktopStage } from './desktop-stage';
import { mountDesktopFramePicker, mountToolsPanel } from './tools-panel';
import { runtime } from '../app/runtime';
import { featureSettings, inputBindings } from '../app/preferences';
import { getActiveBackend } from '../backends/registry';
import { startEmulation, stopEmulation } from '../backends/lifecycle';
import { createToolsApi, toolsPanelRefreshers } from '../features/player-features';
import { getBindingLayout } from '../input/actions';
import { describeSaveSlot, loadStateForUser, saveStateForUser } from '../saves/save-states';
import { confirmReturnToMachineMenu, loadRomFromFile } from '../session/game-loader';
import { showToast } from './dialogs';

// ===== 電腦版控制 =====

export let desktopStage: DesktopStage | null = null;


/**
 * 設定全螢幕與電腦版舞台（選單抽屜、浮動工具列）
 */
export function setupDesktopControls(): void {
  type WebkitFullscreenDocument = Document & {
    webkitExitFullscreen?: () => void | Promise<void>;
    webkitFullscreenElement?: Element | null;
  };
  type WebkitFullscreenTarget = HTMLElement & {
    webkitRequestFullscreen?: () => void | Promise<void>;
  };

  const fullscreenDocument = document as WebkitFullscreenDocument;
  const getFullscreenElement = () => document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;

  const toggleFullscreen = () => {
    if (getFullscreenElement()) {
      const exitFullscreen = document.exitFullscreen?.bind(document)
        ?? fullscreenDocument.webkitExitFullscreen?.bind(document);
      void Promise.resolve(exitFullscreen?.()).catch((error) => console.warn('離開全螢幕失敗:', error));
      return;
    }

    const target = (runtime.gameboyShell ?? document.documentElement) as WebkitFullscreenTarget;
    const requestFullscreen = target.requestFullscreen?.bind(target)
      ?? target.webkitRequestFullscreen?.bind(target);
    void Promise.resolve(requestFullscreen?.()).catch((error) => console.warn('進入全螢幕失敗:', error));
  };

  const syncFullscreenState = () => {
    const isIOSLandscape = document.body.classList.contains('ios-safari-landscape-mode')
      || document.body.classList.contains('mobile-landscape-mode')
        && /iPad|iPhone|iPod/i.test(navigator.userAgent);
    document.body.classList.toggle('fullscreen-active', Boolean(getFullscreenElement()) || isIOSLandscape);
  };

  document.getElementById('btn-fullscreen-overlay')?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);

  if (!runtime.gameboyShell) return;
  desktopStage = mountDesktopStage({
    shell: runtime.gameboyShell,
    bindings: inputBindings,
    actions: {
      isRunning: () => runtime.isRunning,
      pause: stopEmulation,
      resume: startEmulation,
      reset: () => getActiveBackend().reset(),
      save: (slot) => { void saveStateForUser(slot, true); },
      load: (slot) => { void loadStateForUser(slot, true); },
      returnToLobby: () => { void confirmReturnToMachineMenu(); },
      openRomFile: () => document.getElementById('rom-input')?.click(),
      toggleFullscreen,
      isFullscreen: () => getFullscreenElement() !== null,
      getLayout: getBindingLayout,
      getGameTitle: () => runtime.currentGameTitle || runtime.currentRomFilename.replace(/\.[^.]+$/, ''),
      notify: showToast,
      describeSlot: describeSaveSlot,
    },
    screenExtras: {
      mount: (container) => mountDesktopFramePicker(container, featureSettings),
    },
    playExtras: {
      mount: (container) => {
        const tools = mountToolsPanel(container, createToolsApi(), { includeSlots: false, includeTouch: false });
        toolsPanelRefreshers.add(tools.refresh);
        return tools;
      },
    },
  });
}


/**
 * 設定檔案選擇器 (電腦版)
 */
export function setupFileInput(): void {
  const fileInput = document.getElementById('rom-input') as HTMLInputElement;
  
  fileInput?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      await loadRomFromFile(file);
    }
  });
}
