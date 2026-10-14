export type ConsoleProfileType =
  | 'NES_GB'
  | 'SNES'
  | 'ARCADE_FIGHTING'
  | 'ARCADE_SHMUP'
  | 'ARCADE_GENERIC'
  | 'N64_PS1';

/** 與主機無關的按鍵位元；各核心轉接器負責翻成實際按鍵。 */
export const PadBit = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  A: 1 << 4,
  B: 1 << 5,
  C: 1 << 6,
  D: 1 << 7,
  E: 1 << 8,
  F: 1 << 9,
  X: 1 << 10,
  Y: 1 << 11,
  L: 1 << 12,
  R: 1 << 13,
  Z: 1 << 14,
  Start: 1 << 15,
  Select: 1 << 16,
  CUp: 1 << 17,
  CDown: 1 << 18,
  CLeft: 1 << 19,
  CRight: 1 << 20,
} as const;

export interface DirectionState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface ButtonConfig {
  id: string;
  label: string;
  /** 可為複合鍵（巨集），例如 PadBit.A | PadBit.B。 */
  bitmask: number;
  /** 額外判定半徑 (px)；未指定時取元素尺寸的一半。 */
  radius?: number;
  isMacro?: boolean;
  autoFire?: boolean;
}

export interface DPadConfig {
  mode: 'FIXED_DPAD' | 'FLOATING_JOYSTICK' | 'RELATIVE_DRAG';
  /** 死區半徑 (px)。 */
  deadzone: number;
  /** 斜角扇形寬度（度）；45 為標準，格鬥模式 55。 */
  diagonalAngleWidth: number;
  enableCardinalToDiagonalInterpolation: boolean;
}

export interface ControllerProfile {
  type: ConsoleProfileType;
  dpad: DPadConfig;
  buttons: ButtonConfig[];
  enableChordOverlap: boolean;
  /** 隱形重疊區的相鄰按鈕配對（以 ButtonConfig.id 表示）。 */
  chordPairs: Array<[string, string]>;
  /** 搓招軌跡與指令列。 */
  inputTrail: boolean;
}

export const NEUTRAL_DIRECTION: Readonly<DirectionState> = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
});

export function bitsOf(mask: number): number[] {
  const bits: number[] = [];
  for (let bit = 0; bit < 31; bit++) {
    if (mask & (1 << bit)) bits.push(1 << bit);
  }
  return bits;
}

export function directionToMask(state: DirectionState): number {
  return (state.up ? PadBit.Up : 0)
    | (state.down ? PadBit.Down : 0)
    | (state.left ? PadBit.Left : 0)
    | (state.right ? PadBit.Right : 0);
}
