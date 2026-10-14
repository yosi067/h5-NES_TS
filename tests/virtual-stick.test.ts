import { describe, expect, it } from 'vitest';
import { getBridgedDiagonal } from '../src/ui/virtual-stick';

describe('virtual stick diagonal bridging', () => {
  it.each([
    [{ up: false, down: true, left: false, right: false }, { up: false, down: false, left: false, right: true }, 'down-right'],
    [{ up: false, down: true, left: false, right: false }, { up: false, down: false, left: true, right: false }, 'down-left'],
    [{ up: false, down: false, left: false, right: true }, { up: false, down: true, left: false, right: false }, 'right-down'],
    [{ up: false, down: false, left: true, right: false }, { up: false, down: true, left: false, right: false }, 'left-down'],
  ])('bridges skipped adjacent cardinals for %s + %s (%s)', (previous, next) => {
    const bridge = getBridgedDiagonal(previous, next);
    expect(bridge).toEqual({
      up: false,
      down: previous.down || next.down,
      left: previous.left || next.left,
      right: previous.right || next.right,
    });
  });
});