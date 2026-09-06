import { expect, it } from 'vitest';
import { TextObservationState, locateBattleTranslations, type TextRuntime } from '../src/game-profiles/localization';

const word = { id: 'name', scene: 'name', line: 'name', domain: 'battle' as const, offset: 0x3f509, bytes: [1, 2, 3] };
const runtime: TextRuntime = { version: 1, sourceSha256: '', sourceHashes: [], scenes: [], runs: [word],
  lowerTiles: [], fontAliases: Array.from({ length: 256 }, (_, i) => [i * 16]) };
const entries = new Map([['name', { id: 'name', category: 'dictionary', source: 'つばさ', translation: '翼' }]]);
function fixture(nameId = 'name') {
  const namedWord = { ...word, id: nameId };
  const catalog = new Map([[nameId, { ...entries.get('name')!, id: nameId }]]);
  const state = new TextObservationState({ ...runtime, runs: [namedWord] }), metadata = new Uint32Array(8192), provenance = new Uint16Array(61440);
  function put(origin: number, x: number, y: number, bytes = word.bytes, sources = bytes.map((_, i) => word.offset + i)) {
    bytes.forEach((b, index) => {
      const cell = origin + index;
      state.consume([3, sources[index], cell, b, 4, 7, cell, 7]);
      for (let half = 0; half < 2; half++) {
        const tile = half ? b : 0, c = cell + half * 32;
        metadata.set([7 * 256 + tile, tile * 16 + 1, 1, half ? 0x1000000 : 0], c * 4);
      }
      for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 8; dx++) {
        provenance[(y + dy) * 256 + x + index * 8 + dx] = (cell + (dy >= 8 ? 32 : 0) + 1) | (dy % 8 << 12);
      }
    });
  }
  return { state, metadata, provenance, put, rows: () => locateBattleTranslations(state, catalog, provenance, metadata) };
}
it('keeps repeated dictionary occurrences independent, including two names on one row', () => {
  const h = fixture(); h.put(64, 0, 16); h.put(67, 24, 16); h.put(128, 0, 32);
  expect(h.rows().map(r => r.text)).toEqual(['翼翼', '翼']);
});
it('unknown dynamic/RAM names cannot inherit old source ownership or kind-4 evidence', () => {
  const h = fixture(); h.put(64, 0, 16);
  expect(h.rows()).toHaveLength(1);
  h.state.consume([3, 0x05eb, 64, 1, 4, 8, 64, 8]);
  expect(h.state.glyphs.has(64)).toBe(false); expect(h.rows()).toEqual([]);
});
it('numeric/unknown gaps are never swallowed by a composed name', () => {
  const h = fixture(); h.put(64, 0, 16); h.put(68, 32, 16);
  expect(h.rows().map(r => [r.text, r.width])).toEqual([['翼', 24], ['翼', 24]]);
});
it('reset and malformed events remove existing overlays, soft clears wait for PPU', () => {
  const h = fixture(); h.put(64, 0, 16); h.state.consume([5, 0, 0, 0]);
  expect(h.rows()).toHaveLength(1);
  h.state.consume([0, 0, 0, 0]); expect(h.rows()).toEqual([]);
  h.put(64, 0, 16); h.state.consume([3]); expect(h.rows()).toEqual([]);
});

it('joins a complete player name with the two noncontiguous original honorific operands', () => {
  const h = fixture('fixed-bank-words.001'); h.put(64, 0, 16);
  h.put(67, 24, 16, [0x08, 0x2e], [0x30662, 0x30667]);
  expect(h.rows().map(r => [r.text, r.width, r.glyphs.length])).toEqual([['翼', 40, 5]]);
});
it('never masks orphan, non-player, gapped or incomplete honorifics', () => {
  for (const id of ['fixed-bank-words.001', 'fixed-bank-words.118']) {
    const h = fixture(id);
    h.put(67, 24, 16, [0x08, 0x2e], [0x30662, 0x30667]);
    expect(h.rows()).toEqual([]);
    if (id.endsWith('118')) {
      h.put(64, 0, 16);
      expect(h.rows().map(r => r.width)).toEqual([24]);
    }
  }
  const gap = fixture('fixed-bank-words.001'); gap.put(64, 0, 16);
  gap.put(68, 32, 16, [0x08, 0x2e], [0x30662, 0x30667]);
  expect(gap.rows().map(r => r.width)).toEqual([24]);
  const partial = fixture('fixed-bank-words.001'); partial.put(64, 0, 16);
  partial.put(67, 24, 16, [0x08], [0x30662]);
  expect(partial.rows().map(r => r.width)).toEqual([24]);
});
it('honorifics retain byte, CHR and generation guards and cannot authorize RAM names', () => {
  for (const failure of ['byte', 'chr', 'generation', 'ram']) {
    const h = fixture('fixed-bank-words.001'); h.put(64, 0, 16);
    h.put(67, 24, 16, [0x08, 0x2e], [0x30662, 0x30667]);
    if (failure === 'byte') h.state.consume([3, 0x30667, 68, 0x01, 4, 7, 68, 7]);
    if (failure === 'chr') h.metadata[68 * 4 + 1] = 9999;
    if (failure === 'generation') h.metadata[68 * 4] = 8 * 256;
    if (failure === 'ram') h.state.consume([3, 0x05eb, 64, 1, 4, 7, 64, 7]);
    expect(h.rows().map(r => r.width)).toEqual(failure === 'ram' ? [] : [24]);
  }
});