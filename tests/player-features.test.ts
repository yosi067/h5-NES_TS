import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_KEY,
  FeatureSettingsStore,
  normalizeFeatureSettings,
} from '../src/features/settings';
import { formatSaveTime, getSaveTime, recordSaveTime, SAVE_META_KEY } from '../src/features/save-meta';
import { LobbyPrefs, MAX_RECENTS, matchesSearch, normalizeSearchText, rankSearchResults, sortFavoritesFirst } from '../src/features/lobby-prefs';
import { RewindBuffer } from '../src/features/rewind';
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
  it('defaults keep the original pad appearance', () => {
    const store = new FeatureSettingsStore(new MemoryStorage());
    expect(store.get()).toEqual(DEFAULT_FEATURE_SETTINGS);
    expect(store.get()).toEqual({ fastForwardSpeed: 2, padOpacity: 100, padScale: 100 });
  });

  it('ignores removed or invalid fields from older versions', () => {
    const storage = new MemoryStorage();
    storage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify({ rewindEnabled: true, twoPlayerKeyboard: true, padOpacity: 60, fastForwardSpeed: 3 }));
    expect(new FeatureSettingsStore(storage).get()).toEqual({ fastForwardSpeed: 2, padOpacity: 100, padScale: 100 });
    storage.setItem(FEATURE_SETTINGS_KEY, '{oops');
    expect(new FeatureSettingsStore(storage).get()).toEqual(DEFAULT_FEATURE_SETTINGS);
    expect(normalizeFeatureSettings({ padOpacity: 40, padScale: 115, fastForwardSpeed: 4 })).toEqual({
      fastForwardSpeed: 4, padOpacity: 40, padScale: 115,
    });
  });

  it('persists updates and notifies listeners', () => {
    const storage = new MemoryStorage();
    const store = new FeatureSettingsStore(storage);
    const seen: number[] = [];
    store.subscribe((value) => seen.push(value.padScale));
    store.update({ padScale: 115 });
    expect(new FeatureSettingsStore(storage).get().padScale).toBe(115);
    expect(seen).toEqual([115]);
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

  it('puts favourites first without reordering the rest', () => {
    const roms = [{ file: 'a' }, { file: 'b' }, { file: 'c' }, { file: 'd' }];
    expect(sortFavoritesFirst(roms, ['d', 'b']).map((rom) => rom.file)).toEqual(['b', 'd', 'a', 'c']);
    expect(sortFavoritesFirst(roms, []).map((rom) => rom.file)).toEqual(['a', 'b', 'c', 'd']);
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
