/**
 * 鍵盤遊戲輸入（依可自訂的按鍵配置）。
 */
import { isDefaultLayout, resolveKeyAction } from '../ui/input-bindings';
import { isEditableTarget } from '../ui/mobile-tools';
import { runtime } from '../app/runtime';
import { inputBindings } from '../app/preferences';
import { getBindingLayout, performInputAction } from './actions';
import { setupGamepadInput } from './gamepad';
import { N64_DEFAULT_KEY_CODES } from './n64-keys';

export function setupKeyboardInput(): void {
  const handle = (event: KeyboardEvent, pressed: boolean) => {
    if (document.body.classList.contains('binding-capture')) return;
    // 金手指／搜尋等文字輸入框：讓使用者正常打字，不送進遊戲。
    if (isEditableTarget(event.target)) return;
    const layout = getBindingLayout();

    if (layout === 'n64') {
      // 預設按鍵由 Mupen 直接處理；只有改過鍵位時才攔截並改送合成事件。
      if (!event.isTrusted || isDefaultLayout('n64', inputBindings.all)) return;
      const action = resolveKeyAction(inputBindings.layout('n64'), event.code);
      if (action) {
        performInputAction('n64', action, pressed);
      } else if (!N64_DEFAULT_KEY_CODES.has(event.code)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (layout === 'nes' && !runtime.nes) return;
    const action = resolveKeyAction(inputBindings.layout(layout), event.code);
    if (!action) return;
    performInputAction(layout, action, pressed);
    event.preventDefault();
  };

  window.addEventListener('keydown', (event) => handle(event, true), true);
  window.addEventListener('keyup', (event) => handle(event, false), true);
  setupGamepadInput();
}
