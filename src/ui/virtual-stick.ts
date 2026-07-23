export interface VirtualStickState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const NEUTRAL_STICK_STATE: VirtualStickState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const DIAGONAL_COMPONENT_RATIO = 0.36;

export function quantizeVirtualStick(
  dx: number,
  dy: number,
  deadZone: number,
): VirtualStickState {
  if (Math.hypot(dx, dy) <= deadZone) return { ...NEUTRAL_STICK_STATE };

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const horizontal = absX >= absY * DIAGONAL_COMPONENT_RATIO;
  const vertical = absY >= absX * DIAGONAL_COMPONENT_RATIO;

  return {
    up: vertical && dy < 0,
    down: vertical && dy > 0,
    left: horizontal && dx < 0,
    right: horizontal && dx > 0,
  };
}

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