#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROM = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'roms', 'Zombie Hunter (Japan).nes');

function hex(value, width = 0) {
  return value.toString(16).padStart(width, '0');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inspectRom(rom) {
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') {
    throw new Error('ROM is not an iNES image');
  }
  const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
  const prgStart = 16 + trainerSize;
  const prgSize = rom[4] * 16 * 1024;
  const chrStart = prgStart + prgSize;
  const chrSize = rom[5] * 8 * 1024;
  if (prgSize === 0 || chrSize === 0 || chrStart + chrSize > rom.length) {
    throw new Error('ROM has invalid PRG or CHR data');
  }
  return {
    sha256: sha256(rom),
    mapper: (rom[7] & 0xf0) | (rom[6] >> 4),
    mirroring: (rom[6] & 1) !== 0 ? 'vertical' : 'horizontal',
    prgStart,
    prgSize,
    chrStart,
    chrSize,
    prgBanks: rom[4],
    chrBanks: rom[5],
  };
}

function byteCounts(bytes) {
  const counts = new Uint32Array(256);
  for (const value of bytes) counts[value] += 1;
  return counts;
}

function printableRuns(bytes, minimumLength = 8) {
  const runs = [];
  let start = 0;
  while (start < bytes.length) {
    let end = start;
    while (end < bytes.length && bytes[end] >= 0x20 && bytes[end] <= 0x7e) end += 1;
    if (end - start >= minimumLength) {
      runs.push({ offset: start, length: end - start, text: String.fromCharCode(...bytes.subarray(start, end)) });
    }
    start = Math.max(end + 1, start + 1);
  }
  return runs;
}

function textByteScore(bytes, terminator) {
  if (bytes.length === 0) return 0;
  let score = 0;
  for (const value of bytes) {
    if (value === terminator) continue;
    if (value === 0 || value === 0xff) score -= 2;
    else if (value < 0x20) score -= 1;
    else score += 1;
  }
  return score / bytes.length;
}

function readCandidateStrings(bytes, terminator, minimumLength = 3, maximumLength = 80) {
  const candidates = [];
  let start = 0;
  while (start < bytes.length) {
    const end = bytes.indexOf(terminator, start);
    if (end < 0) break;
    const length = end - start;
    if (length >= minimumLength && length <= maximumLength) {
      const body = bytes.subarray(start, end);
      const score = textByteScore(body, terminator);
      if (score >= 0.55) candidates.push({ offset: start, length, terminator, score, bytes: [...body] });
    }
    start = end + 1;
  }
  return candidates;
}

function physicalTarget(pointer, bankStart, bankSize, addressBase) {
  if (pointer < addressBase || pointer >= addressBase + bankSize) return null;
  return bankStart + pointer - addressBase;
}

function pointerTables(prg, bankSize = 0x4000) {
  const results = [];
  const addressBases = [0x8000, 0xa000, 0xc000, 0xe000];
  for (let bankStart = 0; bankStart < prg.length; bankStart += bankSize) {
    const bankEnd = Math.min(bankStart + bankSize, prg.length);
    for (let tableOffset = bankStart; tableOffset + 8 < bankEnd; tableOffset += 1) {
      for (const addressBase of addressBases) {
        const pointers = [];
        let cursor = tableOffset;
        while (cursor + 1 < bankEnd && pointers.length < 64) {
          const pointer = prg[cursor] | (prg[cursor + 1] << 8);
          const target = physicalTarget(pointer, bankStart, bankSize, addressBase);
          if (target === null || target < tableOffset + 4 || target >= bankEnd) break;
          if (pointers.length > 0 && target < pointers.at(-1).target) break;
          pointers.push({ pointer, target });
          cursor += 2;
        }
        if (pointers.length < 5) continue;
        const uniqueTargets = new Set(pointers.map(item => item.target));
        if (uniqueTargets.size < 3) continue;
        const span = pointers.at(-1).target - pointers[0].target;
        if (span < pointers.length - 1) continue;
        results.push({
          bank: bankStart / bankSize,
          offset: tableOffset,
          count: pointers.length,
          addressBase,
          firstTarget: pointers[0].target,
          lastTarget: pointers.at(-1).target,
          span,
        });
      }
    }
  }
  return results
    .sort((left, right) => right.count - left.count || left.offset - right.offset)
    .filter((candidate, index, all) => all.findIndex(other => (
      other.bank === candidate.bank
      && other.offset === candidate.offset
      && other.addressBase === candidate.addressBase
    )) === index);
}

function tileStats(chr) {
  const tiles = [];
  for (let offset = 0; offset + 16 <= chr.length; offset += 16) {
    let pixels = 0;
    let rows = 0;
    for (let row = 0; row < 8; row += 1) {
      const plane0 = chr[offset + row];
      const plane1 = chr[offset + row + 8];
      pixels += plane0.toString(2).split('1').length - 1;
      pixels += plane1.toString(2).split('1').length - 1;
      if (plane0 !== 0 || plane1 !== 0) rows += 1;
    }
    tiles.push({ tile: offset / 16, pixels, rows });
  }
  return tiles;
}

function report(romPath) {
  const rom = fs.readFileSync(romPath);
  const info = inspectRom(rom);
  const prg = rom.subarray(info.prgStart, info.prgStart + info.prgSize);
  const chr = rom.subarray(info.chrStart, info.chrStart + info.chrSize);
  const counts = byteCounts(prg);
  const topBytes = [...counts]
    .map((count, value) => ({ value, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 24);
  const runs = printableRuns(prg);
  const terminators = [0x00, 0x01, 0x02, 0x03, 0x0f, 0x10, 0x20, 0xfc, 0xfd, 0xfe, 0xff];
  const stringCandidates = terminators.flatMap(terminator => readCandidateStrings(prg, terminator)
    .map(candidate => ({ ...candidate, terminator: hex(terminator, 2) })));
  const tiles = tileStats(chr);
  const tilePages = [];
  for (let page = 0; page < info.chrSize / 0x1000; page += 1) {
    const pageTiles = tiles.slice(page * 256, page * 256 + 256);
    const populated = pageTiles.filter(tile => tile.pixels > 0).length;
    const sparse = pageTiles.filter(tile => tile.pixels >= 2 && tile.pixels <= 32).length;
    tilePages.push({ page, populated, sparse, averagePixels: pageTiles.reduce((sum, tile) => sum + tile.pixels, 0) / pageTiles.length });
  }
  const output = {
    rom: path.basename(romPath),
    ...info,
    topPrgBytes: topBytes.map(item => ({ value: hex(item.value, 2), count: item.count })),
    asciiRuns: runs.sort((left, right) => right.length - left.length).slice(0, 40).map(run => ({ ...run, offset: hex(run.offset, 5) })),
    pointerTableCandidates: pointerTables(prg).slice(0, 80).map(candidate => ({
      ...candidate,
      offset: hex(candidate.offset, 5),
      firstTarget: hex(candidate.firstTarget, 5),
      lastTarget: hex(candidate.lastTarget, 5),
    })),
    stringCandidates: stringCandidates
      .sort((left, right) => right.score - left.score || left.offset - right.offset)
      .slice(0, 200)
      .map(candidate => ({ ...candidate, offset: hex(candidate.offset, 5) })),
    chrPages: tilePages,
  };
  console.log(JSON.stringify(output, null, 2));
}

const romPath = process.argv[2] ?? DEFAULT_ROM;
report(path.resolve(romPath));