// Inspect ORIGINAL ROM source bytes, never screenshots or OCR.
import fs from 'node:fs';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';
const rom = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
const start = 16 + ((rom[6] & 4) ? 512 : 0);
const prg = rom.subarray(start, start + rom[4] * 16384);
const table = parseTable(fs.readFileSync(new URL('../game-profiles/captain-tsubasa-2-jp/text.tbl', import.meta.url), 'utf8'));
for (const [byte, text] of parseTable(fs.readFileSync(new URL('../game-profiles/captain-tsubasa-2-jp/localization-extra.tbl', import.meta.url), 'utf8'))) table.set(byte, text);
const decode = bytes => [...bytes].map(byte => table.get(byte)?.startsWith('{') ? `<${byte.toString(16)}>` : table.get(byte) ?? `<${byte.toString(16)}>`).join('');
if (process.argv.includes('--find-hex')) {
  for (const hex of process.argv.slice(3)) {
    const bytes = Buffer.from(hex, 'hex');
    for (let i = prg.indexOf(bytes); i >= 0; i = prg.indexOf(bytes, i + 1)) console.log(hex, i.toString(16));
  }
} else if (process.argv.includes('--ranges')) {
  for (const range of process.argv.slice(2).filter(a => a.includes(':'))) {
    const [lo, hi] = range.split(':').map(s => parseInt(s, 16));
    for (let offset = lo; offset < hi; offset += 32) console.log(offset.toString(16).padStart(5, '0'), prg.subarray(offset, Math.min(offset + 32, hi)).toString('hex'), decode(prg.subarray(offset, Math.min(offset + 32, hi))));
  }
} else {
  const needles = process.argv.slice(2).length ? process.argv.slice(2) : ['はじめ', 'つづき', 'ミーティング', 'チーム', 'パスワード', 'キックオフ', 'シュート', 'ドリブル', 'ワンツー', 'タックル', 'データ'];
  for (const needle of needles) {
    const reverse = new Map([...table].filter(([, t]) => t.length === 1).map(([b, t]) => [t, b]));
    const bytes = Buffer.from([...needle].map(c => { if (!reverse.has(c)) throw new Error(`Unknown ${c}`); return reverse.get(c); }));
    for (let i = prg.indexOf(bytes); i >= 0; i = prg.indexOf(bytes, i + 1)) console.log(needle, i.toString(16), decode(prg.subarray(Math.max(0, i - 12), i + bytes.length + 20)));
  }
}