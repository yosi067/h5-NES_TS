import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_KEY,
  FeatureSettingsStore,
  normalizeFeatureSettings,
} from '../src/features/settings';
import { formatSaveTime, getSaveTime, recordSaveTime, SAVE_META_KEY } from '../src/features/save-meta';
import { LobbyPrefs, MAX_RECENTS, matchesSearch, normalizeSearchText, rankSearchResults } from '../src/features/lobby-prefs';
import { RewindBuffer } from '../src/features/rewind';
import { compileCheats, decodeNesGameGenie, loadCheats, parseCheatCode, saveCheats } from '../src/features/cheats';
import { PLAYER2_KEYS, resolvePlayer2Action } from '../src/features/player2';
import { DEFAULT_BINDINGS, cloneBindings, type AllBindings } from '../src/ui/input-bindings';
import { base64ToBytes, buildBackup, parseBackup, summarizeBackup } from '../src/features/save-backup';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

describe('feature settings', () => {
  it('defaults keep original behaviour (rewind off, pad untouched)', () => {
    const store = new FeatureSettingsStore(new MemoryStorage());
    expect(store.get()).toEqual(DEFAULT_FEATURE_SETTINGS);
    expect(store.get().rewindEnabled).toBe(false);
    expect(store.get().padOpacity).toBe(100);
    expect(store.get().padScale).toBe(100);
  });

  it('rejects invalid values and survives corrupt storage', () => {
    expect(normalizeFeatureSettings({ fastForwardSpeed: 9, padOpacity: 3, padScale: 500 })).toMatchObject({
      fastForwardSpeed: 2, padOpacity: 100, padScale: 100,
    });
    const storage = new MemoryStorage();
    storage.setItem(FEATURE_SETTINGS_KEY, '{oops');
    expect(new FeatureSettingsStore(storage).get()).toEqual(DEFAULT_FEATURE_SETTINGS);
  });

  it('persists updates and notifies listeners', () => {
    const storage = new MemoryStorage();
    const store = new FeatureSettingsStore(storage);
    const seen: number[] = [];
    store.subscribe((value) => seen.push(value.fastForwardSpeed));
    store.update({ fastForwardSpeed: 3, rewindEnabled: true });
    expect(new FeatureSettingsStore(storage).get()).toMatchObject({ fastForwardSpeed: 3, rewindEnabled: true });
    expect(seen).toEqual([3]);
  });
});

describe('save slot metadata', () => {
  it('records timestamps without touching save keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('emu_savestate_nes_game_0', 'NES-SAVE-1:abc');
    recordSaveTime(storage, 'emu_savestate_nes_game_0', 1000);
    expect(getSaveTime(storage, 'emu_savestate_nes_game_0')).toBe(1000);
    expect(storage.getItem('emu_savestate_nes_game_0')).toBe('NES-SAVE-1:abc');
    expect(storage.getItem(SAVE_META_KEY)).toContain('1000');
  });

  it('formats same-day and older dates', () => {
    const now = new Date(2026, 9, 23, 18, 0).getTime();
    expect(formatSaveTime(new Date(2026, 9, 23, 9, 5).getTime(), now)).toBe('今天 09:05');
    expect(formatSaveTime(new Date(2026, 0, 2, 9, 5).getTime(), now)).toBe('1/2 09:05');
    expect(formatSaveTime(new Date(2025, 0, 2, 9, 5).getTime(), now)).toBe('2025/1/2 09:05');
  });
});

describe('lobby favorites, recents and search', () => {
  it('toggles favourites and keeps recents unique and bounded', () => {
    const prefs = new LobbyPrefs(new MemoryStorage());
    expect(prefs.toggleFavorite('a.nes')).toBe(true);
    expect(prefs.isFavorite('a.nes')).toBe(true);
    expect(prefs.toggleFavorite('a.nes')).toBe(false);
    for (let index = 0; index < MAX_RECENTS + 5; index++) prefs.noteRecent(`g${index}.nes`, index);
    prefs.noteRecent('g3.nes', 999);
    const recents = prefs.recents();
    expect(recents).toHaveLength(MAX_RECENTS);
    expect(recents[0]).toEqual({ file: 'g3.nes', at: 999 });
    expect(new Set(recents.map((entry) => entry.file)).size).toBe(MAX_RECENTS);
  });

  it('matches across spacing, width and case', () => {
    const rom = { file: '洛克人3.zip', displayName: '洛克人 3 威利博士的末期！？', systemLabel: 'FC' };
    expect(normalizeSearchText('ＲＯＣＫ Man')).toBe('rockman');
    expect(matchesSearch(rom, '洛克人3')).toBe(true);
    expect(matchesSearch(rom, '洛克人 威利')).toBe(true);
    expect(matchesSearch(rom, '瑪利歐')).toBe(false);
    expect(matchesSearch(rom, '   ')).toBe(false);
  });

  it('ranks title hits ahead of description hits', () => {
    const roms = [
      { file: 'b.nes', displayName: '冒險島', description: '瑪利歐風格的動作遊戲' },
      { file: 'a.nes', displayName: '超級瑪利歐兄弟' },
    ];
    expect(rankSearchResults(roms, '瑪利歐').map((rom) => rom.file)).toEqual(['a.nes', 'b.nes']);
  });
});

describe('rewind buffer', () => {
  it('captures on the configured interval', () => {
    const buffer = new RewindBuffer<string>({ captureInterval: 3 });
    expect([buffer.tick(), buffer.tick(), buffer.tick(), buffer.tick()]).toEqual([false, false, true, false]);
  });

  it('limits snapshots by memory budget but keeps a minimum', () => {
    const buffer = new RewindBuffer<string>({ captureInterval: 30, maxSeconds: 10, memoryBudget: 1000, minSnapshots: 4 });
    for (let index = 0; index < 50; index++) buffer.push('x'.repeat(400));
    expect(buffer.length).toBe(4);
    const small = new RewindBuffer<string>({ captureInterval: 30, maxSeconds: 10, memoryBudget: 1_000_000 });
    for (let index = 0; index < 50; index++) small.push(String(index).padStart(10, '0'));
    expect(small.length).toBe(20);
  });

  it('pops newest first and stops at the oldest snapshot', () => {
    const buffer = new RewindBuffer<string>({ captureInterval: 1 });
    buffer.push('one');
    buffer.push('two');
    expect(buffer.pop()).toBe('two');
    expect(buffer.pop()).toBe('one');
    expect(buffer.pop()).toBe('one');
    buffer.clear();
    expect(buffer.pop()).toBeNull();
  });
});

describe('cheats', () => {
  it('decodes NES Game Genie codes', () => {
    expect(decodeNesGameGenie('SXIOPO')).toEqual({ kind: 'rom', address: 0x91D9, value: 0xAD, compare: -1 });
    const eight = decodeNesGameGenie('YEUZUGAA');
    expect(eight?.kind).toBe('rom');
    expect(eight && eight.address >= 0x8000).toBe(true);
    expect(eight && 'compare' in eight ? eight.compare : -2).toBeGreaterThanOrEqual(0);
    expect(decodeNesGameGenie('SXIOP')).toBeNull();
  });

  it('parses RAM codes per system and rejects unsafe addresses', () => {
    expect(parseCheatCode('nes', '0075:09')).toEqual({ kind: 'ram', address: 0x75, value: 9 });
    expect(parseCheatCode('nes', '8000:01')).toHaveProperty('error');
    expect(parseCheatCode('snes', '7E0DBE09')).toEqual({ kind: 'ram', address: 0x7E0DBE, value: 9 });
    expect(parseCheatCode('snes', 'C08000FF')).toHaveProperty('error');
    expect(parseCheatCode('gb', '01FF16D0')).toEqual({ kind: 'ram', address: 0xD016, value: 0xFF });
    expect(parseCheatCode('gg', 'C010=63')).toEqual({ kind: 'ram', address: 0xC010, value: 0x63 });
  });

  it('compiles only enabled entries and reports errors', () => {
    const compiled = compileCheats('nes', [
      { code: 'SXIOPO + 0075:09', label: '', enabled: true },
      { code: '0010:01', label: '', enabled: false },
      { code: 'nope', label: '', enabled: true },
    ]);
    expect(compiled.rom).toEqual([0x91D9, 0xAD, -1]);
    expect(compiled.ram).toEqual([0x75, 9]);
    expect(compiled.errors).toHaveLength(1);
  });

  it('stores codes but always reloads them disabled', () => {
    const storage = new MemoryStorage();
    saveCheats(storage, 'game', [{ code: 'SXIOPO', label: '無限命', enabled: true }]);
    expect(loadCheats(storage, 'game')).toEqual([{ code: 'SXIOPO', label: '無限命', enabled: false }]);
    saveCheats(storage, 'game', []);
    expect(loadCheats(storage, 'game')).toEqual([]);
  });
});

describe('player 2 keyboard', () => {
  const bindings = (): AllBindings => cloneBindings(DEFAULT_BINDINGS as AllBindings);

  it('never overlaps the shipped 1P defaults', () => {
    const defaults = bindings();
    for (const layout of ['nes', 'snes', 'arcade'] as const) {
      const used = new Set(Object.values(defaults[layout]).flatMap((binding) => binding.keys));
      for (const code of Object.keys(PLAYER2_KEYS[layout])) expect(used.has(code)).toBe(false);
    }
  });

  it('lets custom 1P bindings win over 2P keys', () => {
    const custom = bindings();
    expect(resolvePlayer2Action('nes', custom.nes, 'KeyP')).toBe('a');
    custom.nes.a.keys = ['KeyP'];
    expect(resolvePlayer2Action('nes', custom.nes, 'KeyP')).toBeNull();
    expect(resolvePlayer2Action('n64', custom.n64, 'KeyI')).toBeNull();
  });
});

describe('save backup', () => {
  it('round-trips save data byte for byte and skips unrelated keys', () => {
    const backup = buildBackup({
      localEntries: [
        ['emu_savestate_nes_game_0', 'NES-SAVE-1:abc'],
        ['emu_sram_game.nes', 'deadbeef'],
        ['h5emu.stage-settings.v1', '{}'],
      ],
      binaryEntries: [['emu_savestate_snes9x_game_1', new Uint8Array([0, 1, 2, 255])]],
      n64Entries: [['/mupen64plus/saves/Mario.eep', new Uint8Array([9, 8])], ['/mupen64plus/data/x', new Uint8Array([1])]],
      now: new Date('2026-10-23T00:00:00Z'),
    });
    expect(summarizeBackup(backup)).toEqual({ localCount: 2, binaryCount: 1, n64Count: 1 });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.localStorage['emu_savestate_nes_game_0']).toBe('NES-SAVE-1:abc');
    expect(Array.from(base64ToBytes(parsed.binaryStates['emu_savestate_snes9x_game_1']))).toEqual([0, 1, 2, 255]);
  });

  it('rejects foreign or tampered files', () => {
    expect(() => parseBackup('not json')).toThrow();
    expect(() => parseBackup(JSON.stringify({ format: 'other' }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ format: 'h5emu-save-backup', version: 99 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({
      format: 'h5emu-save-backup', version: 1, localStorage: { 'h5emu.bindings': '{}' }, binaryStates: {}, n64Saves: {},
    }))).toThrow();
  });
});
