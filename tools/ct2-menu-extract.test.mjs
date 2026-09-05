import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDefaultCT2Menus, originalPrg, menuGlyphTiles, parseMenuRecord, parseTileStream, extractCommandTiles } from './ct2-menu-extract.mjs';

const romUrl = new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url);
const hasRom = fs.existsSync(romUrl);
const romTest = (name, fn) => test(name, { skip: !hasRom && 'Local original ROM required (not bundled)' }, fn);

test('unknown ROM and truncated header fail closed', () => {
  assert.throws(() => originalPrg(Buffer.alloc(4)), /header/);
  const fake = Buffer.alloc(16); fake.set([0x4e, 0x45, 0x53, 0x1a]);
  assert.throws(() => originalPrg(fake), /SHA-256/);
});

test('menu grammar never decodes dynamic parameters as text', () => {
  const table = new Map([[1, 'あ'], [2, 'い']]);
  const record = parseMenuRecord(Buffer.from([1, 0xe1, 2, 0xed, 1, 2, 0xfc]), 0, table, 7);
  assert.deepEqual(record.tokens.map(t => t.kind), ['text', 'dynamic', 'dynamic', 'text']);
  assert.equal(record.tokens.at(-1).source, 'い');
  assert.deepEqual(record.tokens[1].parameters, [2]);
  assert.throws(() => parseMenuRecord(Buffer.from([1]), 0, table, 1), /Unterminated/);
  assert.throws(() => parseMenuRecord(Buffer.from([0xe1]), 0, table, 1), /Truncated/);
  assert.throws(() => parseMenuRecord(Buffer.from([3, 0xfc]), 0, table, 2), /Unknown/);
  assert.throws(() => menuGlyphTiles(0xe0), /Not a menu glyph/);
});

test('literal stream bit 6 means final record; bit 7 means vertical, not RLE', () => {
  const data = Buffer.from([2, 0x63, 0x22, 0x11, 0x12, 0xc2, 0x64, 0x22, 0x21, 0x22]);
  const stream = parseTileStream(data, 0, data.length);
  assert.deepEqual(stream.writes.map(w => [w.target, w.tile]), [[0x2263, 0x11], [0x2264, 0x12], [0x2264, 0x21], [0x2284, 0x22]]);
  assert.deepEqual(stream.bytes, [...data]);
  assert.throws(() => parseTileStream(data.subarray(0, 5), 0, 5), /Unterminated/);
  assert.throws(() => parseTileStream(Buffer.from([0]), 0, 1), /Invalid/);
  assert.throws(() => parseTileStream(Buffer.from([0x42, 0, 0x22, 1]), 0, 4), /Truncated/);
});

/** Tiny bounded 6502 executor for the actual $CBC2 bytes. Independent of the
 * JavaScript conversion formula; unsupported instructions fail the test.
 * It executes ORIGINAL ROM instructions, including PHP/PLP carry restoration.
 */
function executeOriginalGlyph(prg, glyph) {
  let a = glyph, y = 0, carry = 0, pc = 0x3cbc2;
  const stack = [];
  for (let budget = 0; budget < 100; budget++) {
    const opcode = prg[pc++];
    if (opcode === 0xa0) y = prg[pc++]; // LDY immediate
    else if (opcode === 0xc9) carry = a >= prg[pc++] ? 1 : 0; // CMP
    else if (opcode === 0x90 || opcode === 0xb0) {
      const displacement = prg.readInt8(pc++);
      if ((opcode === 0x90 && !carry) || (opcode === 0xb0 && carry)) pc += displacement;
    } else if (opcode === 0xe9) {
      const result = a - prg[pc++] - (1 - carry); carry = result >= 0 ? 1 : 0; a = result & 255;
    } else if (opcode === 0x69) {
      const result = a + prg[pc++] + carry; carry = result > 255 ? 1 : 0; a = result & 255;
    } else if (opcode === 0x38) carry = 1;
    else if (opcode === 0x18) carry = 0;
    else if (opcode === 0x08) stack.push(carry);
    else if (opcode === 0x28) { assert.ok(stack.length); carry = stack.pop(); }
    else if (opcode === 0x60) { assert.equal(stack.length, 0); return [a, y]; }
    else throw new Error(`Unexpected original opcode ${opcode.toString(16)} at ${(pc - 1).toString(16)}`);
  }
  throw new Error('Original glyph routine exceeded instruction budget');
}

romTest('every glyph conversion agrees with executing original $CBC2 machine code', () => {
  const { prg } = originalPrg(fs.readFileSync(romUrl));
  for (let code = 0; code < 0xe0; code++) assert.deepEqual(menuGlyphTiles(code), executeOriginalGlyph(prg, code), `glyph ${code.toString(16)}`);
  assert.deepEqual(menuGlyphTiles(0xba), [0x4c, 0x94]); // ジ
  assert.deepEqual(menuGlyphTiles(0xcd), [0x5a, 0x95]); // パ
});

romTest('66 pointer-backed layouts and 221 entries retain every exact source byte', () => {
  const rom = fs.readFileSync(romUrl), before = Buffer.from(rom);
  const result = buildDefaultCT2Menus();
  assert.deepEqual(rom, before);
  assert.equal(result.layouts.length, 66);
  assert.equal(result.records.length, 175);
  assert.equal(result.entries.length, 221);
  assert.equal(new Set(result.entries.map(e => e.id)).size, 221);
  assert.deepEqual(result.coverage.untranslated, []);
  assert.equal(result.coverage.fullyLocalized, false);
  assert.equal(result.coverage.runtimeDisplayEnabled, false);
  const { prg, prgStart } = originalPrg(rom);
  for (const collection of [result.entries, result.layouts, result.records, result.commandTiles, result.evidence]) {
    for (const item of collection) assert.deepEqual([...prg.subarray(item.offset, item.offset + item.bytes.length)], item.bytes, `source ${item.offset.toString(16)}`);
  }
  for (const entry of result.entries) {
    assert.ok(entry.translation.trim(), entry.id);
    assert.equal(entry.fileOffset, entry.offset + prgStart);
    assert.ok(!entry.source.includes('{'), entry.id);
  }
  for (const layout of result.layouts) {
    assert.equal(0x28000 + prg.readUInt16LE(layout.pointerOffset), layout.offset);
    assert.equal(layout.bytes.length, 9 + 4 * layout.placements.length);
    for (const placement of layout.placements) {
      assert.equal(0x28000 + prg.readUInt16LE(placement.entryOffset + 2), placement.recordOffset);
      assert.ok(result.records.some(r => r.offset === placement.recordOffset));
    }
  }
});

romTest('33 command blocks honor FE padding, dakuten and three-row defense commands', () => {
  const { prg } = originalPrg(fs.readFileSync(romUrl));
  const records = extractCommandTiles(prg);
  assert.equal(records.length, 33);
  assert.deepEqual(records.filter(r => r.height === 3).map(r => r.index), [27, 28]);
  for (const record of records) for (const row of record.rows) {
    assert.equal(row.tiles.length, record.width);
    row.tiles.forEach((tile, i) => assert.equal(tile, row.sourceOffsets[i] === null ? 0 : prg[row.sourceOffsets[i]]));
  }
  const result = buildDefaultCT2Menus();
  assert.equal(result.entries.find(e => e.id === 'menu.command.27').source, 'シュートにそなえる');
  assert.equal(result.entries.find(e => e.id === 'menu.command.28').source, 'ドリブルにそなえる');
  const corrupt = Buffer.from(prg); corrupt[0x3ea1e] = 0;
  assert.throws(() => extractCommandTiles(corrupt), /geometry/);
});

romTest('pregame labels and separate marks are actual writes in the original stream', () => {
  const result = buildDefaultCT2Menus();
  assert.equal(result.pregameStream.offset + result.pregameStream.bytes.length, 0x0dcdd);
  const writes = new Map(result.pregameStream.writes.map(w => [w.target, w]));
  for (const entry of result.entries.filter(e => e.id.startsWith('menu.pregame.'))) {
    entry.bodyTiles.forEach((tile, i) => {
      assert.equal(writes.get(entry.target + i).tile, tile);
      assert.equal(writes.get(entry.target + i).offset, entry.offset + i);
    });
    for (const mark of entry.markSources) assert.deepEqual([writes.get(mark.target).tile, writes.get(mark.target).offset], [mark.tile, mark.offset]);
  }
});