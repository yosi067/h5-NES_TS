import { PadBit, type ButtonConfig, type ConsoleProfileType, type ControllerProfile } from './types';

export type PadSystem = 'nes' | 'gb' | 'gg' | 'sms' | 'genesis' | 'snes' | 'n64' | 'arcade';

/** 街機：Neo Geo 與 CPS 對戰遊戲才啟用浮動搖桿與斜角補償。 */
const ARCADE_FIGHTING_GAMES = new Set([
  'garou', 'kof94', 'kof95', 'kof96', 'kof97', 'kof98', 'kof2000', 'kof2001', 'kof2002', 'kof2003',
  'samsho2', 'samsho4', 'samshoh', 'samsh5sp', 'samsho5', 'rbffspec', 'svc', 'sf2', 'sf2rb2',
]);

const ARCADE_SHMUP_GAMES = new Set([
  'ddonpach', 'ddp2100', 'raiden', '1943', 'area88', 'rtype', 'parodius', 'sonicwi3',
]);

/** 有「A+B+C 集氣」操作的 KOF 系列。 */
const ARCADE_CHARGE_MACRO_GAMES = new Set([
  'kof94', 'kof95', 'kof96', 'kof97', 'kof98', 'kof2000', 'kof2001', 'kof2002', 'kof2003',
]);

const NEO_GEO_MACRO_GAMES = new Set([
  ...ARCADE_CHARGE_MACRO_GAMES, 'garou', 'samsho2', 'samsho4', 'samshoh', 'samsh5sp', 'samsho5', 'rbffspec', 'svc',
]);

export function selectProfileType(system: PadSystem, arcadeGame?: string | null): ConsoleProfileType {
  switch (system) {
    case 'snes':
    case 'genesis':
      return 'SNES';
    case 'n64':
      return 'N64_PS1';
    case 'arcade':
      if (arcadeGame && ARCADE_FIGHTING_GAMES.has(arcadeGame)) return 'ARCADE_FIGHTING';
      if (arcadeGame && ARCADE_SHMUP_GAMES.has(arcadeGame)) return 'ARCADE_SHMUP';
      return 'ARCADE_GENERIC';
    default:
      return 'NES_GB';
  }
}

const btn = (id: string, label: string, bitmask: number, extra: Partial<ButtonConfig> = {}): ButtonConfig => ({
  id,
  label,
  bitmask,
  ...extra,
});

const NES_GB_PROFILE: ControllerProfile = {
  type: 'NES_GB',
  dpad: { mode: 'FIXED_DPAD', deadzone: 12, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false },
  buttons: [
    btn('b', 'B', PadBit.B),
    btn('a', 'A', PadBit.A),
    btn('turbo-b', 'B', PadBit.B, { autoFire: true }),
    btn('turbo-a', 'A', PadBit.A, { autoFire: true }),
  ],
  enableChordOverlap: true,
  chordPairs: [['b', 'a']],
  inputTrail: false,
};

const SNES_PROFILE: ControllerProfile = {
  type: 'SNES',
  dpad: { mode: 'FIXED_DPAD', deadzone: 12, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false },
  buttons: [
    btn('y', 'Y', PadBit.Y),
    btn('x', 'X', PadBit.X),
    btn('b', 'B', PadBit.B),
    btn('a', 'A', PadBit.A),
  ],
  enableChordOverlap: true,
  chordPairs: [['y', 'b'], ['x', 'a']],
  inputTrail: false,
};

const ARCADE_FACE_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const ARCADE_FACE_BITS = [PadBit.A, PadBit.B, PadBit.C, PadBit.D, PadBit.E, PadBit.F];

function arcadeFaceButtons(count: number, autoFireFirst: boolean): ButtonConfig[] {
  return ARCADE_FACE_IDS.slice(0, count).map((id, index) =>
    btn(id, id.toUpperCase(), ARCADE_FACE_BITS[index], index === 0 && autoFireFirst ? { autoFire: true } : {}));
}

export interface ArcadeProfileOptions {
  game?: string | null;
  fireButtonCount?: number | null;
}

export function createArcadeProfile(type: Extract<ConsoleProfileType, 'ARCADE_FIGHTING' | 'ARCADE_SHMUP' | 'ARCADE_GENERIC'>, options: ArcadeProfileOptions = {}): ControllerProfile {
  const count = Math.max(0, Math.min(6, options.fireButtonCount ?? 6));
  if (type === 'ARCADE_FIGHTING') {
    const buttons = arcadeFaceButtons(count, false);
    const macros: ButtonConfig[] = [];
    if (options.game && NEO_GEO_MACRO_GAMES.has(options.game) && count >= 4) {
      macros.push(btn('macro-ab', 'A+B', PadBit.A | PadBit.B, { isMacro: true }));
      macros.push(btn('macro-cd', 'C+D', PadBit.C | PadBit.D, { isMacro: true }));
      if (ARCADE_CHARGE_MACRO_GAMES.has(options.game)) {
        macros.push(btn('macro-abc', 'A+B+C', PadBit.A | PadBit.B | PadBit.C, { isMacro: true }));
      }
    }
    const pairs = pairsWithin(count, [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']]);
    return {
      type,
      dpad: { mode: 'FLOATING_JOYSTICK', deadzone: 16, diagonalAngleWidth: 55, enableCardinalToDiagonalInterpolation: true },
      buttons: [...buttons, ...macros],
      enableChordOverlap: true,
      chordPairs: pairs,
      inputTrail: true,
    };
  }

  if (type === 'ARCADE_SHMUP') {
    return {
      type,
      dpad: { mode: 'FLOATING_JOYSTICK', deadzone: 6, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false },
      buttons: arcadeFaceButtons(Math.min(count, 2) || 2, true),
      enableChordOverlap: false,
      chordPairs: [],
      inputTrail: false,
    };
  }

  return {
    type,
    dpad: { mode: 'FIXED_DPAD', deadzone: 12, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false },
    buttons: arcadeFaceButtons(count, false),
    enableChordOverlap: count >= 2,
    chordPairs: pairsWithin(count, [['a', 'b'], ['b', 'c'], ['d', 'e'], ['e', 'f']]),
    inputTrail: false,
  };
}

function pairsWithin(count: number, pairs: Array<[string, string]>): Array<[string, string]> {
  const visible = new Set<string>(ARCADE_FACE_IDS.slice(0, count));
  return pairs.filter(([first, second]) => visible.has(first) && visible.has(second));
}

const N64_PROFILE: ControllerProfile = {
  type: 'N64_PS1',
  dpad: { mode: 'FIXED_DPAD', deadzone: 10, diagonalAngleWidth: 45, enableCardinalToDiagonalInterpolation: false },
  buttons: [
    btn('b', 'B', PadBit.B),
    btn('a', 'A', PadBit.A),
    btn('c-up', '▲', PadBit.CUp),
    btn('c-down', '▼', PadBit.CDown),
    btn('c-left', '◀', PadBit.CLeft),
    btn('c-right', '▶', PadBit.CRight),
    btn('l', 'L', PadBit.L),
    btn('r', 'R', PadBit.R),
    btn('z', 'Z', PadBit.Z),
    btn('z2', 'Z', PadBit.Z),
    btn('start', 'START', PadBit.Start),
  ],
  enableChordOverlap: false,
  chordPairs: [],
  inputTrail: false,
};

export function getControllerProfile(type: ConsoleProfileType, options: ArcadeProfileOptions = {}): ControllerProfile {
  switch (type) {
    case 'NES_GB': return NES_GB_PROFILE;
    case 'SNES': return SNES_PROFILE;
    case 'N64_PS1': return N64_PROFILE;
    default: return createArcadeProfile(type, options);
  }
}
