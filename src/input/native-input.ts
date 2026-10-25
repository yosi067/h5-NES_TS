/**
 * 自製 WASM 核心與 EmulatorJS 的按鍵輸入（含第二玩家與按住狀態同步）。
 */
import { type BindingLayout } from '../ui/input-bindings';
import { runtime } from '../app/runtime';
import { isEmulatorJsNesActive, isFbNeoActive, isMupenN64Active, isSnes9xActive } from '../backends/active';
import { snes9xBackend } from '../backends/emulatorjs-backend';
import { noteGamePresentationInput } from '../backends/native/game-profiles';
import { setArcadeInputBit } from './arcade-input';
import { ARCADE_ACTION_BITS, ControllerButton, NES_ACTION_BUTTONS, SNES_ACTION_BUTTONS } from './buttons';

export function setNesButton(button: ControllerButton, pressed: boolean): void {
  noteGamePresentationInput(button, pressed);
  if (isEmulatorJsNesActive()) {
    const libretroButton = button === ControllerButton.A ? 8
      : button === ControllerButton.B ? 0
      : button;
    snes9xBackend?.setButton(libretroButton, pressed);
  } else {
    setNativeButton(0, button, pressed);
  }
}


export function setSnesButton(button: number, pressed: boolean): void {
  if (isSnes9xActive()) snes9xBackend?.setButton(button, pressed);
  else setNativeButton(0, button, pressed);
}


/** 自製核心按鍵：同時記錄按住狀態，倒帶或讀檔後可把目前手指的狀態補回核心。 */
export const heldNativeButtons: [Set<number>, Set<number>] = [new Set(), new Set()];


function setNativeButton(player: 0 | 1, button: number, pressed: boolean): void {
  if (pressed) heldNativeButtons[player].add(button);
  else heldNativeButtons[player].delete(button);
  runtime.nes?.setButton(player, button, pressed);
}


export function resyncNativeButtons(): void {
  if (!runtime.nes) return;
  const maxButton = runtime.nes.getCoreType() === 'snes' ? 11 : 7;
  for (const player of [0, 1] as const) {
    for (let button = 0; button <= maxButton; button++) {
      runtime.nes.setButton(player, button, heldNativeButtons[player].has(button));
    }
  }
}


/** 第二玩家：FC / SFC 自製核心與 EmulatorJS 核心支援；GB / GG 只有單一手把。 */
export function supportsPlayerTwo(): boolean {
  if (isMupenN64Active()) return false;
  if (isFbNeoActive() || isSnes9xActive()) return true;
  const core = runtime.nes?.getCoreType();
  return core === 'nes' || core === 'snes';
}


export function performPlayer2Action(layout: BindingLayout, action: string, pressed: boolean): void {
  if (!supportsPlayerTwo()) return;
  switch (layout) {
    case 'nes': {
      const button = NES_ACTION_BUTTONS[action];
      if (button === undefined) return;
      if (isEmulatorJsNesActive()) {
        const libretroButton = button === ControllerButton.A ? 8 : button === ControllerButton.B ? 0 : button;
        snes9xBackend?.setButton(libretroButton, pressed, 1);
      } else {
        setNativeButton(1, button, pressed);
      }
      break;
    }
    case 'snes': {
      const button = SNES_ACTION_BUTTONS[action];
      if (button === undefined) return;
      if (isSnes9xActive()) snes9xBackend?.setButton(button, pressed, 1);
      else setNativeButton(1, button, pressed);
      break;
    }
    case 'arcade': {
      const bit = ARCADE_ACTION_BITS[action];
      if (bit !== undefined) setArcadeInputBit(bit, pressed, 2);
      break;
    }
    case 'n64':
      break;
  }
}
