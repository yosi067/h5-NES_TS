// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { locateMenuTranslations, type MenuAssets } from '../src/game-profiles/menu-localization';
// Build-time extractor only; runtime matcher has no Node/ROM dependency.
// @ts-expect-error The original build helper is JavaScript without declarations.
import { buildDefaultCT2Menus } from '../tools/ct2-menu-extract.mjs';

type Entry = MenuAssets['entries'][number];
const rich: Entry = {
  id: 'menu.rich.fixture', source: 'がい', translation: '確認',
  encoding: 'ct2-menu-glyph', offset: 0x33c00, recordOffset: 0x33c00,
  dynamicRecord: true, bodyTiles: [6, 2, 0, 0], markTiles: [0x94, 0, 0, 0],
};
const assetsFor = (entries: readonly Entry[], extra: Partial<MenuAssets> = {}): MenuAssets => ({
  entries, layouts: [], font: { chrPhysicalBase: 0 }, ...extra,
});

function frame() {
  const provenance = new Uint16Array(256 * 240), metadata = new Uint32Array(2048 * 4);
  function paint(rows: readonly (readonly number[])[], cell = 0x142, x = 16, y = 24,
    physical: (tile: number, row: number, col: number) => number = tile => tile * 16) {
    rows.forEach((tiles, r) => tiles.forEach((tile, c) => {
      const address = cell + r * 32 + c;
      // Different generations per cell deliberately model independent writes.
      metadata.set([((address + 2) << 8) | tile, physical(tile, r, c) + 1, 0x123457, tile ? 0xffffff + 1 : 0], address * 4);
      for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
        const px = x + c * 8 + dx, py = y + r * 8 + dy;
        if (px >= 0 && px < 256 && py >= 0 && py < 240) provenance[py * 256 + px] = address + 1 | dy << 12;
      }
    }));
  }
  const match = (assets = assetsFor([rich])) => locateMenuTranslations(assets, provenance, metadata);
  return { provenance, metadata, paint, match };
}
const richRows = [rich.markTiles!, rich.bodyTiles!];

describe('exact menu footprints from fetched PPU evidence', () => {
  it('matches the entire rich token, including marks and trailing encoded blanks, without mutating inputs', () => {
    const h = frame(), assets = assetsFor([rich]);
    h.paint(richRows);
    const beforeAssets = JSON.stringify(assets), beforeProvenance = h.provenance.slice(), beforeMetadata = h.metadata.slice();
    const expected = [{ id: rich.id, translation: '確認', x: 16, y: 24, width: 32, height: 16,
      cells: [0x142, 0x143, 0x144, 0x145, 0x162, 0x163, 0x164, 0x165] }];
    expect(h.match(assets)).toEqual(expected);
    expect(h.match(assets)).toEqual(expected);
    expect(JSON.stringify(assets)).toBe(beforeAssets);
    expect(h.provenance).toEqual(beforeProvenance);
    expect(h.metadata).toEqual(beforeMetadata);
    // No retained candidate/generation cache: a later frame is checked anew.
    h.metadata[0x163 * 4] ^= 1;
    expect(h.match(assets)).toEqual([]);
  });

  it.each([0x142, 0x143, 0x162, 0x163, 0x164, 0x165])('rejects a changed body, mark or padding cell %i', cell => {
    const h = frame(); h.paint(richRows);
    h.metadata[cell * 4] = (8 << 8) | 0x34; // Digit/cursor/art instead of source or blank.
    h.metadata[cell * 4 + 1] = 0x341;
    expect(h.match()).toEqual([]);
  });

  it.each([0, 1, 2, 3])('rejects missing or ambiguous metadata word %i on an ink cell', word => {
    const h = frame(); h.paint(richRows);
    for (const bad of [0, 0xffffffff]) {
      h.metadata[0x162 * 4 + word] = bad;
      expect(h.match()).toEqual([]);
    }
  });

  it('allows foreground zero on actual blank tiles, but not ambiguous blanks or generation zero', () => {
    const h = frame(); h.paint(richRows);
    expect(h.metadata[0x144 * 4 + 3]).toBe(0);
    expect(h.match()).toHaveLength(1);
    h.metadata[0x144 * 4 + 3] = 0xffffffff;
    expect(h.match()).toEqual([]);
    h.paint(richRows); h.metadata[0x162 * 4] = 6;
    expect(h.match()).toEqual([]);
  });

  it('requires physical font identity even when every fetched tile number agrees', () => {
    const h = frame(); h.paint(richRows, 0x142, 16, 24, tile => 0x4000 + tile * 16);
    expect(h.match()).toEqual([]);
    expect(h.match(assetsFor([rich], { font: { chrPhysicalBase: 0x4000 } }))).toHaveLength(1);
  });

  it('uses extractor-enumerated font aliases for ordinary labels without guessing a CHR bank', () => {
    const h = frame();
    const assets = assetsFor([rich], { specialMenus: { chrIdentities: [...new Set(richRows.flat())].map(tile => ({
      id: `ct2-original-font:${tile.toString(16).padStart(2, '0')}`, physicalOffsets: [tile * 16, 0xb000 + tile * 16],
    })) } });
    h.paint(richRows, 0x142, 16, 24, tile => (tile === 0x94 ? 0xb000 : 0) + tile * 16);
    expect(h.match(assets)).toHaveLength(1);
    h.metadata[0x142 * 4 + 1] = 0xc941;
    expect(h.match(assets)).toEqual([]);
  });

  it('rejects a palette split inside the rectangle', () => {
    const h = frame(); h.paint(richRows);
    h.metadata[0x163 * 4 + 2]++;
    expect(h.match()).toEqual([]);
  });

  it.each([0, 0xffff, 0x164, 0x2163])('rejects a one-pixel sprite hole, other cell or wrong fine Y (%i)', tag => {
    const h = frame(); h.paint(richRows);
    h.provenance[35 * 256 + 27] = tag;
    expect(h.match()).toEqual([]);
  });

  it.each([[-1, 24], [240, 24], [16, -1], [16, 232]])('rejects clipped footprints at (%i,%i)', (x, y) => {
    const h = frame(); h.paint(richRows, 0x142, x, y);
    expect(h.match()).toEqual([]);
  });

  it('requires spatially contiguous complete rows, not just all metadata cells', () => {
    const h = frame(); h.paint([rich.markTiles!]); h.paint([rich.bodyTiles!], 0x162, 24, 32);
    expect(h.match()).toEqual([]);
  });

  it('does not translate an unfetched/pre-rendered menu using metadata alone', () => {
    const h = frame(); h.paint(richRows); h.provenance.fill(0);
    expect(h.match()).toEqual([]);
  });

  it.each([0x15f, 0x3a2])('rejects nametable row wrapping and attribute-table cells (%i)', cell => {
    const h = frame(); h.paint(richRows, cell);
    expect(h.match()).toEqual([]);
  });

  it('does not erase neighboring values or a cursor, or extend into available blank space', () => {
    const h = frame(); h.paint(richRows);
    h.paint([[0x34, 0], [0x35, 0]], 0x146, 48, 24);
    h.paint([[0x91], [0x92]], 0x141, 8, 24);
    const result = h.match()[0];
    expect(result.width).toBe(32);
    expect(result.cells).not.toContain(0x146);
    expect(result.cells).not.toContain(0x141);
    expect(result.cells).not.toContain(0x166);
  });

  it('rejects malformed dimensions, unknown identities and invalid buffers', () => {
    const h = frame(); h.paint(richRows);
    expect(h.match(assetsFor([{ ...rich, markTiles: [0x94] }]))).toEqual([]);
    expect(h.match(assetsFor([{ ...rich, width: 3 }]))).toEqual([]);
    expect(h.match(assetsFor([{ ...rich, tileRows: [{ tiles: [0x94], chrIdentities: ['unknown'] }] }]))).toEqual([]);
    expect(locateMenuTranslations(assetsFor([rich]), new Uint16Array(10), h.metadata)).toEqual([]);
    expect(locateMenuTranslations(assetsFor([rich]), h.provenance, new Uint32Array(7))).toEqual([]);
    expect(locateMenuTranslations(assetsFor([rich]), h.provenance, new Uint32Array(0))).toEqual([]);
  });
});

describe('canonical menu geometry and layout guards', () => {
  it.each([0, 0x400])('uses pregame BODY targets, physical page %i and actual scrolled screen coordinates', page => {
    const h = frame();
    const entry = { ...rich, id: 'menu.pregame.fixture', target: 0x2263 };
    h.paint(richRows, page + 0x243, 80, 49);
    expect(h.match(assetsFor([entry]))[0]).toMatchObject({ x: 80, y: 49, cells: [page + 0x243, page + 0x244,
      page + 0x245, page + 0x246, page + 0x263, page + 0x264, page + 0x265, page + 0x266] });
    expect(h.match(assetsFor([{ ...entry, target: 0x2264 }]))).toEqual([]);
  });

  it('uses data MARK targets and supports untargeted team/round records', () => {
    const h = frame(); h.paint(richRows);
    expect(h.match(assetsFor([{ ...rich, id: 'menu.data.label', target: 0x2142, targetRow: 'mark' }]))).toHaveLength(1);
    expect(h.match(assetsFor([{ ...rich, id: 'menu.data.team', recordOffset: undefined }]))).toHaveLength(1);
  });

  it('matches variable command positions and all three tileRows, including FE padding', () => {
    const h = frame();
    const entry: Entry = { id: 'menu.command.27', source: 'シュートにそなえる', translation: '防守射門',
      encoding: 'ct2-font-tiles', target: 0x22ab, targetMayBeOffset: true, width: 5, height: 3,
      // Body/mark fields are insufficient for this command: the third row matters.
      bodyTiles: [76, 113, 125, 84, 22], markTiles: [0, 0, 0, 0, 0],
      tileRows: [{ tiles: [0, 0, 0, 0, 0] }, { tiles: [76, 113, 125, 84, 22] }, { tiles: [15, 21, 4, 41, 0] }] };
    h.paint(entry.tileRows!.map(r => r.tiles));
    expect(h.match(assetsFor([entry]))[0]).toMatchObject({ width: 40, height: 24 });
    expect(h.match(assetsFor([{ ...entry, targetMayBeOffset: false }]))).toEqual([]);
    h.metadata[0x186 * 4] = 0;
    expect(h.match(assetsFor([entry]))).toEqual([]);
  });

  const short: Entry = { ...rich, id: 'menu.rich.short', source: 'あ', translation: '甲',
    bodyTiles: [1], markTiles: [0], offset: 100, recordOffset: 100, dynamicRecord: false };
  const friend: Entry = { ...rich, id: 'menu.rich.friend', offset: 200, recordOffset: 200 };
  const layouts: MenuAssets['layouts'] = [{ target: 0x2041, width: 10, placements: [
    { row: 1, column: 1, recordOffset: 100 }, { row: 3, column: 1, recordOffset: 200 },
  ] }];

  it('does not translate arbitrary single kana, even at a known layout position', () => {
    const h = frame(); h.paint([[0], [1]], 0x42, 16, 16);
    expect(h.match(assetsFor([short, friend], { layouts }))).toEqual([]);
    expect(h.match(assetsFor([{ ...short, bodyTiles: [1, 0, 0, 0], markTiles: [0, 0, 0, 0] }]))).toEqual([]);
  });

  it('authorizes short labels only with another nontrivial label in the SAME placed layout/frame', () => {
    const h = frame(); h.paint([[0], [1]], 0x42, 16, 16); h.paint(richRows, 0x82, 16, 32);
    const assets = assetsFor([short, friend], { layouts });
    expect(h.match(assets).map(m => m.id)).toContain(short.id);
    // Same physical target, inconsistent screen position: not a companion.
    h.provenance.fill(0); h.paint([[0], [1]], 0x42, 16, 16); h.paint(richRows, 0x82, 24, 32);
    expect(h.match(assets).map(m => m.id)).not.toContain(short.id);
    h.provenance.fill(0); h.paint([[0], [1]], 0x42, 16, 16); h.paint(richRows, 0x482, 16, 32);
    expect(h.match(assets).map(m => m.id)).not.toContain(short.id);
  });

  it('does not infer columns from dynamic opcode byte lengths', () => {
    const h = frame(); h.paint([[0], [1]], 0x42, 16, 16); h.paint(richRows, 0x82, 16, 32);
    expect(h.match(assetsFor([{ ...short, offset: 102, dynamicRecord: true }, friend], { layouts })).map(m => m.id))
      .not.toContain(short.id);
  });

  it('never translates numeric values or unchanged formation symbols', () => {
    const h = frame(); h.paint([[0, 0], [0x34, 0x35]]);
    const e = { ...rich, source: '12', translation: '十二', bodyTiles: [0x34, 0x35], markTiles: [0, 0] };
    expect(h.match(assetsFor([e]))).toEqual([]);
    expect(h.match(assetsFor([{ ...e, source: 'GK', translation: 'GK' }]))).toEqual([]);
  });

  it.each(['ーーーーー', '-----', '—————', '−−−−−'])('preserves placeholder/data rows %s outside password screens too', source => {
    const h = frame(); h.paint([Array(5).fill(0), Array(5).fill(0x7d)]);
    expect(h.match(assetsFor([{ id: 'menu.command.29', source, translation: '替換',
      bodyTiles: Array(5).fill(0x7d), markTiles: Array(5).fill(0) }]))).toEqual([]);
  });

  const valueLabel: Entry = { ...rich, bodyTiles: [6, 2, 0, 0, 0], markTiles: [0x94, 0, 0, 0, 0] };
  const valueLayouts: MenuAssets['layouts'] = [{ target: 0x2141, width: 10,
    placements: [{ row: 1, column: 1, recordOffset: rich.recordOffset! }] }];
  const valueAssets = assetsFor([valueLabel], { layouts: valueLayouts });
  const valueRows = [[0x94, 0, 0, 0, 0], [6, 2, 0, 0x34, 0x35]];

  it('matches a placed dynamic label beside numbers without masking its numeric suffix or gap', () => {
    const h = frame(); h.paint(valueRows);
    expect(h.match(valueAssets)).toEqual([{ id: rich.id, translation: rich.translation, x: 16, y: 24,
      width: 16, height: 16, fontSize: 8, cells: [0x142, 0x143, 0x162, 0x163] }]);
    const command: Entry = { id: 'menu.command.fixture', source: rich.source, translation: rich.translation,
      tileRows: [{ tiles: [0x94, 0, 0] }, { tiles: [6, 2, 0] }] };
    // A stat label must not be reported as evidence of action-menu navigation.
    expect(h.match({ ...valueAssets, entries: [command, valueLabel] }).map(m => m.id)).toEqual([rich.id]);
  });

  it('never guesses a dynamic label placement from a partial or unrelated record', () => {
    const h = frame(); h.paint(valueRows);
    for (const e of [{ ...valueLabel, dynamicRecord: false }, { ...valueLabel, offset: rich.offset! + 2 }]) {
      expect(h.match({ ...valueAssets, entries: [e] })).toEqual([]);
    }
    expect(h.match(assetsFor([valueLabel]))).toEqual([]);
    expect(h.match({ ...valueAssets, layouts: [{ ...valueLayouts[0], target: 0x2142 }] })).toEqual([]);
  });

  it.each([0x94, 6, 0x7d])('does not trim padding overwritten by a nonnumeric tile %i', tile => {
    const h = frame(); h.paint([[0x94, 0, 0, 0, 0], [6, 2, 0, tile, 0x35]]);
    expect(h.match(valueAssets)).toEqual([]);
  });

  it('requires complete original CHR/palette/visibility evidence for numeric suffixes too', () => {
    const h = frame();
    for (const corrupt of [() => { h.metadata[0x165 * 4 + 1] += 0x4000; },
      () => { h.metadata[0x165 * 4 + 2]++; }, () => { h.metadata[0x145 * 4] |= 1; },
      () => { h.metadata[0x165 * 4] = 0xffffffff; }, () => { h.provenance[32 * 256 + 40] = 0; }]) {
      h.paint(valueRows); corrupt(); expect(h.match(valueAssets)).toEqual([]);
    }
  });

  it('prefers a larger complete token over duplicate or overlapping shorter tokens', () => {
    const h = frame(); h.paint(richRows);
    const small = { ...rich, id: 'small', bodyTiles: [6, 2], markTiles: [0x94, 0] };
    const duplicate = { ...rich, id: 'duplicate' };
    const result = h.match(assetsFor([small, rich, duplicate]));
    expect(result).toHaveLength(1); expect(result[0].width).toBe(32);
    expect(h.match(assetsFor([duplicate, rich, small]))).toEqual(result);
  });

  it('uses placements to disambiguate identical tokens with different readings', () => {
    const h = frame(); h.paint(richRows, 0x82, 16, 32);
    const rival = { ...friend, id: 'rival', offset: 300, recordOffset: 300, translation: '不同' };
    expect(h.match(assetsFor([friend, rival]))).toEqual([]);
    expect(h.match(assetsFor([rival, friend], { layouts }))[0].id).toBe(friend.id);
  });
});

function specialFixture() {
  const identities = new Map<string, { id: string; physicalOffsets: number[] }>();
  function tileRow(target: number, tiles: number[], title = false) {
    return { target, tiles, chrIdentities: tiles.map(tile => {
      const id = `${title ? 'title' : 'font'}:${tile}`;
      identities.set(id, { id, physicalOffsets: title ? [0x1f000 + tile * 16] : [tile * 16, 0xb000 + tile * 16] });
      return id;
    }) };
  }
  const title: Entry[] = [
    { id: 'menu.title.kick-off', source: 'KICK OFF', translation: '開球', encoding: 'ct2-graphic-tiles',
      tileRows: [tileRow(0x220c, [12, 11, 5, 12, 0, 16, 8, 8], true)],
      guard: { chrIdentityRequired: true, companionEntryId: 'menu.title.continue' } },
    { id: 'menu.title.continue', source: 'CONTINUE', translation: '繼續', encoding: 'ct2-graphic-tiles',
      tileRows: [tileRow(0x224c, [5, 16, 15, 20, 11, 15, 21, 7], true)],
      guard: { chrIdentityRequired: true, companionEntryId: 'menu.title.kick-off' } },
  ];
  const tileRows = [];
  for (let y = 0; y < 5; y++) {
    const body = Array<number>(25).fill(0), marks = Array<number>(25).fill(0);
    for (let i = 0; i < 13; i++) body[i * 2] = y * 13 + i + 1;
    if (y === 0) marks[2] = 0x94;
    if (y === 4) body[24] = 0x85;
    tileRows.push(tileRow(0x21c4 + y * 64, marks), tileRow(0x21e4 + y * 64, body));
  }
  const grid: Entry = { id: 'menu.password.alphabet', source: '64 symbols + E', translation: 'DO NOT DRAW',
    translatable: false, tileRows, guard: { chrIdentityRequired: true } };
  const confirm: Entry = { id: 'menu.password.confirm', source: 'E', translation: '確認', width: 1, height: 2,
    tileRows: [tileRow(0x22dc, [0]), tileRow(0x22fc, [0x85])],
    guard: { chrIdentityRequired: true, companionEntryId: grid.id } };
  const all = assetsFor([...title, grid, confirm], { specialMenus: { chrIdentities: [...identities.values()] } });
  return { all, title, grid, confirm };
}

describe('special graphic identities, same-frame guards and password preservation', () => {
  it('requires the original title CHR base $1F000 AND both title labels', () => {
    const h = frame(), { all, title } = specialFixture();
    h.paint(title[0].tileRows!.map(r => r.tiles), 0x20c, 64, 80, t => 0x1f000 + t * 16);
    expect(h.match(all)).toEqual([]);
    h.paint(title[1].tileRows!.map(r => r.tiles), 0x24c, 64, 96, t => 0x1f000 + t * 16);
    expect(h.match(all).map(m => m.id)).toEqual(title.map(e => e.id));
    expect(h.match(all).every(m => m.height === 8 && m.fontSize === 8)).toBe(true);
    h.metadata[0x24c * 4 + 1] = 5 * 16 + 1;
    expect(h.match(all)).toEqual([]);
  });

  it('does not authorize title companions on another physical page or inconsistent screen copy', () => {
    const { all, title } = specialFixture();
    for (const [cell, x, y] of [[0x64c, 64, 96], [0x24c, 64, 104]]) {
      const h = frame();
      h.paint(title[0].tileRows!.map(r => r.tiles), 0x20c, 64, 80, t => 0x1f000 + t * 16);
      h.paint(title[1].tileRows!.map(r => r.tiles), cell, x, y, t => 0x1f000 + t * 16);
      expect(h.match(all)).toEqual([]);
    }
  });

  it('preserves all 64 symbols and gaps; only the E slot becomes an 8px checkmark', () => {
    const h = frame(), { all, grid, confirm } = specialFixture();
    // Explicit original aliases are valid even for blank/dakuten tiles.
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32, t => 0xb000 + t * 16);
    expect(h.match(all)).toEqual([{ id: confirm.id, translation: '✓', fontSize: 8,
      x: 208, y: 96, width: 8, height: 16, cells: [0x2dc, 0x2fc] }]);
    const intrusive: Entry = { id: 'intrusive', source: 'かき', translation: '破壞符號',
      tileRows: grid.tileRows!.slice(0, 2).map(r => ({ ...r, tiles: r.tiles.slice(0, 3), chrIdentities: r.chrIdentities!.slice(0, 3) })) };
    expect(h.match({ ...all, entries: [...all.entries, intrusive] }).map(m => m.id)).toEqual([confirm.id]);
    // A cursor outside the intrusive token disables the alphabet's positive
    // guard but must not authorize that token to replace password symbols.
    h.provenance[80 * 256 + 40] = 0;
    expect(h.match({ ...all, entries: [...all.entries, intrusive] })).toEqual([]);
  });

  it('does not translate a lone E, a partial alphabet, changed gap, or sprite-covered alphabet', () => {
    const { all, grid, confirm } = specialFixture();
    const h = frame(); h.paint(confirm.tileRows!.map(r => r.tiles), 0x2dc, 208, 96);
    expect(h.match(all)).toEqual([]);
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    h.metadata[0x1e4 * 4] = 0;
    expect(h.match(all)).toEqual([]);
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    h.metadata[0x1e5 * 4] = 0x434;
    expect(h.match(all)).toEqual([]);
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    h.provenance[50 * 256 + 30] = 0;
    expect(h.match(all)).toEqual([]);
  });

  it('protects input slots and mark rows, even with entered text and a sprite-covered alphabet', () => {
    const h = frame(), { all, grid } = specialFixture();
    const inputEntry: Entry = { ...rich, id: 'input-text', target: 0x212a, targetRow: 'mark' };
    const input = { tileRows: [], slots: [{ markTarget: 0x212a, target: 0x214a }] };
    const assets: MenuAssets = { ...all, entries: [...all.entries, inputEntry],
      specialMenus: { ...all.specialMenus!, passwordInput: input } };
    h.paint(richRows, 0x12a, 80, 8);
    expect(h.match(assets).map(m => m.id)).toContain(inputEntry.id); // Not a globally reserved address.
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    h.provenance[80 * 256 + 40] = 0;
    expect(h.match(assets)).toEqual([]);
    // Protection is local to the actual physical page, not the same target on all pages.
    h.paint(richRows, 0x52a, 80, 8);
    expect(h.match(assets).map(m => m.id)).toContain(inputEntry.id);
  });

  it('uses extracted empty-field rows as independent negative evidence when alphabet metadata is missing', () => {
    const h = frame(), { all } = specialFixture();
    const rows = [{ target: 0x214a, tiles: [1, 2, 0], chrIdentities: ['font:1', 'font:2', 'font:0'] }];
    const entry: Entry = { id: 'intrusive-input', source: 'あい', translation: '不要',
      tileRows: [{ target: 0x212a, tiles: [0, 0, 0] }, { target: 0x214a, tiles: [1, 2, 0] }] };
    const assets: MenuAssets = { ...all, entries: [...all.entries, entry], specialMenus: { ...all.specialMenus!,
      passwordInput: { tileRows: rows, slots: [{ markTarget: 0x212a, target: 0x214a }] } } };
    h.paint([[0, 0, 0], [1, 2, 0]], 0x12a, 80, 8);
    expect(h.match(assets)).toEqual([]);
    const unverified = { ...assets, specialMenus: { ...assets.specialMenus!, passwordInput: {
      ...assets.specialMenus!.passwordInput!, tileRows: [{ ...rows[0], chrIdentities: ['unknown', 'font:2', 'font:0'] }],
    } } };
    expect(h.match(unverified).map(m => m.id)).toContain(entry.id);
  });

  it('protects entered password text when a sprite removes the alphabet anchor metadata entirely', () => {
    const h = frame(), { all, grid } = specialFixture();
    const inputEntry: Entry = { ...rich, id: 'entered-password', target: 0x212a, targetRow: 'mark' };
    const assets: MenuAssets = { ...all, entries: [...all.entries, inputEntry], specialMenus: { ...all.specialMenus!,
      passwordInput: { tileRows: [], slots: [{ markTarget: 0x212a, target: 0x214a }] } } };
    h.paint(richRows, 0x12a, 80, 8);
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    h.metadata.fill(0, 0x1c6 * 4, 0x1c6 * 4 + 4); // First nonzero mark / match anchor.
    for (let y = 32; y < 40; y++) h.provenance.fill(0, y * 256 + 32, y * 256 + 40);
    expect(h.match(assets)).toEqual([]); // No confirm; no input mask either.
    // Sparse coincidental symbols are not enough to reserve a whole page.
    h.metadata.fill(0, 0x204 * 4, 0x2fc * 4 + 4);
    expect(h.match(assets).map(m => m.id)).toContain(inputEntry.id);
  });

  it('does not substitute a nonenumerated physical alias or silently ignore a missing identity', () => {
    const h = frame(), { all, grid } = specialFixture();
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32, t => 0xc000 + t * 16);
    expect(h.match(all)).toEqual([]);
    h.paint(grid.tileRows!.map(r => r.tiles), 0x1c4, 16, 32);
    expect(h.match({ ...all, specialMenus: { chrIdentities: [] } })).toEqual([]);
  });

  it('resolves companion guard chains without letting a missing root authorize a dependent', () => {
    const h = frame(); h.paint(richRows);
    const a = { ...rich, id: 'a', guard: { companionEntryId: 'b' } };
    const b = { ...rich, id: 'b', guard: { companionEntryId: 'missing' } };
    expect(h.match(assetsFor([a, b]))).toEqual([]);
  });
});

const romPath = fileURLToPath(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
// No copyrighted ROM fixture is bundled. This suite runs against the locally
// available, hash/signature-validated catalog, and is explicitly skipped without it.
describe.skipIf(!existsSync(romPath))('actual canonical CT2 catalog (synthetic PPU frames, NOT game traversal)', () => {
  it.each([
    ['menu.command.00', '盤球'], ['menu.command.01', '傳球'], ['menu.command.02', '射門'],
  ])('keeps %s at the observed action position beside overlapping rich stat aliases', (id, translation) => {
    const catalog: MenuAssets = buildDefaultCT2Menus(), h = frame();
    const entry = (id: string) => catalog.entries.find(e => e.id === id)!;
    const paintEntry = (e: Entry, cell: number, x: number, y: number, value = false) => {
      const rows = (e.tileRows ?? [{ tiles: e.markTiles! }, { tiles: e.bodyTiles! }]).map(r => [...r.tiles]);
      if (value) rows[1].splice(rows[1].length - 2, 2, 0x34, 0x35);
      h.paint(rows, cell, x, y);
    };
    // Geometry observed at frame 15003 in three independent original-ROM
    // boots. These are synthetic fixtures; the runtime test proves real CHR.
    paintEntry(entry('menu.rich.33be6'), 619, 88, 146);
    paintEntry(entry('menu.rich.33c23'), 627, 152, 146, true);
    paintEntry(entry('menu.rich.33c2e'), 691, 152, 162, true);
    paintEntry(entry('menu.rich.33c39'), 755, 152, 178, true);
    paintEntry(entry('menu.rich.33c44'), 819, 152, 194);
    h.paint([Array(5).fill(0), Array(5).fill(0)], 684, 96, 162);
    const action = (r: ReturnType<typeof locateMenuTranslations>[number]) => r.x === 96 && r.y === 162;
    expect(h.match(catalog).filter(action)).toEqual([]); // Idle stats aren't commands.
    paintEntry(entry(id), 684, 96, 162);
    const result = h.match(catalog);
    expect(result.filter(action)).toEqual([expect.objectContaining({ translation, width: 40, height: 16,
      cells: [684, 685, 686, 687, 688, 716, 717, 718, 719, 720] })]);
    expect(result.find(r => r.id === 'menu.rich.33be6')).toMatchObject({ x: 88, y: 146, width: 48, height: 16 });
    for (const [stat, y, width] of [['menu.rich.33c2e', 162, 32], ['menu.rich.33c39', 178, 16],
      ['menu.rich.33c44', 194, 64]] as const) {
      expect(result.find(r => r.id === stat)).toMatchObject({ x: 152, y, width, height: 16 });
    }
    expect(result.filter(r => r.id.startsWith('menu.command.') && r.x === 152)).toEqual([]);
    expect(h.match({ ...catalog, entries: [...catalog.entries].reverse() })).toEqual(result);
    // An alias must not let an incomplete command footprint pass. Stat labels
    // still have independent evidence and must survive this action-only hole.
    h.provenance[162 * 256 + 96] = 0;
    expect(h.match(catalog).filter(action)).toEqual([]);
    expect(h.match(catalog).some(r => r.id === 'menu.rich.33c2e')).toBe(true);
  });

  it('accepts the extractor object directly and matches every replaceable entry family', () => {
    const catalog: MenuAssets = buildDefaultCT2Menus();
    expect(catalog.entries).toHaveLength(221);
    expect(catalog.layouts).toHaveLength(66);
    const counts: Record<string, number> = {};
    for (const entry of catalog.entries) {
      if (entry.translatable === false || entry.source === entry.translation || /^[\d\s:：.,+\-/ー—–−]+$/u.test(entry.source)) continue;
      const h = frame();
      const paintEntry = (e: Entry, cell?: number, x = 16, y = 24) => {
        const rows = e.tileRows ?? [{ tiles: e.markTiles! }, { tiles: e.bodyTiles! }];
        const top = rows[0].target ?? (e.target === undefined ? 0x2142 : e.target - (e.targetRow === 'mark' || e.tileRows ? 0 : 32));
        h.paint(rows.map(r => r.tiles), cell ?? (top & 0x3ff), x, y, (tile, row, col) => {
          const id = rows[row].chrIdentities?.[col];
          return id ? catalog.specialMenus!.chrIdentities.find(i => i.id === id)!.physicalOffsets[0] : tile * 16;
        });
      };
      if (entry.id === 'menu.password.confirm') {
        const grid = catalog.entries.find(e => e.id === 'menu.password.alphabet')!;
        paintEntry(grid);
      } else if (entry.id.startsWith('menu.title.')) {
        paintEntry(catalog.entries.find(e => e.id === 'menu.title.kick-off')!, undefined, 16, 24);
        paintEntry(catalog.entries.find(e => e.id === 'menu.title.continue')!, undefined, 16, 40);
      } else paintEntry(entry);
      const expected = entry.id === 'menu.password.confirm' ? '✓' : entry.translation;
      const width = entry.tileRows?.[0].tiles.length ?? entry.bodyTiles!.length;
      const height = entry.tileRows?.length ?? 2;
      const x = entry.id === 'menu.password.confirm' ? 208 : 16;
      const y = entry.id === 'menu.password.confirm' ? 88 : entry.id === 'menu.title.continue' ? 40 : 24;
      // Duplicate source records may resolve to another ID with the SAME
      // translation AND whole footprint, never just an incidental short token.
      expect(h.match(catalog).some(result => result.translation === expected && result.x === x && result.y === y
        && result.width === width * 8 && result.height === height * 8 && result.cells.length === width * height),
      `${entry.id}: ${entry.source}`).toBe(true);
      const family = entry.id.split('.')[1]; counts[family] = (counts[family] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(['command', 'data', 'password', 'pregame', 'rich', 'title']);
    expect(counts.command).toBe(32); expect(counts.data).toBe(77); expect(counts.pregame).toBe(4);
    expect(counts.title).toBe(2); expect(counts.password).toBe(3);
    expect(counts.rich).toBe(83);
  });
});