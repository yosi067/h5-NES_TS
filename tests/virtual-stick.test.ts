import { describe, expect, it } from 'vitest';
import { getBridgedDiagonal, quantizeVirtualStick } from '../src/ui/virtual-stick';

describe('virtual stick fighting inputs', () => {
  it('gives diagonal inputs a forgiving angular range', () => {
    expect(quantizeVirtualStick(40, 100, 10)).toMatchObject({ down: true, right: true });
    expect(quantizeVirtualStick(-40, 100, 10)).toMatchObject({ down: true, left: true });
  });

  it('keeps clear cardinal directions cardinal', () => {
    expect(quantizeVirtualStick(20, 100, 10)).toEqual({ up: false, down: true, left: false, right: false });
    expect(quantizeVirtualStick(100, 20, 10)).toEqual({ up: false, down: false, left: false, right: true });
  });

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