import { describe, expect, it } from 'vitest';
import { mergeArcadeInputSources, updateArcadeInputMask } from '../src/main';

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

  it.each([
    ['up', 1 << 0],
    ['down', 1 << 1],
    ['left', 1 << 2],
    ['right', 1 << 3],
  ])('presses and releases the digital %s direction without clearing A', (_direction, directionBit) => {
    const buttonA = 1 << 4;
    const pressed = updateArcadeInputMask(buttonA, directionBit, true);
    expect(pressed).toBe(buttonA | directionBit);
    expect(updateArcadeInputMask(pressed, directionBit, false)).toBe(buttonA);
  });
});