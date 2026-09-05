/** ORIGINAL Japanese CT2 menu sources. Build-time only; never modifies the ROM.
 * Offsets are physical PRG offsets (NOT iNES file offsets or CPU addresses).
 * The disassembly evidence and integration contract are exported with the data.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';
import { extractDataMenuDefinitions } from './ct2-menu-data.mjs';
import { extractSpecialMenuDefinitions } from './ct2-menu-special.mjs';

const root = new URL('../', import.meta.url);
export const CT2_MENU_HASHES = [
  'bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746',
  'ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae',
];
const hex = value => value.toString(16).padStart(5, '0');
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function originalPrg(rom) {
  invariant(rom.subarray(0, 4).equals(Buffer.from([0x4e, 0x45, 0x53, 0x1a])), 'Invalid iNES header');
  const sourceSha256 = sha256(rom);
  invariant(CT2_MENU_HASHES.includes(sourceSha256), 'Unsupported CT2 ROM SHA-256');
  const prgStart = 16 + ((rom[6] & 4) ? 512 : 0);
  invariant(rom[4] === 16 && rom[5] === 16 && rom.length >= prgStart + 0x60000, 'Unexpected CT2 layout');
  return { prg: rom.subarray(prgStart, prgStart + 0x40000), chr: rom.subarray(prgStart + 0x40000), prgStart, sourceSha256 };
}

/** Exact translation of original $CBC2 glyph conversion, including separate marks.
 * Result is [body tile, mark tile one nametable row ABOVE the body].
 */
export function menuGlyphTiles(byte) {
  invariant(Number.isInteger(byte) && byte >= 0 && byte < 0xe0, 'Not a menu glyph');
  if (byte < 0xa0) return [byte, 0];
  if (byte < 0xc8) {
    let tile = byte >= 0xb4 ? byte - 0x14 : byte;
    tile -= 0x9a;
    if (tile >= 0x15) tile += 5;
    return [tile + (byte >= 0xb4 ? 0x40 : 0), 0x94];
  }
  let tile = byte - 0xae;
  if (tile >= 0x1f) tile = tile - 5 + 0x40;
  return [tile, 0x95];
}

const oneParameter = new Set([0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe8, 0xe9, 0xea, 0xec, 0xed, 0xee, 0xf1, 0xf5]);
export function parseMenuRecord(prg, offset, table, end = 0x33fd5) {
  const tokens = [];
  let cursor = offset;
  while (cursor < end) {
    const start = cursor;
    const byte = prg[cursor++];
    if (byte >= 0xf8 && byte <= 0xfc) return { offset, bytes: [...prg.subarray(offset, cursor)], tokens, terminator: byte };
    if (byte >= 0xe0) {
      invariant(byte <= 0xf7, `Unsupported menu control at ${hex(start)}`);
      const parameters = oneParameter.has(byte) ? [prg[cursor++]] : [];
      invariant(cursor <= end, 'Truncated menu control');
      tokens.push({ kind: 'dynamic', offset: start, opcode: byte, parameters });
    } else {
      while (cursor < end && prg[cursor] < 0xe0) cursor++;
      const bytes = [...prg.subarray(start, cursor)];
      const source = bytes.map(b => {
        const character = table.get(b);
        invariant(character !== undefined && !character.startsWith('{'), `Unknown menu glyph ${b.toString(16)} at ${hex(start)}`);
        return character;
      }).join('');
      tokens.push({ kind: 'text', offset: start, bytes, source });
    }
  }
  throw new Error(`Unterminated menu record at ${hex(offset)}`);
}

/** $E93D: 33 pointers, three-byte header, width = header[2] >> 2,
 * rows = header[2] & 3; FE pads the remainder of a row with zero.
 */
export function extractCommandTiles(prg) {
  const records = [];
  for (let index = 0; index < 33; index++) {
    const pointerOffset = 0x3e9da + index * 2;
    const offset = 0x30000 + prg.readUInt16LE(pointerOffset);
    const end = index < 32 ? 0x30000 + prg.readUInt16LE(pointerOffset + 2) : 0x3eb86;
    invariant(offset >= 0x3ea1c && end <= 0x3eb86 && offset < end, 'Invalid command pointer');
    const target = prg.readUInt16LE(offset);
    const width = prg[offset + 2] >> 2, height = prg[offset + 2] & 3;
    invariant(width > 0 && height > 0, 'Invalid command geometry');
    let cursor = offset + 3;
    const rows = [];
    for (let y = 0; y < height; y++) {
      const tiles = [], sourceOffsets = [];
      let padding = false;
      for (let x = 0; x < width; x++) {
        if (!padding) {
          invariant(cursor < end, 'Truncated command row');
          if (prg[cursor] === 0xfe) { cursor++; padding = true; }
        }
        tiles.push(padding ? 0 : prg[cursor]);
        sourceOffsets.push(padding ? null : cursor++);
      }
      rows.push({ tiles, sourceOffsets });
    }
    invariant(cursor === end, `Unconsumed command bytes at ${hex(offset)}: ${hex(cursor)} != ${hex(end)}`);
    records.push({ index, pointerOffset, offset, bytes: [...prg.subarray(offset, end)], target, width, height, rows });
  }
  return records;
}

/** Bank 0 $97B6: length/flags, PPU low, PPU high, literal payload.
 * Bit 7 = vertical increment, bit 6 = LAST record (NOT run-length encoding).
 * Queued copy $97F3; direct PPU copy $985D. No zero terminator.
 */
export function parseTileStream(prg, offset, limit) {
  const writes = [];
  let cursor = offset;
  while (cursor < limit) {
    const headerOffset = cursor, flag = prg[cursor++];
    const count = flag & 0x3f;
    invariant(count > 0 && cursor + 2 <= limit, 'Invalid tile stream header');
    const target = prg.readUInt16LE(cursor); cursor += 2;
    const stride = flag & 0x80 ? 32 : 1;
    invariant(cursor + count <= limit, 'Truncated tile stream');
    for (let i = 0; i < count; i++) writes.push({ headerOffset, target: target + i * stride, tile: prg[cursor + i], offset: cursor + i });
    cursor += count;
    if (flag & 0x40) return { offset, bytes: [...prg.subarray(offset, cursor)], writes };
  }
  throw new Error('Unterminated tile stream');
}

export function buildCT2MenuDefinitions(rom, translations, table) {
  const { prg, chr, prgStart, sourceSha256 } = originalPrg(rom);
  // Pin the actual readers, table loads, and conversion routine before interpreting data.
  const evidence = [
    [0x30854, 'bdcfb38550bdd0b38551', 'layout pointer table $B3CF'],
    [0x30898, '186906', 'two rows of width + 3 queued bytes'],
    [0x3099c, 'a440e640b13ec9e09006', '($3E),Y text reader; E0+ controls'],
    [0x309ac, '2024c5209f8c', '$89AC glyph conversion then queue write'],
    [0x3cbc2, 'a000c9a09028a094c9c8900c', '$CBC2 body/mark conversion'],
    [0x3e962, 'b9dae9853cb9dbe9853d', '$E9DA command pointer table'],
    [0x3e9b0, 'b13cc8c9fef00a9da504', '$E9B7 literal command tile writer'],
    [0x017f1, 'b1e69de805c8e86838e901d0f2', '$97F3 literal tile stream queue copy'],
    [0x0185b, 'b1e68d0720c8cad0f7', '$985D direct tile stream PPU copy'],
  ].map(([offset, bytesHex, description]) => {
    invariant(prg.subarray(offset, offset + bytesHex.length / 2).toString('hex') === bytesHex, `Writer signature mismatch at ${hex(offset)}`);
    return { offset, bytes: [...Buffer.from(bytesHex, 'hex')], description };
  });
  const layouts = [], recordsByOffset = new Map();
  // Table ends at its first pointed-to layout ($B453): 66 entries, one alias.
  for (let index = 0; index < 66; index++) {
    const pointerOffset = 0x333cf + index * 2;
    const offset = 0x28000 + prg.readUInt16LE(pointerOffset);
    invariant(offset >= 0x33453 && offset < 0x33bdc, 'Invalid menu layout pointer');
    const bytes = prg.subarray(offset, offset + 9 + prg[offset + 8] * 4);
    invariant(offset + bytes.length <= 0x33bdc, 'Menu layout out of range');
    const placements = [];
    for (let i = 0; i < prg[offset + 8]; i++) {
      const entryOffset = offset + 9 + i * 4;
      const recordOffset = 0x28000 + prg.readUInt16LE(entryOffset + 2);
      invariant(recordOffset >= 0x33bdc && recordOffset < 0x33fd5, `Bad text pointer ${hex(recordOffset)}`);
      const row = prg[entryOffset], column = prg[entryOffset + 1];
      placements.push({ entryOffset, row, column, recordOffset });
      if (!recordsByOffset.has(recordOffset)) recordsByOffset.set(recordOffset, parseMenuRecord(prg, recordOffset, table));
    }
    layouts.push({ index, pointerOffset, offset, bytes: [...bytes], target: prg.readUInt16LE(offset),
      width: prg[offset + 2], lastRow: prg[offset + 3], placements,
      // Original $88E8 may OR a nametable page from $05CE for targets below $2200.
      targetPageDynamic: prg.readUInt16LE(offset) < 0x2200 });
  }
  const entries = [];
  const untranslated = [];
  for (const record of [...recordsByOffset.values()].sort((a, b) => a.offset - b.offset)) {
    for (const token of record.tokens.filter(t => t.kind === 'text')) {
      const source = token.source.trim();
      if (!source) continue;
      const translation = translations.text[source];
      if (!translation) untranslated.push({ offset: token.offset, source });
      entries.push({ id: `menu.rich.${hex(token.offset)}`, category: 'menu', source, translation: translation ?? '',
        encoding: 'ct2-menu-glyph', offset: token.offset, fileOffset: prgStart + token.offset, bytes: token.bytes,
        recordOffset: record.offset, bodyTiles: token.bytes.map(b => menuGlyphTiles(b)[0]),
        markTiles: token.bytes.map(b => menuGlyphTiles(b)[1]),
        dynamicRecord: record.tokens.some(t => t.kind === 'dynamic'),
        // Runtime hook $89AC sees the exact ROM byte; fetched cells must still be validated.
        writer: { pc: 0x89ac, physicalBank: 0x30000, sourcePointerZp: 0x3e },
      });
    }
  }
  const commandTiles = extractCommandTiles(prg);
  for (const record of commandTiles) {
    const translation = translations.commands[record.index];
    invariant(translation?.translation && translation?.source, `Missing command translation ${record.index}`);
    // Verify supplied reading against the actual two-row font tiles, not guessed menu order.
    const body = record.rows[1].tiles;
    const marks = record.rows[0].tiles;
    const source = record.rows.slice(1).map((row, rowIndex) => row.tiles.map((tile, i) => {
      if (tile === 0) return ' ';
      for (const [byte, char] of table) if (byte < 0xe0) {
        const [base, mark] = menuGlyphTiles(byte);
        if (base === tile && mark === (rowIndex === 0 ? marks[i] : 0)) return char;
      }
      throw new Error(`Unknown command tile ${tile.toString(16)} in ${record.index}`);
    }).join('').trim()).join('');
    invariant(source === translation.source, `Command ${record.index}: expected ${translation.source}, ROM says ${source}`);
    entries.push({ id: `menu.command.${record.index.toString().padStart(2, '0')}`, category: 'menu', source,
      translation: translation.translation, encoding: 'ct2-font-tiles', offset: record.offset,
      fileOffset: prgStart + record.offset, bytes: record.bytes, bodyTiles: body, markTiles: marks,
      tileRows: record.rows, width: record.width, height: record.height,
      target: record.target, targetMayBeOffset: true, writer: { pc: 0xe9b7, physicalBank: 0x3e000, sourcePointerZp: 0x3c } });
  }
  // Pregame labels are literal nametable spans; the preceding dakuten is a separate write.
  const pregame = [
    [0x0dcbb, 5, 0x2263, 'じょうほう', '情報'],
    [0x0dcc3, 5, 0x22a3, 'スコアメモ', '密碼紀錄'],
    [0x0dccf, 6, 0x22e3, 'チームデータ', '球隊資料'],
    [0x0dcd8, 5, 0x2323, 'キックオフ', '開球'],
  ];
  for (const [offset, length, target, source, translation] of pregame) {
    const bodyTiles = [...prg.subarray(offset, offset + length)];
    const expected = [...source].map(char => {
      const found = [...table].find(([, t]) => t === char);
      invariant(found, `No glyph for ${char}`); return menuGlyphTiles(found[0]);
    });
    invariant(expected.length === length && expected.every(([tile], i) => tile === bodyTiles[i]), `Pregame source mismatch ${hex(offset)}`);
    invariant(prg.readUInt16LE(offset - 2) === target && (prg[offset - 3] & 0x3f) === length, 'Pregame stream header mismatch');
    const markTiles = expected.map(([, mark]) => mark);
    // Nonzero marks are separately sourced immediately before their body records.
    const markSources = markTiles.flatMap((tile, i) => {
      if (!tile) return [];
      const markOffset = offset - 4;
      invariant(prg[markOffset] === tile && prg[markOffset - 3] === 1 && prg.readUInt16LE(markOffset - 2) === target - 32 + i,
        'Pregame mark source mismatch');
      return [{ offset: markOffset, target: target - 32 + i, tile }];
    });
    entries.push({ id: `menu.pregame.${hex(offset)}`, category: 'menu', source, translation, encoding: 'ct2-font-tiles',
      offset, fileOffset: prgStart + offset, bytes: bodyTiles, bodyTiles, markTiles, markSources, target,
      writers: [{ pc: 0x97f3, physicalBank: 0, sourcePointerZp: 0xe6 }, { pc: 0x985d, physicalBank: 0, sourcePointerZp: 0xe6 }] });
  }
  const dataMenus = extractDataMenuDefinitions(prg, table, translations.data, prgStart);
  entries.push(...dataMenus.entries);
  evidence.push(...dataMenus.evidence);
  const specialMenus = extractSpecialMenuDefinitions(prg, chr, table, translations.special, prgStart);
  entries.push(...specialMenus.entries);
  evidence.push(...specialMenus.evidence);
  const passwordInputStream = parseTileStream(prg, 0x32c3, 0x32ed);
  const passwordInputWrites = new Map(passwordInputStream.writes.map(w => [w.target, w]));
  const passwordInput = { ...passwordInputStream, translatable: false, state: 'initial-empty-field-only',
    tileRows: [0x212a, 0x216a].map((target, y) => {
      const cells = Array.from({ length: y === 0 ? 11 : 9 }, (_, i) => passwordInputWrites.get(target + i));
      invariant(cells.every(c => c && (c.tile === 0 || c.tile === 0x7d)), 'Password input placeholder mismatch');
      return { target, tiles: cells.map(c => c.tile), sourceOffsets: cells.map(c => c.offset),
        chrIdentities: cells.map(c => `ct2-original-font:${c.tile.toString(16).padStart(2, '0')}`) };
    }),
    slots: Array.from({ length: 18 }, (_, index) => {
      const positionOffset = 0x3241 + index, markTarget = 0x2100 + prg[positionOffset], target = markTarget + 32;
      const write = passwordInputWrites.get(target);
      invariant(write?.tile === 0x7d, 'Password slot position mismatch');
      return { index, positionOffset, markTarget, target, placeholderOffset: write.offset, tile: write.tile };
    }),
    guard: { sourceRomHashRequired: true, allRowsRequired: true, chrIdentityRequired: true, companionEntryId: 'menu.password.alphabet' } };
  return { format: 'ct2-original-menu-definitions', version: 1, sourceSha256, sourceHashes: CT2_MENU_HASHES,
    locale: 'zh-Hant', evidence, entries, layouts, records: [...recordsByOffset.values()], commandTiles,
    pregameStream: parseTileStream(prg, 0x0dc42, 0x0dcdd),
    dataMenus: { groups: dataMenus.groups, pointers: dataMenus.pointers },
    specialMenus: { titleScene: specialMenus.titleScene, passwordInput, chrIdentities: specialMenus.chrIdentities,
      matchingContract: 'Match every tileRow at fetched nametable targets and ORIGINAL CHR physicalOffsets; require same-frame companion guards. Never match a tile number alone. sourceOffsets on glyph rows identify encoded bytes, not literal tile bytes. Null sourceOffsets are constrained display gaps. No OCR.' },
    font: { encoding: 'body-plus-mark-above', chrPhysicalBase: 0, sha256: sha256(chr.subarray(0, 0x1000)),
      // Individual source font identities: compare PPU fetched ORIGINAL CHR addresses, never image recognition.
      tileSha256: Array.from({ length: 256 }, (_, tile) => sha256(chr.subarray(tile * 16, tile * 16 + 16))) },
    coverage: { fullyLocalized: false, runtimeDisplayEnabled: false, sourceVerification: 'original-ROM-sha256-and-writer-signatures',
      richLayouts: layouts.length, richRecords: recordsByOffset.size, extracted: entries.length, untranslated,
      dataEntries: dataMenus.entries.length, specialEntries: specialMenus.entries.length,
      preservedPasswordGrids: 1, verifiedEmptyPasswordSlots: passwordInput.slots.length,
      covered: ['match commands and prompts', 'goalkeeper commands', 'set pieces and PK menus', 'formation/defense/substitutions', 'pregame four labels',
        'pregame player/goalkeeper ability labels (not values)', '37 pregame team-name records', '8 match-round records',
        'title KICK OFF / CONTINUE original graphic metatiles and physical CHR',
        'password 64-symbol alphabet plus E submit action (symbols preserved)', 'password input and error prompts', '18 empty password input slots'],
      missing: ['dynamic entered/generated password contents and cursor state',
        'dynamic player names and ability values', 'runtime ownership/generation integration', 'in-game traversal of every menu variant', 'linguistic review'] } };
}

export function buildDefaultCT2Menus() {
  const table = parseTable(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/text.tbl', root), 'utf8'));
  for (const [byte, text] of parseTable(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/localization-extra.tbl', root), 'utf8'))) table.set(byte, text);
  const translations = JSON.parse(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/translations/menus.zh-Hant.json', root), 'utf8'));
  translations.data = JSON.parse(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/translations/data-menus.zh-Hant.json', root), 'utf8'));
  translations.special = JSON.parse(fs.readFileSync(new URL('game-profiles/captain-tsubasa-2-jp/translations/title-password.zh-Hant.json', root), 'utf8'));
  return buildCT2MenuDefinitions(fs.readFileSync(new URL('roms/Captain Tsubasa II - Super Striker (Japan).nes', root)), translations, table);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildDefaultCT2Menus();
  console.log(JSON.stringify(process.argv.includes('--json') ? result : result.coverage, null, 2));
}