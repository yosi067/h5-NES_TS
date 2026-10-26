/**
 * 依目前主機把「動作」送到對應核心。
 */
import { type BindingLayout } from '../ui/input-bindings';
import { runtime } from '../app/runtime';
import { isFbNeoActive, isMupenN64Active, usesSixButtonController } from '../backends/active';
import { setArcadeInputBit } from './arcade-input';
import { ARCADE_ACTION_BITS, NES_ACTION_BUTTONS, SNES_ACTION_BUTTONS } from './buttons';
import { dispatchN64KeyboardEvent } from './n64-keys';
import { setNesButton, setSnesButton } from './native-input';

export function getBindingLayout(): BindingLayout {
  if (isMupenN64Active()) return 'n64';
  if (isFbNeoActive()) return 'arcade';
  return usesSixButtonController() ? 'snes' : 'nes';
}


/** 依目前主機把「動作」送進對應核心。 */
export function performInputAction(layout: BindingLayout, action: string, pressed: boolean): void {
  switch (layout) {
    case 'nes': {
      const button = NES_ACTION_BUTTONS[action];
      if (button !== undefined && runtime.nes) setNesButton(button, pressed);
      break;
    }
    case 'snes': {
      const button = SNES_ACTION_BUTTONS[action];
      if (button !== undefined) setSnesButton(button, pressed);
      break;
    }
    case 'arcade': {
      const bit = ARCADE_ACTION_BITS[action];
      if (bit !== undefined) setArcadeInputBit(bit, pressed);
      break;
    }
    case 'n64':
      if (isMupenN64Active()) dispatchN64KeyboardEvent(action, pressed);
      break;
  }
}
