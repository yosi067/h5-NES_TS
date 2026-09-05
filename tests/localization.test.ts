import { describe, it, expect } from 'vitest';
import { TextObservationState, mergeLocalizationDraft, locateTextCells, cellRectangleVisible, type LocalizationCatalog, type TextRuntime } from '../src/game-profiles/localization';

const base: LocalizationCatalog = { format: 'nes-localization', version: 1, gameId: 'test', sourceSha256: 'a'.repeat(64), locale: 'zh-Hant', entries: [
  { id: 'one', source: 'あ', translation: '啊', category: 'dialogue' },
  { id: 'two', source: 'い', translation: '伊', category: 'dialogue' },
], values: [] };
const runtime: TextRuntime = { version: 1, sourceSha256: base.sourceSha256, sourceHashes: [], scenes: [], lowerTiles: [], runs: [
  { id: 'one', scene: 'intro', line: 'line1', offset: 0x6040, bytes: [1, 2] },
] };

describe('source verified localization', () => {
  it('imports translation without mutating canonical source', () => {
    const draft = structuredClone(base); draft.entries[0].translation = '您好';
    expect(mergeLocalizationDraft(base, draft).entries[0].translation).toBe('您好');
    expect(base.entries[0].translation).toBe('啊');
  });
  it('rejects wrong ROM, missing IDs, duplicates, stale source, stats and invalid text atomically', () => {
    for (const mutate of [
      (d: LocalizationCatalog) => { d.sourceSha256 = 'b'.repeat(64); },
      (d: LocalizationCatalog) => { d.entries.pop(); },
      (d: LocalizationCatalog) => { d.entries[1] = d.entries[0]; },
      (d: LocalizationCatalog) => { d.entries[0].source = 'changed'; },
      (d: LocalizationCatalog) => { d.entries[0].translation = 'x'.repeat(16385); },
    ]) {
      const draft = structuredClone(base); mutate(draft);
      expect(() => mergeLocalizationDraft(base, draft)).toThrow();
    }
  });
  it('requires exact source bytes and clears on scene clear/reset', () => {
    const state = new TextObservationState(runtime);
    state.consume([1, 0x6040, 0x249, 1]); expect(state.glyphs.size).toBe(1);
    state.consume([2, 0x6070, 0, 0xeb]); expect(state.glyphs.size).toBe(1);
    state.consume([0, 0, 0, 0]); expect(state.glyphs.size).toBe(0);
    state.consume([1, 0x6040, 0x249, 7]); expect(state.glyphs.size).toBe(0);
    state.consume([1, 0x9999, 0x249, 1]); expect(state.glyphs.size).toBe(0);
    state.consume([1, 0x6040, 0x249, 1, 0, 0, 0, 0]); expect(state.glyphs.size).toBe(0);
  });
  it('projects fetched tile provenance and refuses sprite-overlapped or split rectangles', () => {
    const p = new Uint16Array(61440); const cell = 0x249;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) p[(y + 40) * 256 + x + 72] = cell + (y >= 8 ? 32 : 0) + 1 | (y % 8 << 12);
    expect(locateTextCells(p, new Set([cell])).get(cell)).toEqual({ x: 72, y: 40 });
    expect(cellRectangleVisible(p, cell, 72, 40)).toBe(true);
    p[43 * 256 + 74] = 0;
    expect(cellRectangleVisible(p, cell, 72, 40)).toBe(false);
  });
});