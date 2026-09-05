import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildDefaultCT2Menus, originalPrg } from './ct2-menu-extract.mjs';
import { extractSpecialMenuDefinitions, extractTitleScene } from './ct2-menu-special.mjs';
import { extractDataMenuDefinitions } from './ct2-menu-data.mjs';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';
const root = new URL('../', import.meta.url);
const romUrl = new URL('roms/Captain Tsubasa II - Super Striker (Japan).nes', root);
const romTest = (name, fn) => test(name, { skip: !fs.existsSync(romUrl) && 'Local original ROM required (not bundled)' }, fn);
const load = () => {
  const { prg, chr } = originalPrg(fs.readFileSync(romUrl));
  const table = new Map(['text.tbl', 'localization-extra.tbl'].flatMap(name => [...parseTable(fs.readFileSync(new URL(`game-profiles/captain-tsubasa-2-jp/${name}`, root), 'utf8'))]));
  const translations = JSON.parse(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/translations/title-password.zh-Hant.json', root), 'utf8'));
  return { prg, chr, table, translations };
};

/** Bounded ORIGINAL 6502 execution, independent of the extraction formulas.
 * Only external queue capacity/flush, mapper switch and attribute writer are
 * intercepted. All glyph conversions, metatile pointer arithmetic and grid
 * geometry execute actual ROM opcodes. Unknown instructions fail, never NOP.
 * This is a source-level test harness, not a frontend/emulator modification.
 */
function executeOriginal(prg, pc, initial = {}, stopPc = -1) {
  const mem = new Uint8Array(0x8000), stack = [], returns = [], writes = [];
  for (const [address, value] of Object.entries(initial.memory ?? {})) mem[Number(address)] = value;
  let a = initial.a ?? 0, x = 0, y = 0, carry = 0, zero = false, negative = false, bank = 1, queue;
  const nz = value => { value &= 255; zero = value === 0; negative = !!(value & 128); return value; };
  const read = address => address < 0x8000 ? mem[address] : address < 0xa000 ? prg[address - 0x8000] : prg[bank * 0x2000 + address - 0xa000];
  const next = () => read(pc++);
  const word = () => next() | next() << 8;
  const compare = (left, right) => { carry = left >= right ? 1 : 0; nz(left - right); };
  for (let budget = 0; budget < 30000; budget++) {
    if (pc === stopPc) return writes;
    const at = pc, op = next();
    if (op === 0xa9) a = nz(next());
    else if (op === 0xa5) a = nz(read(next()));
    else if (op === 0xb1) { const zp = next(); a = nz(read(((mem[zp] | mem[(zp + 1) & 255] << 8) + y) & 0xffff)); }
    else if (op === 0xb9) a = nz(read(word() + y));
    else if (op === 0xa2) x = nz(next());
    else if (op === 0xa6) x = nz(read(next()));
    else if (op === 0xa0) y = nz(next());
    else if (op === 0xa4) y = nz(read(next()));
    else if (op === 0x85) mem[next()] = a;
    else if (op === 0x84) mem[next()] = y;
    else if (op === 0x86) mem[next()] = x;
    else if (op === 0x9d) mem[word() + x] = a;
    else if (op === 0xaa) x = nz(a);
    else if (op === 0xa8) y = nz(a);
    else if (op === 0x8a) a = nz(x);
    else if (op === 0x98) a = nz(y);
    else if (op === 0xe8) x = nz(x + 1);
    else if (op === 0xc8) y = nz(y + 1);
    else if (op === 0xe6) { const zp = next(); mem[zp] = nz(mem[zp] + 1); }
    else if (op === 0xc6) { const zp = next(); mem[zp] = nz(mem[zp] - 1); }
    else if (op === 0x29) a = nz(a & next());
    else if (op === 0x0a) { carry = a >> 7; a = nz(a << 1); }
    else if (op === 0x26) { const zp = next(), v = mem[zp] * 2 + carry; carry = v >> 8; mem[zp] = nz(v); }
    else if (op === 0x18) carry = 0;
    else if (op === 0x38) carry = 1;
    else if (op === 0x69 || op === 0x65) { const operand = next(), v = a + (op === 0x65 ? read(operand) : operand) + carry; carry = v > 255 ? 1 : 0; a = nz(v); }
    else if (op === 0xc9) compare(a, next());
    else if (op === 0xc0) compare(y, next());
    else if (op === 0x48) stack.push(a);
    else if (op === 0x68) { assert.ok(stack.length); a = nz(stack.pop()); }
    else if ([0xd0, 0xf0, 0x90, 0xb0, 0x10, 0x30].includes(op)) {
      const raw = next(), displacement = raw < 128 ? raw : raw - 256;
      if ((op === 0xd0 && !zero) || (op === 0xf0 && zero) || (op === 0x90 && !carry) || (op === 0xb0 && carry) || (op === 0x10 && !negative) || (op === 0x30 && negative)) pc += displacement;
    } else if (op === 0x4c) pc = word();
    else if (op === 0x20) {
      const target = word();
      if (target === 0xc4b9) bank = x;
      else if (target === 0x8fd1) { /* attribute-only writes excluded */ }
      else if (target === 0x9b28) { queue = { target: x * 256 + y, count: a & 63, stride: a & 128 ? 32 : 1 }; x = 0; }
      else if (target === 0x9b5e) {
        assert.ok(queue);
        for (let i = 0; i < queue.count; i++) writes.push({ target: queue.target + i * queue.stride, tile: mem[0x5e8 + i] });
        queue = undefined;
      } else { returns.push(pc); pc = target; }
    } else if (op === 0x60) {
      if (!returns.length) { assert.equal(stack.length, 0); return writes; }
      pc = returns.pop();
    } else throw new Error(`Unsupported ORIGINAL opcode ${op.toString(16)} at ${at.toString(16)}`);
  }
  throw new Error('Original source execution exceeded instruction budget');
}

test('title extraction rejects an untrusted synthetic scene', () => {
  assert.throws(() => extractTitleScene(Buffer.alloc(0x40000)), /pointer/);
});

romTest('title rows equal original 6502 metatile expansion and exact physical graphic CHR', () => {
  const { prg, chr } = load(), result = buildDefaultCT2Menus();
  const scene = result.specialMenus.titleScene;
  assert.equal(scene.offset, 0xe373);
  assert.equal(scene.writes.length, 768);
  const actual = new Map();
  // Execute each original metatile writer with the verified title scene inputs.
  for (let my = 0; my < 6; my++) for (let mx = 0; mx < 8; mx++) {
    const target = 0x2080 + my * 128 + mx * 4;
    for (const write of executeOriginal(prg, 0x8ef0, { a: prg[0xe379 + my * 8 + mx],
      memory: { 0x5b: 1, 0x5c: target & 255, 0x5d: target >> 8 } })) actual.set(write.target, write.tile);
  }
  for (const write of scene.writes) assert.equal(actual.get(write.target), write.tile);
  const titles = result.entries.filter(e => e.id.startsWith('menu.title.'));
  assert.deepEqual(titles.map(e => [e.target, e.tileRows[0].tiles]), [
    [0x220c, [12, 11, 5, 12, 0, 16, 8, 8]], [0x224c, [5, 16, 15, 20, 11, 15, 21, 7]],
  ]);
  for (const entry of titles) {
    const row = entry.tileRows[0];
    row.tiles.forEach((tile, i) => {
      assert.equal(tile, actual.get(row.target + i));
      assert.equal(tile, prg[row.sourceOffsets[i]]);
      const identity = result.specialMenus.chrIdentities.find(id => id.id === row.chrIdentities[i]);
      assert.deepEqual(identity.physicalOffsets, [0x1f000 + tile * 16]);
      assert.deepEqual(identity.bytes, [...chr.subarray(0x1f000 + tile * 16, 0x1f010 + tile * 16)]);
    });
    assert.ok(entry.guard.companionEntryId);
  }
  assert.notDeepEqual([...chr.subarray(0xc0, 0xd0)], [...chr.subarray(0x1f0c0, 0x1f0d0)], 'title K is NOT Japanese font tile 0C');
});

romTest('password grid and both prompts equal actual original glyph/grid machine code', () => {
  const { prg } = load(), result = buildDefaultCT2Menus();
  const grid = result.entries.find(e => e.id === 'menu.password.alphabet');
  const actual = new Map(executeOriginal(prg, 0xa13b, {}, 0xa17d).map(w => [w.target, w.tile]));
  assert.equal(actual.size, 130);
  assert.equal(grid.bytes.length, 65);
  assert.equal(grid.characterCount, 64);
  assert.equal(grid.translatable, false);
  assert.equal(grid.translation, grid.source);
  assert.deepEqual(grid.tileRows.map(row => row.target), [0x21c4, 0x21e4, 0x2204, 0x2224, 0x2244, 0x2264, 0x2284, 0x22a4, 0x22c4, 0x22e4]);
  for (const row of grid.tileRows) row.tiles.forEach((tile, i) => {
    if (row.sourceOffsets[i] === null) { assert.equal(tile, 0); assert.equal(actual.has(row.target + i), false); }
    else assert.equal(tile, actual.get(row.target + i));
  });
  for (const id of ['menu.password.prompt', 'menu.password.error']) {
    const entry = result.entries.find(e => e.id === id);
    const writes = new Map();
    // Execute real $9D58 -> $88CA separately with each original source glyph.
    entry.bytes.forEach((byte, i) => {
      const target = entry.target + i;
      const actualGlyph = executeOriginal(prg, 0x9d58, { memory: {
        0xe6: (entry.offset + i + 0x8000) & 255, 0xe7: (entry.offset + i + 0x8000) >> 8,
        0xe8: target & 255, 0xe9: target >> 8, 0xeb: 255,
      } }, 0x9d69);
      for (const write of actualGlyph) writes.set(write.target, write.tile);
    });
    for (const row of entry.tileRows) row.tiles.forEach((tile, i) => assert.equal(tile, writes.get(row.target + i)));
    assert.equal(prg.readUInt16LE(entry.groupOffset), entry.target);
    assert.equal(prg[entry.terminatorOffset], 255);
  }
  const confirm = result.entries.find(e => e.id === 'menu.password.confirm');
  assert.equal(confirm.source, 'E');
  assert.equal(confirm.target, 0x22dc);
  assert.equal(confirm.tileRows[1].target, 0x22fc);
  assert.equal(actual.get(0x22fc), 0x85);
  assert.equal(prg[confirm.actionTableOffset], 255);
  assert.equal(confirm.guard.companionEntryId, grid.id);
});

romTest('every row has complete original CHR identities and every alias is byte-exact', () => {
  const { chr } = load(), result = buildDefaultCT2Menus();
  const identities = new Map(result.specialMenus.chrIdentities.map(id => [id.id, id]));
  for (const identity of identities.values()) {
    assert.equal(identity.bytes.length, 16);
    assert.equal(identity.sha256, crypto.createHash('sha256').update(Buffer.from(identity.bytes)).digest('hex'));
    assert.ok(identity.physicalOffsets.includes(identity.chrPhysicalOffset));
    for (const offset of identity.physicalOffsets) assert.deepEqual([...chr.subarray(offset, offset + 16)], identity.bytes);
  }
  assert.ok(identities.get('ct2-original-font:94').physicalOffsets.includes(0xb940));
  assert.ok(!identities.get('ct2-original-font:0c').physicalOffsets.includes(0x1f0c0));
  for (const entry of result.entries.filter(e => /^menu\.(title|password)\./.test(e.id))) {
    assert.equal(entry.tileRows.length, entry.height);
    for (const row of entry.tileRows) {
      assert.equal(row.tiles.length, entry.width);
      assert.equal(row.sourceOffsets.length, entry.width);
      assert.equal(row.chrIdentities.length, entry.width);
      row.chrIdentities.forEach(id => assert.ok(identities.has(id)));
    }
  }
});

romTest('source/signature/translation mutations fail closed and original PRG/CHR stay untouched', () => {
  const { prg, chr, table, translations } = load(), beforePrg = Buffer.from(prg), beforeChr = Buffer.from(chr);
  for (const offset of [0xe02e, 0xe373, 0xe3a9, 0x2157, 0x3295, 0x11255]) {
    const corrupt = Buffer.from(prg); corrupt[offset] ^= 1;
    assert.throws(() => extractSpecialMenuDefinitions(corrupt, chr, table, translations), /mismatch/, `offset ${offset.toString(16)}`);
  }
  const wrong = structuredClone(translations); wrong['password.prompt'].source = 'wrong';
  assert.throws(() => extractSpecialMenuDefinitions(prg, chr, table, wrong), /source mismatch/);
  delete wrong['title.continue'];
  assert.throws(() => extractSpecialMenuDefinitions(prg, chr, table, wrong), /label mismatch/);
  extractSpecialMenuDefinitions(prg, chr, table, translations);
  assert.deepEqual(prg, beforePrg); assert.deepEqual(chr, beforeChr);
});

romTest('77 existing data labels retain all three groups and the real goalkeeper pointer', () => {
  const { prg, table } = load();
  const translations = JSON.parse(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/translations/data-menus.zh-Hant.json', root), 'utf8'));
  const data = extractDataMenuDefinitions(prg, table, translations);
  assert.equal(data.entries.length, 77);
  assert.deepEqual(data.groups.map(g => g.offset), [0x3f15, 0x3f4e, 0x3fbb]);
  assert.equal(prg.readUInt16LE(0x38b2) - 0x8000, 0x3fbb);
  assert.equal(prg[0x3fba], 255);
  assert.deepEqual(data.groups.map(g => g.entries.length), [7, 16, 9]);
  assert.equal(data.pointers.filter(p => p.domain === 'team-name').length, 37);
  assert.equal(data.pointers.filter(p => p.domain === 'match-round').length, 8);
  for (const entry of data.entries) assert.deepEqual([...prg.subarray(entry.offset, entry.offset + entry.bytes.length)], entry.bytes);
});

romTest('18 empty password slots match literal stream writes and original input-position table', () => {
  const { prg } = load(), result = buildDefaultCT2Menus();
  const input = result.specialMenus.passwordInput;
  assert.equal(input.offset, 0x32c3);
  assert.equal(input.offset + input.bytes.length, 0x32ed);
  assert.equal(input.translatable, false);
  assert.equal(input.slots.length, 18);
  assert.equal(new Set(input.slots.map(s => s.target)).size, 18);
  assert.deepEqual(input.tileRows.map(r => [r.target, r.tiles]), [
    [0x212a, [125, 125, 125, 125, 125, 0, 125, 125, 125, 125, 125]],
    [0x216a, [125, 125, 125, 125, 125, 0, 125, 125, 125]],
  ]);
  for (const slot of input.slots) {
    assert.equal(slot.markTarget, 0x2100 + prg[slot.positionOffset]);
    assert.equal(slot.target, slot.markTarget + 32);
    assert.equal(prg[slot.placeholderOffset], 125);
  }
  for (const row of input.tileRows) row.tiles.forEach((tile, i) => {
    assert.equal(tile, prg[row.sourceOffsets[i]]);
    assert.ok(result.specialMenus.chrIdentities.some(id => id.id === row.chrIdentities[i]));
  });
});