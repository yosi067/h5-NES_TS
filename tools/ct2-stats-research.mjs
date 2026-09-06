/** Read-only original CT2 stat-table extraction; no patch/profile output. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { originalPrg } from './ct2-menu-extract.mjs';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';

export function extractTsubasaStats(rom) {
  const { prg, sourceSha256 } = originalPrg(rom);
  const signatures = [
    [0x3c527, '4c08ce'], // original bank-switch wrapper
    [0x3cd7c, '0aa8b989cd8534b98acd853560'], // record resolver, NOT word resolver
    [0x38030, 'b94e9e8532a900853360'], // ability lookup
    [0x380ff, 'a003b1340a8532686532a8c0c09002a0bf'],
    [0x38116, 'a003b1348532686532c95f9002a95f'],
    [0x02bb4, 'a003b134186901'], // displayed level = byte + 1
    [0x0302e, '84e686e7a280cacaa5e6dd90baa5e7fd91ba90f28a4a60'],
    [0x023c5, 'a0039134'], // level recomputation writes record + 3
    [0x02c05, 'a4e6be81b9e0fff020a55f2027c5'], // panel selector table
  ];
  for (const [offset, expected] of signatures) {
    if (prg.subarray(offset, offset + expected.length / 2).toString('hex') !== expected) {
      throw new Error(`CT2 stat signature mismatch at PRG ${offset.toString(16)}`);
    }
  }
  const nameOffset = 0x30000 + prg.readUInt16LE(0x3f32b);
  if (prg.subarray(nameOffset, nameOffset + 4).toString('hex') !== '12af0bfc') {
    throw new Error('Identity 1 must decode to original つばさ');
  }
  const identityOffset = 0x395d6 + 4;
  const coefficientOffset = 0x39fce + prg[identityOffset] * 24;
  const menus = JSON.parse(fs.readFileSync(new URL('../public/game-profiles/captain-tsubasa-2-jp/menus.json', import.meta.url), 'utf8'));
  const table = parseTable(fs.readFileSync(new URL('../game-profiles/captain-tsubasa-2-jp/text.tbl', import.meta.url), 'utf8'));
  const fields = [];
  for (let offset = 0x3981; prg[offset] !== 0xff; offset += 3) {
    if (offset >= 0x39b2) throw new Error('Unterminated outfield selector table');
    const selector = prg[offset], target = prg.readUInt16LE(offset + 1);
    const label = menus.entries.filter(entry => entry.groupOffset === 0x3f4e
      && ((entry.target + 32) >>> 5) === (target >>> 5) && entry.target + 32 < target)
      .sort((a, b) => b.target - a.target)[0];
    if (!label || selector < 1 || selector > 22) throw new Error('Unverified outfield label/selector');
    const bytes = Buffer.from(label.bytes);
    if (!prg.subarray(label.offset, label.offset + bytes.length).equals(bytes)
      || prg.readUInt16LE(label.offset - 2) !== label.target
      || [...bytes].map(byte => table.get(byte)).join('').trim() !== label.source) {
      throw new Error('Label metadata does not match original ROM glyphs/placement');
    }
    fields.push({ selector, source: label.source, translation: label.translation,
      labelOffset: label.offset, selectorOffset: offset, target });
  }
  return { format: 'ct2-stat-evidence', version: 1, sourceSha256, playerId: 1,
    sourceName: 'つばさ', name: '大空翼', nameOffset, identityOffset, coefficientOffset,
    minLevel: 1, maxLevel: 64, application: 'preview-only',
    coefficients: [...prg.subarray(coefficientOffset, coefficientOffset + 24)],
    abilityCurve: [...prg.subarray(0x39e4e, 0x39f0e)],
    staminaCurve: Array.from({ length: 96 }, (_, i) => prg.readUInt16LE(0x39f0e + i * 2)),
    levelThresholds: Array.from({ length: 64 }, (_, i) => prg.readUInt16LE(0x3a90 + i * 2)),
    fields, signatures: signatures.map(([offset, bytes]) => ({ offset, bytes })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rom = fs.readFileSync(process.argv[2] ?? new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
  console.log(JSON.stringify(extractTsubasaStats(rom), null, 2));
}