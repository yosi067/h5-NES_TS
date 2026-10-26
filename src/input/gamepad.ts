/**
 * 實體手把輪詢（第一支為 1P、第二支為 2P）與連線提示。
 */
import { type BindingLayout, readPadActions } from '../ui/input-bindings';
import { runtime } from '../app/runtime';
import { inputBindings } from '../app/preferences';
import { getBindingLayout, performInputAction } from './actions';
import { performPlayer2Action, supportsPlayerTwo } from './native-input';
import { showToast } from '../ui/dialogs';

export function getFirstGamepad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}


/** 第二支已連接的手把（2P）。 */
export function getSecondGamepad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  let seen = 0;
  for (const pad of pads) {
    if (pad && pad.connected && ++seen === 2) return pad;
  }
  return null;
}


let gamepadLoopHandle: number | null = null;

let gamepadHeldLayout: BindingLayout | null = null;

const gamepadHeldActions = new Set<string>();


function releaseGamepadActions(): void {
  if (gamepadHeldLayout) {
    for (const action of gamepadHeldActions) performInputAction(gamepadHeldLayout, action, false);
  }
  gamepadHeldActions.clear();
  gamepadHeldLayout = null;
}


/** 非街機主機的手把輪詢；街機由 FBNeo 幀迴圈直接讀取。 */
function pollGamepadActions(): void {
  gamepadLoopHandle = null;
  const pad = getFirstGamepad();
  if (!pad) {
    releaseGamepadActions();
    return;
  }

  const layout = getBindingLayout();
  const active = runtime.isRunning && layout !== 'arcade' && !document.body.classList.contains('binding-capture');
  if (!active || gamepadHeldLayout !== layout) releaseGamepadActions();
  if (active) {
    gamepadHeldLayout = layout;
    const next = readPadActions(inputBindings.layout(layout), pad);
    for (const action of next) {
      if (!gamepadHeldActions.has(action)) performInputAction(layout, action, true);
    }
    for (const action of Array.from(gamepadHeldActions)) {
      if (!next.has(action)) performInputAction(layout, action, false);
    }
    gamepadHeldActions.clear();
    for (const action of next) gamepadHeldActions.add(action);
  }
  pollSecondGamepadActions(active ? layout : null);
  gamepadLoopHandle = requestAnimationFrame(pollGamepadActions);
}


let gamepadP2HeldLayout: BindingLayout | null = null;

const gamepadP2HeldActions = new Set<string>();


function releaseGamepadP2Actions(): void {
  if (gamepadP2HeldLayout) {
    for (const action of gamepadP2HeldActions) performPlayer2Action(gamepadP2HeldLayout, action, false);
  }
  gamepadP2HeldActions.clear();
  gamepadP2HeldLayout = null;
}


/** 第二支手把 → 2P（街機由 FBNeo 幀迴圈直接讀取）。 */
function pollSecondGamepadActions(layout: BindingLayout | null): void {
  const pad = getSecondGamepad();
  if (!pad || !layout || layout === 'n64' || !supportsPlayerTwo()) {
    releaseGamepadP2Actions();
    return;
  }
  if (gamepadP2HeldLayout !== layout) releaseGamepadP2Actions();
  gamepadP2HeldLayout = layout;
  const next = readPadActions(inputBindings.layout(layout), pad);
  for (const action of next) {
    if (!gamepadP2HeldActions.has(action)) performPlayer2Action(layout, action, true);
  }
  for (const action of Array.from(gamepadP2HeldActions)) {
    if (!next.has(action)) performPlayer2Action(layout, action, false);
  }
  gamepadP2HeldActions.clear();
  for (const action of next) gamepadP2HeldActions.add(action);
}


export function setupGamepadInput(): void {
  const start = () => {
    if (gamepadLoopHandle === null) gamepadLoopHandle = requestAnimationFrame(pollGamepadActions);
  };
  const connectedCount = () => (navigator.getGamepads?.() ?? []).filter((pad) => pad?.connected).length;
  window.addEventListener('gamepadconnected', (event) => {
    start();
    const slot = connectedCount() >= 2 && getSecondGamepad()?.index === event.gamepad.index ? '2P' : '1P';
    if (document.body.classList.contains('game-active')) showToast(`🎮 手把已連接（${slot}）`);
  });
  window.addEventListener('gamepaddisconnected', () => {
    if (!getFirstGamepad()) releaseGamepadActions();
    if (!getSecondGamepad()) releaseGamepadP2Actions();
    if (document.body.classList.contains('game-active')) showToast('🎮 手把已中斷連線');
  });
  if (getFirstGamepad()) start();
}
