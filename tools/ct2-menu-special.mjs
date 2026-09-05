// Original CT2 title/password sources. No OCR, patched ROM or runtime hooks.
import crypto from 'node:crypto';
const require = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** Scene $17: original $8AF7 selects $A02E in physical bank $0E000.
 * $8EF0 expands a 4x4 metatile (attribute byte + 16 literal tile bytes).
 * Header bit 7 selects metatiles 256..511. This scene's traversal is reversed
 * within each row, but its final spatial order is the stored left-to-right order.
 * Deliberately bounded to this verified scene, not a general scene decoder.
 */
export function extractTitleScene(prg) {
  const pointerOffset = 0x0e02e;
  const offset = 0x0e000 + prg.readUInt16LE(pointerOffset) - 0xa000;
  require(offset === 0x0e373, 'Title scene pointer mismatch');
  require(prg.subarray(offset, offset + 6).equals(Buffer.from([0x7c, 0x7e, 0x81, 6, 8, 8])), 'Title scene header mismatch');
  require(prg.subarray(offset + 54, offset + 56).equals(Buffer.from([0, 0xa0])), 'Title scene trailer mismatch');
  const writes = [];
  for (let my = 0; my < 6; my++) for (let mx = 0; mx < 8; mx++) {
    const sceneOffset = offset + 6 + my * 8 + mx;
    const metatile = 0x100 + prg[sceneOffset];
    const metatileOffset = 0x10000 + 17 * metatile;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const sourceOffset = metatileOffset + 1 + y * 4 + x;
      writes.push({ target: 0x2080 + (my * 4 + y) * 32 + mx * 4 + x,
        tile: prg[sourceOffset], offset: sourceOffset, sceneOffset, metatile, metatileOffset });
    }
  }
  return { pointerOffset, offset, bytes: [...prg.subarray(offset, offset + 56)], writes,
    chrBanks1KiB: [0x7c, 0x7d, 0x7e, 0x7f], target: 0x2080, width: 32, height: 24 };
}

export function extractSpecialMenuDefinitions(prg, chr, table, translations, prgStart = 16) {
  const entries = [], evidence = [];
  for (const [offset, hex, description] of [
    [0x0006a, 'a91720f78a', 'title caller selects scene $17'],
    [0x00b0d, 'a20720b9c4', 'scene pointer/data PRG bank $07'],
    [0x00b4e, '8a465b2a265b', 'scene header bit 7 selects upper metatile half'],
    [0x00b79, '065c265d065c265d', 'scene nametable target shift'],
    [0x00ca5, 'a575858ea576858f', 'scene CHR pair becomes bottom background pair'],
    [0x00f26, 'a20820b9c4', 'metatile PRG bank $08'],
    [0x00f47, 'a000b1ea9de805e8c8c004d0f5', 'four literal tiles per metatile row'],
    [0x041cb, 'b678a90005228d00808e0180b679a90105228d00808e0180', 'background CHR pairs -> MMC3 R0/R1 ($A1CB in bank 2)'],
    [0x02128, 'a900858e8590857ba92e858f8591', 'password background CHR pair $00/$2E'],
    [0x0213b, 'a96e85e6a9bc85e7a9c485e8a92185e9', 'password alphabet $BC6E, mark target $21C4'],
    [0x0214f, 'a90585eba90d85ed', 'five rows of thirteen cells'],
    [0x02157, 'a4ecb1e6a4e8a6e920ca88e6e8e6e8e6ecc6edd0eb', 'alphabet reader/glyph writer; column stride two'],
    [0x0216c, 'a5e818692685e8a5e9690085e9c6ebd0d6', 'alphabet row stride $40 (26 + $26)'],
    [0x02188, 'a096a2b220c0b0', 'password UI script $B296'],
    [0x032af, '00c3b20aafbc0abebc', 'UI literal input slots, prompt $BCAF, error $BCBE'],
    [0x03199, '20c9b120279d', 'UI opcode $0A dispatches address-prefixed glyph record'],
    [0x02231, 'a6ecbd55b2c9fff032', 'alphabet action $FF submits rather than entering a character'],
    [0x02240, 'bd6ebca6edbc41b2a22120ca88', 'entered password glyph uses $B241 slot offsets, mark page $21'],
    [0x008d1, 'c9a0901848c9c8a9946900', 'original font mark selection'],
    [0x008e0, '68a8b9148a9de805', 'original font conversion lookup'],
    [0x038ab, '4ebf0eb4b80d0abbbf0a15bf', 'outfield/goalkeeper/common data group operands'],
  ]) {
    const bytes = [...Buffer.from(hex, 'hex')];
    require(prg.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes)), `Special-menu writer mismatch ${offset.toString(16)}`);
    evidence.push({ offset, bytes, description });
  }
  const decode = bytes => bytes.map(byte => {
    const char = table.get(byte);
    require(char && !char.startsWith('{'), `Unknown password glyph ${byte.toString(16)}`);
    return char;
  }).join('');
  const glyph = byte => [byte < 0xa0 ? byte : prg[0xa14 + byte], byte < 0xa0 ? 0 : byte < 0xc8 ? 0x94 : 0x95];
  // Font rows use canonical original CHR bytes. The original ROM has aliases
  // (e.g. password dakuten $B940 == font $0940); matching must accept ONLY the
  // enumerated physical originals, not a tile number under an unrelated bank.
  const identities = new Map();
  const identify = (tile, fontId) => {
    const id = `${fontId}:${tile.toString(16).padStart(2, '0')}`;
    if (!identities.has(id)) {
      const offset = (fontId === 'ct2-title-graphics' ? 0x1f000 : 0) + tile * 16;
      const bytes = chr.subarray(offset, offset + 16);
      require(bytes.length === 16, 'Truncated source CHR');
      const physicalOffsets = [];
      if (fontId === 'ct2-title-graphics') physicalOffsets.push(offset);
      else for (let p = 0; p + 16 <= chr.length; p += 16) if (chr.subarray(p, p + 16).equals(bytes)) physicalOffsets.push(p);
      identities.set(id, { id, chrPhysicalOffset: offset, bytes: [...bytes], sha256: sha256(bytes), physicalOffsets });
    }
    return id;
  };
  const row = (target, tiles, sourceOffsets, fontId = 'ct2-original-font') => ({ target, tiles, sourceOffsets,
    chrIdentities: tiles.map(tile => identify(tile, fontId)) });
  const add = (key, offset, bytes, extra) => {
    const translation = translations[key];
    require(translation?.source && translation?.translation?.trim(), `Missing special-menu translation ${key}`);
    entries.push({ id: `menu.${key}`, category: 'menu', ...translation, offset, fileOffset: prgStart + offset, bytes, ...extra });
  };
  const titleScene = extractTitleScene(prg);
  const writes = new Map(titleScene.writes.map(w => [w.target, w]));
  for (const [key, source, target, expected] of [
    ['title.kick-off', 'KICK OFF', 0x220c, [0x0c, 0x0b, 5, 0x0c, 0, 0x10, 8, 8]],
    ['title.continue', 'CONTINUE', 0x224c, [5, 0x10, 0x0f, 0x14, 0x0b, 0x0f, 0x15, 7]],
  ]) {
    require(translations[key]?.source === source, 'Title source label mismatch');
    const cells = expected.map((tile, i) => {
      const cell = writes.get(target + i);
      require(cell?.tile === tile, `Title literal tile mismatch ${key}`);
      return cell;
    });
    add(key, titleScene.offset, titleScene.bytes, { encoding: 'ct2-graphic-tiles', target, width: 8, height: 1,
      sourceReading: 'manually identified original CHR graphics, not font-table decoding',
      tileRows: [row(target, expected, cells.map(c => c.offset), 'ct2-title-graphics')],
      sourceCells: cells, scenePointerOffset: titleScene.pointerOffset,
      writer: { pc: 0x8f4b, physicalBank: 0, sourcePointerZp: 0xea },
      guard: { sourceRomHashRequired: true, allRowsRequired: true, chrIdentityRequired: true,
        companionEntryId: key === 'title.kick-off' ? 'menu.title.continue' : 'menu.title.kick-off' } });
  }
  const fontRows = (target, bytes, offset, stride = 1) => {
    const width = (bytes.length - 1) * stride + 1;
    const body = Array(width).fill(0), marks = Array(width).fill(0), sources = Array(width).fill(null);
    bytes.forEach((byte, i) => { [body[i * stride], marks[i * stride]] = glyph(byte); sources[i * stride] = offset + i; });
    return [row(target, marks, sources), row(target + 32, body, sources)];
  };
  for (const [key, groupOffset] of [['password.prompt', 0x3caf], ['password.error', 0x3cbe]]) {
    const target = prg.readUInt16LE(groupOffset), offset = groupOffset + 2;
    let end = offset;
    while (end < 0x3cd1 && prg[end] < 0xfc) end++;
    require(prg[end] === 0xff, 'Unterminated password prompt');
    const bytes = [...prg.subarray(offset, end)], source = decode(bytes);
    require(translations[key]?.source === source, `Password prompt source mismatch ${key}`);
    add(key, offset, bytes, { encoding: 'ct2-menu-glyph', target, targetRow: 'mark', width: bytes.length, height: 2,
      groupOffset, terminatorOffset: end, tileRows: fontRows(target, bytes, offset),
      writer: { pc: 0x9d66, physicalBank: 0, sourcePointerZp: 0xe6, sourceIndexZp: 0xeb },
      guard: { sourceRomHashRequired: true, allRowsRequired: true, chrIdentityRequired: true },
      // Error text is pre-rendered in nametable $2400. Its target is NOT a
      // hard-coded screen coordinate or evidence of when/how it is visible.
      visibility: 'fetched-cells-only' });
  }
  const offset = 0x3c6e, bytes = [...prg.subarray(offset, offset + 65)];
  require(prg[0x3295] === 0xff && bytes[64] === 0x85, 'Password confirmation sentinel mismatch');
  const tileRows = [], sourceRows = [];
  for (let y = 0; y < 5; y++) {
    const slice = bytes.slice(y * 13, y * 13 + 13);
    sourceRows.push(decode(slice));
    tileRows.push(...fontRows(0x21c4 + y * 64, slice, offset + y * 13, 2));
  }
  entries.push({ id: 'menu.password.alphabet', category: 'menu', domain: 'password-input', encoding: 'ct2-menu-glyph',
    source: sourceRows.join('\n'), translation: sourceRows.join('\n'), translatable: false,
    translationPolicy: 'preserve password symbols and ordering; final E action has a separate translation',
    offset, fileOffset: prgStart + offset, bytes, target: 0x21c4, targetRow: 'mark', width: 25, height: 10, tileRows,
    characterCount: 64, actionCount: 1, glyphColumnStride: 2, glyphRowStride: 64,
    gapPolicy: 'null sourceOffsets are display gaps, required to be zero by matching, not ROM literal writes',
    writer: { pc: 0xa15f, physicalBank: 0x2000, sourcePointerZp: 0xe6, sourceIndexZp: 0xec },
    guard: { sourceRomHashRequired: true, allRowsRequired: true, chrIdentityRequired: true } });
  require(translations['password.confirm']?.source === decode([bytes[64]]), 'Password confirmation label mismatch');
  add('password.confirm', offset + 64, [bytes[64]], { encoding: 'ct2-menu-glyph', target: 0x22dc, targetRow: 'mark',
    width: 1, height: 2, tileRows: fontRows(0x22dc, [bytes[64]], offset + 64),
    actionTableOffset: 0x3295, action: 'submit-password',
    guard: { sourceRomHashRequired: true, allRowsRequired: true, chrIdentityRequired: true, companionEntryId: 'menu.password.alphabet' } });
  return { entries, evidence, titleScene, chrIdentities: [...identities.values()] };
}