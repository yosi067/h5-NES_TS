/**
 * 系統快捷鍵（存讀檔、返回大廳）與 EmulatorJS iframe 轉送的快捷鍵。
 */
import { isSnes9xActive } from '../backends/active';
import { setFastForwardHeld } from '../features/speed';
import { loadStateForUser, saveStateForUser } from '../saves/save-states';
import { confirmReturnToMachineMenu } from '../session/game-loader';
import { showToast } from '../ui/dialogs';

// ===== 鍵盤快捷鍵 =====

export function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      void saveStateForUser(0);
    }
    if (e.key === 'F7') {
      e.preventDefault();
      void loadStateForUser(0);
    }
    if (e.key >= 'F1' && e.key <= 'F4' && e.shiftKey) {
      e.preventDefault();
      const slot = parseInt(e.key[1]);
      void saveStateForUser(slot);
    }
    if (e.key >= '1' && e.key <= '4' && e.ctrlKey) {
      e.preventDefault();
      const slot = parseInt(e.key);
      void loadStateForUser(slot);
    }
    // 瀏覽器返回手勢與退出全螢幕也可能送出 Escape，避免直接銷毀遊戲核心。
    if (e.key === 'Escape' && !e.repeat && !document.fullscreenElement) {
      e.preventDefault();
      void confirmReturnToMachineMenu();
    }
  });

  window.addEventListener('message', (event) => {
    if (!isSnes9xActive() || (event.origin !== window.location.origin && event.origin !== 'null')) return;
    const iframe = document.getElementById('snes9x-screen') as HTMLIFrameElement | null;
    if (event.source !== iframe?.contentWindow) return;
    if (!event.data || typeof event.data !== 'object' || event.data.source !== 'h5-emu-snes9x-shortcut') return;
    if (event.data.action === 'fast-forward' && typeof event.data.pressed === 'boolean') {
      setFastForwardHeld(event.data.pressed);
      return;
    }

    const slot = typeof event.data.slot === 'number' && Number.isInteger(event.data.slot)
      ? event.data.slot
      : 0;
    if (event.data.action === 'save' || event.data.action === 'load') {
      const operation = event.data.action === 'save'
        ? saveStateForUser(slot)
        : loadStateForUser(slot);
      void operation.then(success => {
        showToast(success
          ? (event.data.action === 'save' ? '✅ 存檔成功' : '✅ 讀取成功')
          : (event.data.action === 'save' ? '❌ 存檔失敗' : '❌ 沒有存檔'));
      });
    }
  });
}
