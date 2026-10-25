/**
 * N64（Mupen64Plus）的鍵盤事件對應與觸控按鍵轉送。
 */
import { isMupenN64Active } from '../backends/active';

interface N64KeyBinding {
  key: string;
  code: string;
  keyCode: number;
  location?: number;
}


const N64_KEY_BINDINGS: Record<string, N64KeyBinding> = {
  'analog-up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  'analog-down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  'analog-left': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  'analog-right': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  'dpad-up': { key: 'w', code: 'KeyW', keyCode: 87 },
  'dpad-down': { key: 's', code: 'KeyS', keyCode: 83 },
  'dpad-left': { key: 'a', code: 'KeyA', keyCode: 65 },
  'dpad-right': { key: 'd', code: 'KeyD', keyCode: 68 },
  'c-up': { key: 'i', code: 'KeyI', keyCode: 73 },
  'c-down': { key: 'k', code: 'KeyK', keyCode: 75 },
  'c-left': { key: 'j', code: 'KeyJ', keyCode: 74 },
  'c-right': { key: 'l', code: 'KeyL', keyCode: 76 },
  'a': { key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: KeyboardEvent.DOM_KEY_LOCATION_LEFT },
  'b': { key: 'Control', code: 'ControlLeft', keyCode: 17, location: KeyboardEvent.DOM_KEY_LOCATION_LEFT },
  'start': { key: 'Enter', code: 'Enter', keyCode: 13 },
  'z': { key: 'z', code: 'KeyZ', keyCode: 90 },
  'l': { key: 'x', code: 'KeyX', keyCode: 88 },
  'r': { key: 'c', code: 'KeyC', keyCode: 67 },
};


const n64PressedKeys = new Set<string>();


export const N64_DEFAULT_KEY_CODES = new Set(Object.values(N64_KEY_BINDINGS).map((binding) => binding.code));


export function dispatchN64KeyboardEvent(bindingId: string, pressed: boolean): void {
  const binding = N64_KEY_BINDINGS[bindingId];
  if (!binding) return;
  if (pressed && n64PressedKeys.has(bindingId)) return;
  if (!pressed && !n64PressedKeys.has(bindingId)) return;

  if (pressed) {
    n64PressedKeys.add(bindingId);
  } else {
    n64PressedKeys.delete(bindingId);
  }

  const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
    key: binding.key,
    code: binding.code,
    bubbles: true,
    cancelable: true,
    location: binding.location ?? 0,
    repeat: false,
  });

  Object.defineProperty(event, 'keyCode', { get: () => binding.keyCode });
  Object.defineProperty(event, 'which', { get: () => binding.keyCode });

  document.getElementById('canvas')?.dispatchEvent(event);
  document.dispatchEvent(event);
  window.dispatchEvent(event);
}


export function releaseAllN64Inputs(): void {
  for (const bindingId of Array.from(n64PressedKeys)) {
    dispatchN64KeyboardEvent(bindingId, false);
  }
  document.querySelectorAll('#n64-controller-area .pressed').forEach(el => el.classList.remove('pressed'));
}


export function setN64ButtonPressed(bindingId: string, pressed: boolean, element?: HTMLElement): void {
  if (!isMupenN64Active()) return;
  dispatchN64KeyboardEvent(bindingId, pressed);
  element?.classList.toggle('pressed', pressed);
}
