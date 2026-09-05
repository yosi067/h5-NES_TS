// ORIGINAL bank-0 $9D27/$9D50 text format used by pregame player/team data.
// This extracts labels only; it makes NO claims about ability-value semantics.
export function extractDataMenuDefinitions(prg, table, translations, prgStart = 16) {
  const entries = [], groups = [], pointers = [], evidence = [];
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  for (const [offset, hex, description] of [
    [0x01d5c, 'b1e6c9fcb010a4e8a6e920ca88', '$9D66 reads ($E6),$EB then draws at X:Y'],
    [0x02642, 'bca8bdbda9bdaa4c509d', '$A642 team pointer table $BDA8 -> $9D50'],
    [0x02532, 'bc64bdbd65bdaa', '$A532 round pointer table $BD64'],
  ]) {
    const bytes = [...Buffer.from(hex, 'hex')];
    require(prg.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes)), `Data-menu writer mismatch ${offset.toString(16)}`);
    evidence.push({ offset, bytes, description });
  }
  const add = (offset, bytes, domain, extra = {}) => {
    const source = bytes.map(byte => {
      const character = table.get(byte);
      require(character && !character.startsWith('{'), `Unknown data-menu glyph ${byte.toString(16)}`);
      return character;
    }).join('').trim();
    require(typeof translations[source] === 'string' && translations[source].trim(), `Missing data-menu translation: ${source}`);
    const bodyTiles = bytes.map(byte => byte < 0xa0 ? byte : prg[0xa14 + byte]);
    const markTiles = bytes.map(byte => byte < 0xa0 ? 0 : byte < 0xc8 ? 0x94 : 0x95);
    entries.push({ id: `menu.data.${offset.toString(16).padStart(5, '0')}`, category: 'menu', domain,
      source, translation: translations[source], offset, fileOffset: offset + prgStart, bytes,
      encoding: 'ct2-menu-glyph', bodyTiles, markTiles,
      writer: { pc: 0x9d66, physicalBank: 0, sourcePointerZp: 0xe6, sourceIndexZp: 0xeb }, ...extra });
  };
  // Three referenced player-data groups: FD introduces the next PPU address;
  // FF terminates the group. Positions address the MARK row, body is +32.
  // $B8AA/$B8B1 script operands point to $BF4E/$BFBB; $BFBA is the
  // preceding outfield group's FF, NOT the goalkeeper group's address.
  for (const groupOffset of [0x3f15, 0x3f4e, 0x3fbb]) {
    let cursor = groupOffset;
    const offsets = [];
    for (;;) {
      require(cursor + 2 < 0x4000, 'Truncated data-menu address');
      const target = prg.readUInt16LE(cursor); cursor += 2;
      require(target >= 0x2000 && target < 0x2fc0 && (target & 0x3ff) < 0x3a0, 'Invalid data-menu target');
      const offset = cursor;
      while (cursor < 0x4000 && prg[cursor] < 0xfc) cursor++;
      require(prg[cursor] === 0xfd || prg[cursor] === 0xff, 'Invalid data-menu terminator');
      add(offset, [...prg.subarray(offset, cursor)], 'player-data-label', { target, targetRow: 'mark', groupOffset });
      offsets.push(offset);
      if (prg[cursor++] === 0xff) break;
    }
    groups.push({ offset: groupOffset, bytes: [...prg.subarray(groupOffset, cursor)], entries: offsets });
  }
  for (const [domain, tableOffset, count, low, high] of [
    ['match-round', 0x3d64, 8, 0x3d74, 0x3da8],
    ['team-name', 0x3da8, 37, 0x3df2, 0x3f15],
  ]) {
    for (let index = 0; index < count; index++) {
      const pointerOffset = tableOffset + 2 * index;
      const offset = prg.readUInt16LE(pointerOffset) - 0x8000;
      require(offset >= low && offset < high, 'Data-menu pointer out of range');
      let end = offset;
      while (end < high && prg[end] < 0xfc) end++;
      require(prg[end] === 0xff, 'Unterminated data-menu table text');
      add(offset, [...prg.subarray(offset, end)], domain, { pointerOffset, pointerIndex: index });
      pointers.push({ pointerOffset, index, offset, terminatorOffset: end, domain });
    }
  }
  return { entries, groups, pointers, evidence };
}