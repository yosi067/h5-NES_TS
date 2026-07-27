import { describe, expect, it } from 'vitest';
import { getTouchContactTargetIds, TouchContactTarget } from '../src/ui/touch-contact';

describe('thumb contact hit detection', () => {
  it('detects two adjacent face buttons under one thumb', () => {
    const targets: TouchContactTarget[] = [
      { id: 'b', rect: { left: 0, top: 0, width: 50, height: 50 } },
      { id: 'a', rect: { left: 58, top: 0, width: 50, height: 50 } },
    ];

    expect([...getTouchContactTargetIds({ clientX: 54, clientY: 25 }, targets)]).toEqual(['b', 'a']);
  });

  it('detects X, B and A together in the SNES diamond', () => {
    const targets: TouchContactTarget[] = [
      { id: 'x', rect: { left: 59, top: 0, width: 50, height: 50 } },
      { id: 'b', rect: { left: 59, top: 106, width: 50, height: 50 } },
      { id: 'a', rect: { left: 112, top: 53, width: 50, height: 50 } },
      { id: 'y', rect: { left: 6, top: 53, width: 50, height: 50 } },
    ];

    expect([...getTouchContactTargetIds({ clientX: 102, clientY: 78 }, targets)]).toEqual(['x', 'b', 'a']);
  });

  it('does not activate buttons outside the thumb contact area', () => {
    const targets: TouchContactTarget[] = [
      { id: 'a', rect: { left: 100, top: 100, width: 50, height: 50 } },
    ];

    expect(getTouchContactTargetIds({ clientX: 0, clientY: 0 }, targets).size).toBe(0);
  });
});