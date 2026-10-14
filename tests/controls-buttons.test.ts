import { describe, expect, it } from 'vitest';
import {
  AutoFireClock,
  buildChordZones,
  composeMask,
  createMaskApplier,
  hitTestButtons,
  type HitButton,
} from '../src/ui/controls/buttons';
import { createArcadeProfile, getControllerProfile, selectProfileType } from '../src/ui/controls/profiles';
import { PadBit } from '../src/ui/controls/types';

const button = (id: string, bitmask: number, cx: number, cy = 0, radius = 30, autoFire = false): HitButton => ({
  id, bitmask, cx, cy, radius, autoFire,
});

describe('hitTestButtons', () => {
  const a = button('a', PadBit.A, 0);
  const b = button('b', PadBit.B, 100);

  it('triggers only the touched button', () => {
    expect([...hitTestButtons([{ x: 0, y: 0 }], [a, b], [], 0)]).toEqual(['a']);
  });

  it('supports sliding across buttons', () => {
    expect([...hitTestButtons([{ x: 100, y: 0 }], [a, b], [], 0)]).toEqual(['b']);
  });

  it('presses two buttons with one thumb sitting in the gap', () => {
    const hits = hitTestButtons([{ x: 50, y: 0, rx: 25, ry: 25 }], [a, b], [], 0);
    expect(hits).toEqual(new Set(['a', 'b']));
  });

  it('supports two simultaneous touches', () => {
    const hits = hitTestButtons([{ x: 0, y: 0 }, { x: 100, y: 0 }], [a, b], [], 0);
    expect(hits).toEqual(new Set(['a', 'b']));
  });

  it('uses an invisible chord zone between adjacent buttons', () => {
    const chords = buildChordZones([a, b], [['a', 'b']], 15);
    expect(chords).toEqual([{ cx: 50, cy: 0, radius: 15, ids: ['a', 'b'] }]);
    expect(hitTestButtons([{ x: 50, y: 0 }], [a, b], chords, 0)).toEqual(new Set(['a', 'b']));
  });

  it('skips chord pairs whose buttons do not exist', () => {
    expect(buildChordZones([a], [['a', 'x']], 10)).toEqual([]);
  });
});

describe('composeMask and macros', () => {
  it('ORs macro bitmasks into the frame output', () => {
    const macro = button('abc', PadBit.A | PadBit.B | PadBit.C, 0);
    const composed = composeMask(new Set(['abc']), [macro]);
    expect(composed.steady).toBe(PadBit.A | PadBit.B | PadBit.C);
    expect(composed.turbo).toBe(0);
  });

  it('keeps a bit pressed when a macro and a plain button share it', () => {
    const buttons = [button('a', PadBit.A, 0), button('ab', PadBit.A | PadBit.B, 100)];
    expect(composeMask(new Set(['a']), buttons).steady).toBe(PadBit.A);
    expect(composeMask(new Set(['a', 'ab']), buttons).steady).toBe(PadBit.A | PadBit.B);
  });
});

describe('AutoFireClock', () => {
  it('toggles every 3 frames: on first, then off, then on', () => {
    const clock = new AutoFireClock(50);
    const held = { steady: 0, turbo: PadBit.A };
    expect(clock.apply(held, 1000)).toBe(PadBit.A);
    expect(clock.apply(held, 1049)).toBe(PadBit.A);
    expect(clock.apply(held, 1050)).toBe(0);
    expect(clock.apply(held, 1099)).toBe(0);
    expect(clock.apply(held, 1100)).toBe(PadBit.A);
  });

  it('restarts the phase after release and keeps steady bits untouched', () => {
    const clock = new AutoFireClock(50);
    clock.apply({ steady: PadBit.B, turbo: PadBit.A }, 0);
    expect(clock.apply({ steady: PadBit.B, turbo: PadBit.A }, 60)).toBe(PadBit.B);
    expect(clock.active).toBe(true);
    expect(clock.apply({ steady: PadBit.B, turbo: 0 }, 70)).toBe(PadBit.B);
    expect(clock.active).toBe(false);
    expect(clock.apply({ steady: 0, turbo: PadBit.A }, 80)).toBe(PadBit.A);
  });

  it('never drops a bit that is also held steadily', () => {
    const clock = new AutoFireClock(50);
    expect(clock.apply({ steady: PadBit.A, turbo: PadBit.A }, 0)).toBe(PadBit.A);
    expect(clock.apply({ steady: PadBit.A, turbo: PadBit.A }, 60)).toBe(PadBit.A);
  });
});

describe('createMaskApplier', () => {
  it('emits only changed bits and releases everything', () => {
    const events: string[] = [];
    const apply = createMaskApplier([
      [PadBit.A, (pressed) => events.push(`A:${pressed}`)],
      [PadBit.B, (pressed) => events.push(`B:${pressed}`)],
    ]);
    apply(PadBit.A);
    apply(PadBit.A | PadBit.B);
    apply(PadBit.B);
    apply.release();
    expect(events).toEqual(['A:true', 'B:true', 'A:false', 'B:false']);
  });
});

describe('controller profiles', () => {
  it('maps systems to profile types', () => {
    expect(selectProfileType('nes')).toBe('NES_GB');
    expect(selectProfileType('gb')).toBe('NES_GB');
    expect(selectProfileType('gg')).toBe('NES_GB');
    expect(selectProfileType('snes')).toBe('SNES');
    expect(selectProfileType('genesis')).toBe('SNES');
    expect(selectProfileType('n64')).toBe('N64_PS1');
    expect(selectProfileType('arcade', 'kof97')).toBe('ARCADE_FIGHTING');
    expect(selectProfileType('arcade', 'raiden')).toBe('ARCADE_SHMUP');
    expect(selectProfileType('arcade', 'pacman')).toBe('ARCADE_GENERIC');
  });

  it('configures fighting games with floating stick, wide diagonals and interpolation', () => {
    const profile = createArcadeProfile('ARCADE_FIGHTING', { game: 'kof97', fireButtonCount: 4 });
    expect(profile.dpad).toMatchObject({
      mode: 'FLOATING_JOYSTICK',
      deadzone: 16,
      diagonalAngleWidth: 55,
      enableCardinalToDiagonalInterpolation: true,
    });
    expect(profile.buttons.filter((entry) => entry.isMacro).map((entry) => entry.label)).toEqual(['A+B', 'C+D', 'A+B+C']);
    expect(profile.inputTrail).toBe(true);
  });

  it('omits macros for games without Neo Geo style buttons or enough fire buttons', () => {
    expect(createArcadeProfile('ARCADE_FIGHTING', { game: 'sf2', fireButtonCount: 6 }).buttons.some((entry) => entry.isMacro)).toBe(false);
    expect(createArcadeProfile('ARCADE_FIGHTING', { game: 'kof97', fireButtonCount: 2 }).buttons.some((entry) => entry.isMacro)).toBe(false);
  });

  it('gives shmups a sensitive floating stick and an auto-firing A button', () => {
    const profile = createArcadeProfile('ARCADE_SHMUP', { game: 'raiden', fireButtonCount: 2 });
    expect(profile.dpad).toMatchObject({ mode: 'FLOATING_JOYSTICK', deadzone: 6 });
    expect(profile.buttons.map((entry) => [entry.id, entry.autoFire ?? false])).toEqual([['a', true], ['b', false]]);
  });

  it('provides turbo A/B and an A+B chord for NES/GB', () => {
    const profile = getControllerProfile('NES_GB');
    expect(profile.chordPairs).toEqual([['b', 'a']]);
    expect(profile.buttons.filter((entry) => entry.autoFire).map((entry) => entry.id)).toEqual(['turbo-b', 'turbo-a']);
    expect(profile.dpad.deadzone).toBe(12);
  });

  it('adds Y+B and X+A chords for SNES', () => {
    expect(getControllerProfile('SNES').chordPairs).toEqual([['y', 'b'], ['x', 'a']]);
  });

  it('gives N64 two Z triggers', () => {
    const profile = getControllerProfile('N64_PS1');
    expect(profile.buttons.filter((entry) => entry.bitmask === PadBit.Z).length).toBe(2);
  });
});
