import { describe, expect, it } from 'vitest';
import { chooseHudPlacement, computeStageFit, parseAspectRatio } from '../src/ui/stage-fit';

const base = { areaWidth: 1366, areaHeight: 720, chromeX: 0, chromeY: 0, margin: 0, aspect: 4 / 3, nativeHeight: 240, integerScale: false };

describe('computeStageFit', () => {
  it('is height-limited on wide windows and keeps the aspect ratio', () => {
    expect(computeStageFit(base)).toEqual({ width: 960, height: 720, integer: false });
  });

  it('is width-limited on tall windows', () => {
    const fit = computeStageFit({ ...base, areaWidth: 600, areaHeight: 900 });
    expect(fit).toEqual({ width: 600, height: 450, integer: false });
  });

  it('never exceeds the area once chrome and margin are subtracted', () => {
    const fit = computeStageFit({ ...base, chromeX: 80, chromeY: 120, margin: 20 });
    expect(fit.height).toBeLessThanOrEqual(720 - 120 - 40);
    expect(fit.width + 80 + 40).toBeLessThanOrEqual(1366);
  });

  it('snaps to whole multiples of the native height only when it fits', () => {
    expect(computeStageFit({ ...base, integerScale: true })).toEqual({ width: 960, height: 720, integer: true });
    expect(computeStageFit({ ...base, areaHeight: 700, integerScale: true })).toEqual({ width: 640, height: 480, integer: true });
    expect(computeStageFit({ ...base, areaHeight: 200, integerScale: true }).integer).toBe(false);
  });

  it('handles rotated arcade aspect ratios', () => {
    const fit = computeStageFit({ ...base, aspect: 3 / 4 });
    expect(fit.height).toBe(720);
    expect(fit.width).toBe(540);
  });

  it('survives degenerate sizes', () => {
    const fit = computeStageFit({ ...base, areaWidth: 10, areaHeight: 10, chromeX: 100, chromeY: 100 });
    expect(fit.width).toBeGreaterThanOrEqual(1);
    expect(fit.height).toBeGreaterThanOrEqual(0);
  });
});

describe('chooseHudPlacement', () => {
  it('uses a side letterbox bar when one is wide enough', () => {
    expect(chooseHudPlacement({ left: 203, right: 203, top: 0, bottom: 0 })).toBe('right-bar');
  });

  it('uses a top or bottom bar next', () => {
    expect(chooseHudPlacement({ left: 0, right: 0, top: 80, bottom: 80 })).toBe('top-bar');
  });

  it('overlays only when there is no black bar', () => {
    expect(chooseHudPlacement({ left: 10, right: 10, top: 5, bottom: 5 })).toBe('overlay');
  });
});

describe('parseAspectRatio', () => {
  it('parses ratios', () => {
    expect(parseAspectRatio('4 / 3')).toBeCloseTo(1.3333, 3);
    expect(parseAspectRatio('384 / 224')).toBeCloseTo(1.7143, 3);
    expect(parseAspectRatio('1.5')).toBe(1.5);
    expect(parseAspectRatio('auto')).toBeNull();
    expect(parseAspectRatio('')).toBeNull();
  });
});
