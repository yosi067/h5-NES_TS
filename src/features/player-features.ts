/**
 * 玩家功能的組裝：手機功能選單、功能面板 API 與快轉／倒帶快捷鍵。
 */
import { resolveKeyAction } from '../ui/input-bindings';
import { isEditableTarget, type MobileTools, mountMobileTools } from '../ui/mobile-tools';
import { mountShellDecor } from '../ui/shell-decor';
import { type ToolsApi } from '../ui/tools-panel';
import { runtime } from '../app/runtime';
import { featureSettings, inputBindings } from '../app/preferences';
import { registerServiceWorker } from '../app/service-worker';
import { isMupenN64Active } from '../backends/active';
import { canFastForward, fastForwardLevel, setFastForwardHeld, setFastForwardLevel, setRewindHeld } from './speed';
import { getBindingLayout } from '../input/actions';
import { autosaveNow } from '../saves/autosave';
import { exportSaveBackup, importSaveBackup } from '../saves/backup-flow';
import { describeSaveSlot, loadStateForUser, saveStateForUser } from '../saves/save-states';
import { confirmReturnToMachineMenu } from '../session/game-loader';
import { applyPadAppearance } from '../ui/controller-layout';
import { showToast } from '../ui/dialogs';

export let mobileTools: MobileTools | null = null;

export const toolsPanelRefreshers = new Set<() => void>();


export function refreshToolsPanels(): void {
  for (const refresh of toolsPanelRefreshers) refresh();
  mobileTools?.refresh();
}


// ---- 功能面板 ----

export function createToolsApi(): ToolsApi {
  return {
    settings: featureSettings,
    canFastForward,
    fastForwardLevel: () => fastForwardLevel,
    setFastForwardLevel,
    exportBackup: exportSaveBackup,
    importBackup: importSaveBackup,
    notify: showToast,
    slots: {
      list: [0, 1, 2],
      label: (slot) => (slot === 0 ? '第 1 格（💾📂 同一格）' : `第 ${slot + 1} 格`),
      describe: describeSaveSlot,
      save: (slot) => saveStateForUser(slot),
      load: (slot) => loadStateForUser(slot),
    },
  };
}


export function setupPlayerFeatures(): void {
  applyPadAppearance();
  featureSettings.subscribe(() => {
    applyPadAppearance();
  });

  if (runtime.gameboyShell) mountShellDecor(runtime.gameboyShell);
  mobileTools = mountMobileTools({ ...createToolsApi(), returnToLobby: () => { void confirmReturnToMachineMenu(); } });

  const isGameHold = (event: KeyboardEvent) => document.body.classList.contains('game-active')
    && !document.body.classList.contains('binding-capture')
    && !isEditableTarget(event.target)
    && !isMupenN64Active();
  const onHoldKey = (event: KeyboardEvent, pressed: boolean) => {
    if (!isGameHold(event) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Tab') {
      // 選單開啟時 Tab 用於移動焦點。
      if (document.querySelector('.stage-drawer.is-open, .mobile-tools-sheet.is-open, #app-dialog-overlay:not([hidden])')) return;
      event.preventDefault();
      if (pressed && event.repeat) return;
      setFastForwardHeld(pressed);
    } else if (event.code === 'Backspace') {
      if (resolveKeyAction(inputBindings.layout(getBindingLayout()), 'Backspace')) return;
      event.preventDefault();
      if (pressed && event.repeat) return;
      setRewindHeld(pressed);
    }
  };
  document.addEventListener('keydown', (event) => onHoldKey(event, true));
  document.addEventListener('keyup', (event) => onHoldKey(event, false));
  window.addEventListener('blur', () => {
    setFastForwardHeld(false);
    setRewindHeld(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setFastForwardHeld(false);
      setRewindHeld(false);
      void autosaveNow();
    }
  });
  window.addEventListener('pagehide', () => { void autosaveNow(); });
  registerServiceWorker();
}
