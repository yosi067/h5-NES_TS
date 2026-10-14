export type BindingLayout = 'nes' | 'snes' | 'arcade' | 'n64';

export interface ActionDef {
  id: string;
  label: string;
}

export type PadInput =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; dir: -1 | 1 };

export interface ActionBinding {
  /** KeyboardEvent.code，最多兩個（主要與替代）。 */
  keys: string[];
  /** 外接手把／街機基板輸入；方向預設同時含十字鍵與左搖桿。重新綁定時整組取代。 */
  pad: PadInput[];
}

export type LayoutBindings = Record<string, ActionBinding>;
export type AllBindings = Record<BindingLayout, LayoutBindings>;

export const MAX_KEYS_PER_ACTION = 2;

export const LAYOUT_TITLES: Record<BindingLayout, string> = {
  nes: 'NES / GB / GG / SMS',
  snes: 'SFC / Mega Drive',
  arcade: 'Arcade',
  n64: 'Nintendo 64',
};

const dirs = (prefix = ''): ActionDef[] => [
  { id: `${prefix}up`, label: '上' },
  { id: `${prefix}down`, label: '下' },
  { id: `${prefix}left`, label: '左' },
  { id: `${prefix}right`, label: '右' },
];

export const LAYOUT_ACTIONS: Record<BindingLayout, ActionDef[]> = {
  nes: [...dirs(), { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'select', label: 'Select' }, { id: 'start', label: 'Start' }],
  snes: [
    ...dirs(),
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'x', label: 'X' }, { id: 'y', label: 'Y' },
    { id: 'l', label: 'L' }, { id: 'r', label: 'R' }, { id: 'select', label: 'Select / Mode' }, { id: 'start', label: 'Start' },
  ],
  arcade: [
    ...dirs(),
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' },
    { id: 'd', label: 'D' }, { id: 'e', label: 'E' }, { id: 'f', label: 'F' },
    { id: 'coin', label: '投幣' }, { id: 'start', label: '1P Start' },
  ],
  n64: [
    ...dirs('analog-').map((entry) => ({ ...entry, label: `搖桿${entry.label}` })),
    ...dirs('dpad-').map((entry) => ({ ...entry, label: `十字${entry.label}` })),
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
    { id: 'c-up', label: 'C 上' }, { id: 'c-down', label: 'C 下' }, { id: 'c-left', label: 'C 左' }, { id: 'c-right', label: 'C 右' },
    { id: 'z', label: 'Z' }, { id: 'l', label: 'L' }, { id: 'r', label: 'R' }, { id: 'start', label: 'Start' },
  ],
};

const button = (index: number): PadInput => ({ kind: 'button', index });
const axis = (index: number, dir: -1 | 1): PadInput => ({ kind: 'axis', index, dir });
const bind = (keys: string[], pad: PadInput[] = []): ActionBinding => ({ keys, pad });

const DPAD_PAD = {
  up: bind([], [button(12), axis(1, -1)]),
  down: bind([], [button(13), axis(1, 1)]),
  left: bind([], [button(14), axis(0, -1)]),
  right: bind([], [button(15), axis(0, 1)]),
};

function createDefaults(): AllBindings {
  return {
    nes: {
      up: bind(['ArrowUp'], DPAD_PAD.up.pad), down: bind(['ArrowDown'], DPAD_PAD.down.pad),
      left: bind(['ArrowLeft'], DPAD_PAD.left.pad), right: bind(['ArrowRight'], DPAD_PAD.right.pad),
      a: bind(['KeyZ'], [button(1)]), b: bind(['KeyX'], [button(0)]),
      select: bind(['ShiftRight'], [button(8)]), start: bind(['Enter'], [button(9)]),
    },
    snes: {
      up: bind(['ArrowUp'], DPAD_PAD.up.pad), down: bind(['ArrowDown'], DPAD_PAD.down.pad),
      left: bind(['ArrowLeft'], DPAD_PAD.left.pad), right: bind(['ArrowRight'], DPAD_PAD.right.pad),
      a: bind(['KeyZ'], [button(1)]), b: bind(['KeyX'], [button(0)]),
      x: bind(['KeyS'], [button(3)]), y: bind(['KeyA'], [button(2)]),
      l: bind(['KeyQ'], [button(4)]), r: bind(['KeyW'], [button(5)]),
      select: bind(['ShiftRight'], [button(8)]), start: bind(['Enter'], [button(9)]),
    },
    arcade: {
      up: bind(['ArrowUp'], DPAD_PAD.up.pad), down: bind(['ArrowDown'], DPAD_PAD.down.pad),
      left: bind(['ArrowLeft'], DPAD_PAD.left.pad), right: bind(['ArrowRight'], DPAD_PAD.right.pad),
      a: bind(['KeyZ'], [button(0)]), b: bind(['KeyX'], [button(1)]), c: bind(['KeyA'], [button(2)]),
      d: bind(['KeyS'], [button(3)]), e: bind(['KeyQ'], [button(4)]), f: bind(['KeyW'], [button(5)]),
      coin: bind(['Digit5', 'Numpad5'], [button(8)]), start: bind(['Digit1', 'Enter'], [button(9)]),
    },
    n64: {
      'analog-up': bind(['ArrowUp'], [axis(1, -1)]), 'analog-down': bind(['ArrowDown'], [axis(1, 1)]),
      'analog-left': bind(['ArrowLeft'], [axis(0, -1)]), 'analog-right': bind(['ArrowRight'], [axis(0, 1)]),
      'dpad-up': bind(['KeyW'], DPAD_PAD.up.pad), 'dpad-down': bind(['KeyS'], DPAD_PAD.down.pad),
      'dpad-left': bind(['KeyA'], DPAD_PAD.left.pad), 'dpad-right': bind(['KeyD'], DPAD_PAD.right.pad),
      a: bind(['ShiftLeft'], [button(0)]), b: bind(['ControlLeft'], [button(2)]),
      'c-up': bind(['KeyI'], [axis(3, -1)]), 'c-down': bind(['KeyK'], [axis(3, 1)]),
      'c-left': bind(['KeyJ'], [axis(2, -1)]), 'c-right': bind(['KeyL'], [axis(2, 1)]),
      z: bind(['KeyZ'], [button(6)]), l: bind(['KeyX'], [button(4)]), r: bind(['KeyC'], [button(5)]),
      start: bind(['Enter'], [button(9)]),
    },
  };
}

export const DEFAULT_BINDINGS: Readonly<AllBindings> = createDefaults();

/** 保留給舞台功能的按鍵，不能指派給遊戲。 */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Escape', 'KeyM', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function cloneBindings(bindings: AllBindings): AllBindings {
  return JSON.parse(JSON.stringify(bindings)) as AllBindings;
}

function isPadInput(value: unknown): value is PadInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'button') return Number.isInteger(candidate.index) && (candidate.index as number) >= 0 && (candidate.index as number) < 64;
  if (candidate.kind === 'axis') {
    return Number.isInteger(candidate.index) && (candidate.index as number) >= 0 && (candidate.index as number) < 16
      && (candidate.dir === -1 || candidate.dir === 1);
  }
  return false;
}

/** 把存檔資料套到預設值上；未知動作、格式錯誤與保留鍵一律忽略。 */
export function mergeBindings(saved: unknown): AllBindings {
  const result = cloneBindings(DEFAULT_BINDINGS as AllBindings);
  if (!saved || typeof saved !== 'object') return result;
  const layouts = (saved as { layouts?: unknown }).layouts;
  if (!layouts || typeof layouts !== 'object') return result;

  for (const layout of Object.keys(result) as BindingLayout[]) {
    const savedLayout = (layouts as Record<string, unknown>)[layout];
    if (!savedLayout || typeof savedLayout !== 'object') continue;
    for (const action of Object.keys(result[layout])) {
      const entry = (savedLayout as Record<string, unknown>)[action];
      if (!entry || typeof entry !== 'object') continue;
      const { keys, pad } = entry as { keys?: unknown; pad?: unknown };
      const next: ActionBinding = { keys: result[layout][action].keys, pad: result[layout][action].pad };
      if (Array.isArray(keys)) {
        next.keys = Array.from(new Set(keys.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length < 32 && !RESERVED_KEYS.has(key)))).slice(0, MAX_KEYS_PER_ACTION);
      }
      if (Array.isArray(pad)) next.pad = pad.filter(isPadInput).slice(0, 2);
      result[layout][action] = next;
    }
  }
  return result;
}

export function serializeBindings(bindings: AllBindings): string {
  return JSON.stringify({ version: 1, layouts: bindings });
}

export function isDefaultLayout(layout: BindingLayout, bindings: AllBindings): boolean {
  return JSON.stringify(bindings[layout]) === JSON.stringify(DEFAULT_BINDINGS[layout]);
}

export function resolveKeyAction(layout: LayoutBindings, code: string): string | null {
  for (const [action, binding] of Object.entries(layout)) {
    if (binding.keys.includes(code)) return action;
  }
  return null;
}

const samePad = (a: PadInput, b: PadInput): boolean =>
  a.kind === b.kind && a.index === b.index && (a.kind !== 'axis' || (b.kind === 'axis' && a.dir === b.dir));

export type AssignResult =
  | { ok: true; stolenFrom: string[] }
  | { ok: false; reason: 'reserved' | 'unknown-action' };

/** 指派按鍵（slot 0/1）；若其他動作已使用同一輸入，會從該動作移除。 */
export function assignKey(layout: LayoutBindings, action: string, slot: number, code: string): AssignResult {
  if (!layout[action]) return { ok: false, reason: 'unknown-action' };
  if (RESERVED_KEYS.has(code)) return { ok: false, reason: 'reserved' };
  const stolenFrom: string[] = [];
  for (const [other, binding] of Object.entries(layout)) {
    if (other === action) continue;
    if (binding.keys.includes(code)) {
      binding.keys = binding.keys.filter((key) => key !== code);
      stolenFrom.push(other);
    }
  }
  const keys = layout[action].keys.filter((key) => key !== code);
  keys[Math.min(slot, MAX_KEYS_PER_ACTION - 1)] = code;
  layout[action].keys = keys.filter((key): key is string => Boolean(key)).slice(0, MAX_KEYS_PER_ACTION);
  return { ok: true, stolenFrom };
}

export function assignPad(layout: LayoutBindings, action: string, input: PadInput): AssignResult {
  if (!layout[action]) return { ok: false, reason: 'unknown-action' };
  const stolenFrom: string[] = [];
  for (const [other, binding] of Object.entries(layout)) {
    if (other !== action && binding.pad.some((existing) => samePad(existing, input))) {
      binding.pad = binding.pad.filter((existing) => !samePad(existing, input));
      stolenFrom.push(other);
    }
  }
  layout[action].pad = [input];
  return { ok: true, stolenFrom };
}

export function clearKey(layout: LayoutBindings, action: string, slot: number): void {
  const binding = layout[action];
  if (binding) binding.keys = binding.keys.filter((_, index) => index !== slot);
}

export function clearPad(layout: LayoutBindings, action: string): void {
  const binding = layout[action];
  if (binding) binding.pad = [];
}

export interface GamepadSnapshot {
  buttons: ReadonlyArray<{ pressed: boolean }>;
  axes: ReadonlyArray<number>;
}

export const AXIS_THRESHOLD = 0.45;

export function isPadInputActive(pad: GamepadSnapshot, input: PadInput, threshold = AXIS_THRESHOLD): boolean {
  if (input.kind === 'button') return pad.buttons[input.index]?.pressed ?? false;
  const value = pad.axes[input.index] ?? 0;
  return input.dir < 0 ? value < -threshold : value > threshold;
}

/** 目前被按住的動作集合。 */
export function readPadActions(layout: LayoutBindings, pad: GamepadSnapshot): Set<string> {
  const active = new Set<string>();
  for (const [action, binding] of Object.entries(layout)) {
    if (binding.pad.some((input) => isPadInputActive(pad, input))) active.add(action);
  }
  return active;
}

/** 第一個正在被觸發的手把輸入，用於「按下要綁定的按鈕」。 */
export function detectPadInput(pad: GamepadSnapshot, ignore?: PadInput[]): PadInput | null {
  for (let index = 0; index < pad.buttons.length; index++) {
    const candidate: PadInput = { kind: 'button', index };
    if (pad.buttons[index].pressed && !ignore?.some((entry) => samePad(entry, candidate))) return candidate;
  }
  for (let index = 0; index < pad.axes.length; index++) {
    const value = pad.axes[index];
    if (Math.abs(value) < 0.7) continue;
    const candidate: PadInput = { kind: 'axis', index, dir: value < 0 ? -1 : 1 };
    if (!ignore?.some((entry) => samePad(entry, candidate))) return candidate;
  }
  return null;
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  AltLeft: 'L Alt', AltRight: 'R Alt', Space: 'Space', Enter: 'Enter', Backspace: 'Backspace',
  NumpadEnter: 'Num Enter', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

export function describeKey(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function describePad(inputs: PadInput[]): string {
  if (inputs.length === 0) return '—';
  return inputs.map(describePadInput).join(' / ');
}

function describePadInput(input: PadInput): string {
  if (input.kind === 'button') return `按鈕 ${input.index}`;
  const name = input.index === 0 ? 'X' : input.index === 1 ? 'Y' : `軸${input.index}`;
  return `${name}${input.dir < 0 ? '−' : '+'}`;
}

const STORAGE_KEY = 'h5emu.input-bindings.v1';

export class BindingStore {
  private bindings: AllBindings;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
    this.bindings = this.load();
  }

  get all(): AllBindings {
    return this.bindings;
  }

  layout(layout: BindingLayout): LayoutBindings {
    return this.bindings[layout];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 變更後呼叫，寫入儲存並通知訂閱者。 */
  commit(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, serializeBindings(this.bindings));
    } catch {
      // 無痕模式或空間不足時，本次工作階段仍可使用新設定。
    }
    for (const listener of this.listeners) listener();
  }

  reset(layout?: BindingLayout): void {
    if (layout) {
      this.bindings[layout] = cloneBindings(DEFAULT_BINDINGS as AllBindings)[layout];
    } else {
      this.bindings = cloneBindings(DEFAULT_BINDINGS as AllBindings);
    }
    this.commit();
  }

  private load(): AllBindings {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return mergeBindings(raw ? JSON.parse(raw) : null);
    } catch {
      return cloneBindings(DEFAULT_BINDINGS as AllBindings);
    }
  }
}
