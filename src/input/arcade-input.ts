/**
 * 街機（FBNeo）的輸入位元遮罩：觸控、鍵盤與手把合併。
 */
import { readPadActions } from '../ui/input-bindings';
import { runtime } from '../app/runtime';
import { inputBindings } from '../app/preferences';
import { ARCADE_ACTION_BITS } from './buttons';
import { getFirstGamepad, getSecondGamepad } from './gamepad';

export function mergeArcadeInputSources(directInput: number, gamepadInput: number): number {
  return directInput | gamepadInput;
}


export function updateArcadeInputMask(mask: number, bit: number, pressed: boolean): number {
  return pressed ? (mask | bit) : (mask & ~bit);
}


export function setArcadeInputBit(bit: number, pressed: boolean, player: 1 | 2 = 1): void {
  if (player === 1) {
    runtime.arcadeInputP1 = updateArcadeInputMask(runtime.arcadeInputP1, bit, pressed);
  } else {
    runtime.arcadeInputP2 = updateArcadeInputMask(runtime.arcadeInputP2, bit, pressed);
  }
}


/** 街機核心每幀取輸入，這裡把手把動作換成位元遮罩。 */
export function pollArcadeGamepads(): void {
  const pad = getFirstGamepad();
  if (!pad) {
    runtime.arcadeGamepadInputP1 = 0;
    runtime.arcadeGamepadInputP2 = 0;
    return;
  }
  let mask = 0;
  for (const action of readPadActions(inputBindings.layout('arcade'), pad)) {
    mask |= ARCADE_ACTION_BITS[action] ?? 0;
  }
  runtime.arcadeGamepadInputP1 = mask;

  const second = getSecondGamepad();
  let mask2 = 0;
  if (second) {
    for (const action of readPadActions(inputBindings.layout('arcade'), second)) {
      mask2 |= ARCADE_ACTION_BITS[action] ?? 0;
    }
  }
  runtime.arcadeGamepadInputP2 = mask2;
}
