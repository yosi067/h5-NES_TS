import { describe, expect, it } from 'vitest';
import {
  BindingStore,
  DEFAULT_BINDINGS,
  assignKey,
  assignPad,
  cloneBindings,
  detectPadInput,
  isDefaultLayout,
  mergeBindings,
  readPadActions,
  resolveKeyAction,
  serializeBindings,
  type AllBindings,
} from '../src/ui/input-bindings';

const fresh = (): AllBindings => cloneBindings(DEFAULT_BINDINGS as AllBindings);

describe('default bindings', () => {
  it('keeps the shipped keyboard layouts', () => {
    expect(resolveKeyAction(DEFAULT_BINDINGS.nes, 'KeyZ')).toBe('a');
    expect(resolveKeyAction(DEFAULT_BINDINGS.nes, 'KeyX')).toBe('b');
    expect(resolveKeyAction(DEFAULT_BINDINGS.snes, 'KeyA')).toBe('y');
    expect(resolveKeyAction(DEFAULT_BINDINGS.arcade, 'Numpad5')).toBe('coin');
    expect(resolveKeyAction(DEFAULT_BINDINGS.arcade, 'Enter')).toBe('start');
    expect(resolveKeyAction(DEFAULT_BINDINGS.n64, 'ShiftLeft')).toBe('a');
    expect(resolveKeyAction(DEFAULT_BINDINGS.n64, 'KeyW')).toBe('dpad-up');
  });
});

describe('assignKey', () => {
  it('moves a key from the action that owned it', () => {
    const bindings = fresh();
    const result = assignKey(bindings.nes, 'a', 0, 'KeyX');
    expect(result).toEqual({ ok: true, stolenFrom: ['b'] });
    expect(bindings.nes.a.keys).toEqual(['KeyX']);
    expect(bindings.nes.b.keys).toEqual([]);
  });

  it('keeps an alternate key in the second slot', () => {
    const bindings = fresh();
    assignKey(bindings.nes, 'a', 1, 'KeyC');
    expect(bindings.nes.a.keys).toEqual(['KeyZ', 'KeyC']);
  });

  it('rejects reserved stage keys', () => {
    const bindings = fresh();
    expect(assignKey(bindings.nes, 'a', 0, 'KeyM')).toEqual({ ok: false, reason: 'reserved' });
    expect(assignKey(bindings.nes, 'a', 0, 'F5')).toEqual({ ok: false, reason: 'reserved' });
    expect(bindings.nes.a.keys).toEqual(['KeyZ']);
  });

  it('rejects unknown actions', () => {
    expect(assignKey(fresh().nes, 'turbo', 0, 'KeyQ')).toEqual({ ok: false, reason: 'unknown-action' });
  });
});

describe('gamepad bindings', () => {
  const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0]) => ({
    buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index) })),
    axes,
  });

  it('reads buttons and stick directions through the bindings', () => {
    const active = readPadActions(DEFAULT_BINDINGS.arcade, pad([0, 9], [-0.8, 0]));
    expect([...active].sort()).toEqual(['a', 'left', 'start']);
  });

  it('honours a custom pad assignment and steals duplicates', () => {
    const bindings = fresh();
    expect(assignPad(bindings.arcade, 'f', { kind: 'button', index: 0 })).toEqual({ ok: true, stolenFrom: ['a'] });
    expect([...readPadActions(bindings.arcade, pad([0]))]).toEqual(['f']);
  });

  it('detects the first pressed input while ignoring held ones', () => {
    expect(detectPadInput(pad([3]))).toEqual({ kind: 'button', index: 3 });
    expect(detectPadInput(pad([], [0, 0, 0.9, 0]))).toEqual({ kind: 'axis', index: 2, dir: 1 });
    expect(detectPadInput(pad([3]), [{ kind: 'button', index: 3 }])).toBeNull();
    expect(detectPadInput(pad([], [0.3, 0]))).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips through serialize and merge', () => {
    const bindings = fresh();
    assignKey(bindings.snes, 'l', 0, 'KeyE');
    const merged = mergeBindings(JSON.parse(serializeBindings(bindings)));
    expect(merged.snes.l.keys).toEqual(['KeyE']);
    expect(isDefaultLayout('nes', merged)).toBe(true);
    expect(isDefaultLayout('snes', merged)).toBe(false);
  });

  it('ignores malformed, unknown and reserved saved data', () => {
    const merged = mergeBindings({
      layouts: {
        nes: {
          a: { keys: ['KeyM', 42, 'KeyV'], pad: [{ kind: 'button', index: -1 }, { kind: 'axis', index: 1, dir: 0 }] },
          bogus: { keys: ['KeyQ'] },
        },
        unknown: {},
      },
    });
    expect(merged.nes.a.keys).toEqual(['KeyV']);
    expect(merged.nes.a.pad).toEqual([]);
    expect(Object.keys(merged.nes)).not.toContain('bogus');
    expect(mergeBindings('nope')).toEqual(fresh());
  });

  it('stores and reloads through BindingStore', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
    const store = new BindingStore(storage);
    let notified = 0;
    store.subscribe(() => notified++);
    assignKey(store.layout('nes'), 'select', 0, 'KeyR');
    store.commit();
    expect(notified).toBe(1);
    expect(new BindingStore(storage).layout('nes').select.keys).toEqual(['KeyR']);
    store.reset('nes');
    expect(new BindingStore(storage).layout('nes').select.keys).toEqual(['ShiftRight']);
  });

  it('survives a throwing storage', () => {
    const storage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => undefined,
    };
    const store = new BindingStore(storage);
    expect(() => store.commit()).not.toThrow();
    expect(store.layout('nes').a.keys).toEqual(['KeyZ']);
  });
});
