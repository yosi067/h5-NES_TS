import { describe, expect, it } from 'vitest';
import { mergeArcadeInputSources } from '../src/main';

describe('arcade input sources', () => {
  it('keeps touch buttons pressed when an idle gamepad is present', () => {
    const touchButtonA = 1 << 4;
    expect(mergeArcadeInputSources(touchButtonA, 0)).toBe(touchButtonA);
  });

  it('combines simultaneous touch and gamepad inputs', () => {
    const touchButtonA = 1 << 4;
    const gamepadRight = 1 << 3;
    expect(mergeArcadeInputSources(touchButtonA, gamepadRight)).toBe(touchButtonA | gamepadRight);
  });
});