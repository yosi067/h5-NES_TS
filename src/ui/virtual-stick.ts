import type { DirectionState } from './controls/types';

export type VirtualStickState = DirectionState;

/** 垂直與水平互跳時，回傳應先輸出的過渡斜角；其他情況回傳 null。 */
export function getBridgedDiagonal(
  previous: VirtualStickState,
  next: VirtualStickState,
): VirtualStickState | null {
  const previousVertical = previous.up !== previous.down && !previous.left && !previous.right;
  const previousHorizontal = previous.left !== previous.right && !previous.up && !previous.down;
  const nextVertical = next.up !== next.down && !next.left && !next.right;
  const nextHorizontal = next.left !== next.right && !next.up && !next.down;

  if (!((previousVertical && nextHorizontal) || (previousHorizontal && nextVertical))) return null;

  return {
    up: previous.up || next.up,
    down: previous.down || next.down,
    left: previous.left || next.left,
    right: previous.right || next.right,
  };
}