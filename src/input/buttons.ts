/**
 * 各主機的按鍵編號與「動作 → 按鍵」對照表。
 */

export const ArcadeInputBit = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  ButtonA: 1 << 4,
  ButtonB: 1 << 5,
  ButtonC: 1 << 6,
  ButtonD: 1 << 7,
  Coin: 1 << 8,
  Start: 1 << 9,
  ButtonE: 1 << 10,
  ButtonF: 1 << 11,
} as const;


// 控制器按鈕編號（與 Rust 端一致 - NES）
export const ControllerButton = {
  A: 0,
  B: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
} as const;

export type ControllerButton = typeof ControllerButton[keyof typeof ControllerButton];


// SNES 控制器按鈕編號（與 Rust controller.rs 一致）
export const SnesButton = {
  B: 0,
  Y: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const;


/** 動作 → NES 核心按鍵 */
export const NES_ACTION_BUTTONS: Record<string, ControllerButton> = {
  up: ControllerButton.Up,
  down: ControllerButton.Down,
  left: ControllerButton.Left,
  right: ControllerButton.Right,
  a: ControllerButton.A,
  b: ControllerButton.B,
  select: ControllerButton.Select,
  start: ControllerButton.Start,
};


/** 動作 → SNES / Mega Drive 按鍵 */
export const SNES_ACTION_BUTTONS: Record<string, number> = {
  up: SnesButton.Up,
  down: SnesButton.Down,
  left: SnesButton.Left,
  right: SnesButton.Right,
  a: SnesButton.A,
  b: SnesButton.B,
  x: SnesButton.X,
  y: SnesButton.Y,
  l: SnesButton.L,
  r: SnesButton.R,
  select: SnesButton.Select,
  start: SnesButton.Start,
};


export const ARCADE_ACTION_BITS: Record<string, number> = {
  up: ArcadeInputBit.Up,
  down: ArcadeInputBit.Down,
  left: ArcadeInputBit.Left,
  right: ArcadeInputBit.Right,
  a: ArcadeInputBit.ButtonA,
  b: ArcadeInputBit.ButtonB,
  c: ArcadeInputBit.ButtonC,
  d: ArcadeInputBit.ButtonD,
  e: ArcadeInputBit.ButtonE,
  f: ArcadeInputBit.ButtonF,
  coin: ArcadeInputBit.Coin,
  start: ArcadeInputBit.Start,
};
