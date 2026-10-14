import { describe, expect, it, vi } from 'vitest';
import { classifyDirection, DirectionTracker } from '../src/ui/controls/direction';
import type { DirectionState, DPadConfig } from '../src/ui/controls/types';

const names = (state: DirectionState) => [
  state.up && 'up',
  state.down && 'down',
  state.left && 'left',
  state.right && 'right',
].filter(Boolean).join('+') || 'neutral';

const at = (angleDeg: number, width: number, deadzone = 10) => {
  const rad = (angleDeg * Math.PI) / 180;
  return names(classifyDirection(Math.cos(rad) * 100, Math.sin(rad) * 100, deadzone, width));
};

describe('classifyDirection', () => {
  it('returns neutral inside the deadzone', () => {
    expect(names(classifyDirection(5, 5, 12))).toBe('neutral');
  });

  it('uses eight 45 degree sectors by default', () => {
    expect(at(0, 45)).toBe('right');
    expect(at(40, 45)).toBe('down+right');
    expect(at(90, 45)).toBe('down');
    expect(at(135, 45)).toBe('down+left');
    expect(at(180, 45)).toBe('left');
    expect(at(225, 45)).toBe('up+left');
    expect(at(270, 45)).toBe('up');
    expect(at(315, 45)).toBe('up+right');
  });

  it('widens diagonals to 55 degrees and narrows cardinals to 35 for fighting games', () => {
    // 45 度標準下 20° 已屬斜角；55 度下正方向半寬為 17.5°。
    expect(at(17, 55)).toBe('right');
    expect(at(18, 55)).toBe('down+right');
    expect(at(72, 55)).toBe('down+right');
    expect(at(73, 55)).toBe('down');
  });

  it('is rotationally consistent across all quadrants at 55 degrees', () => {
    expect(at(197, 55)).toBe('left');
    expect(at(198, 55)).toBe('up+left');
    expect(at(343, 55)).toBe('right');
    expect(at(342, 55)).toBe('up+right');
  });
});

describe('DirectionTracker', () => {
  const fixed: DPadConfig = { mode: 'FIXED_DPAD', deadzone: 12, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false };

  const create = (config: DPadConfig, schedule?: (cb: () => void) => number) => {
    const states: string[] = [];
    const origins: Array<{ x: number; y: number } | null> = [];
    const tracker = new DirectionTracker({
      config,
      floatingRadius: 40,
      getFixedCenter: () => ({ x: 100, y: 100, radius: 60 }),
      getZoneRect: () => ({ left: 0, top: 0, right: 400, bottom: 300 }),
      onState: (state) => states.push(names(state)),
      onOrigin: (origin) => origins.push(origin),
      schedule,
      cancel: () => undefined,
    });
    return { tracker, states, origins };
  };

  it('measures from the fixed center in FIXED_DPAD mode', () => {
    const { tracker, states } = create(fixed);
    tracker.begin(1, 160, 100);
    tracker.move(1, 100, 160);
    tracker.end(1);
    expect(states).toEqual(['right', 'down', 'neutral']);
  });

  it('uses the first touch point as a temporary origin in FLOATING_JOYSTICK mode', () => {
    const { tracker, states, origins } = create({ ...fixed, mode: 'FLOATING_JOYSTICK' });
    tracker.begin(1, 250, 150);
    expect(states).toEqual([]);
    tracker.move(1, 300, 150);
    tracker.end(1);
    expect(states).toEqual(['right', 'neutral']);
    expect(origins[0]).toEqual({ x: 250, y: 150 });
    expect(origins[origins.length - 1]).toBeNull();
  });

  it('keeps the floating origin inside the zone', () => {
    const { tracker, origins } = create({ ...fixed, mode: 'FLOATING_JOYSTICK' });
    tracker.begin(1, 2, 2);
    expect(origins[0]).toEqual({ x: 40, y: 40 });
  });

  it('ignores a second pointer while one is tracked', () => {
    const { tracker } = create(fixed);
    expect(tracker.begin(1, 160, 100)).toBe(true);
    expect(tracker.begin(2, 40, 100)).toBe(false);
  });

  it('bridges a cardinal-to-cardinal jump with a diagonal and defers the target one frame', () => {
    const queue: Array<() => void> = [];
    const { tracker, states } = create(
      { ...fixed, enableCardinalToDiagonalInterpolation: true },
      (cb) => queue.push(cb),
    );
    tracker.begin(1, 100, 160); // down
    tracker.move(1, 160, 100); // jump to right
    expect(states).toEqual(['down', 'down+right']);
    queue.shift()?.();
    expect(states).toEqual(['down', 'down+right', 'right']);
  });

  it('does not bridge when interpolation is disabled', () => {
    const { tracker, states } = create(fixed);
    tracker.begin(1, 100, 160);
    tracker.move(1, 160, 100);
    expect(states).toEqual(['down', 'right']);
  });

  it('drops the pending target when the pointer moves again before the next frame', () => {
    const queue = vi.fn();
    const { tracker, states } = create(
      { ...fixed, enableCardinalToDiagonalInterpolation: true },
      () => { queue(); return 1; },
    );
    tracker.begin(1, 100, 160);
    tracker.move(1, 160, 100);
    tracker.move(1, 100, 40); // up
    expect(states).toEqual(['down', 'down+right', 'up']);
  });
});
