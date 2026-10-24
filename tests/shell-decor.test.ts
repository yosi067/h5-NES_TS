import { describe, expect, it } from 'vitest';
import { pickFreeSlot, rectsOverlap } from '../src/ui/shell-decor';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });

describe('shell decoration placement', () => {
  const bounds = rect(0, 0, 400, 800);
  const candidates = [rect(270, 690, 112, 84), rect(294, 708, 88, 66), rect(314, 723, 68, 51)];

  it('uses the largest slot when nothing is in the way', () => {
    expect(pickFreeSlot(candidates, [rect(20, 500, 150, 150)], bounds)).toEqual(candidates[0]);
  });

  it('falls back to a smaller slot that clears the buttons', () => {
    const cButton = rect(270, 660, 40, 40);
    expect(pickFreeSlot(candidates, [cButton], bounds)).toEqual(candidates[1]);
  });

  it('hides the decoration when every slot touches a control', () => {
    expect(pickFreeSlot(candidates, [rect(250, 680, 150, 120)], bounds)).toBeNull();
  });

  it('keeps a margin around obstacles', () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(13, 0, 10, 10), 4)).toBe(true);
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(13, 0, 10, 10), 2)).toBe(false);
  });
});
