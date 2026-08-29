#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROM = path.join(ROOT, 'roms', 'Zombie Hunter (Japan).nes');

function hex(value, width = 2) {
  return value.toString(16).padStart(width, '0');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function loadRom(romPath) {
  const rom = fs.readFileSync(romPath);
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') {
    throw new Error('ROM is not an iNES image');
  }
  const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
  const prgStart = 16 + trainerSize;
  const prgSize = rom[4] * 0x4000;
  if (prgSize === 0 || prgStart + prgSize > rom.length) {
    throw new Error('ROM has invalid PRG data');
  }
  return {
    rom,
    prg: rom.subarray(prgStart, prgStart + prgSize),
    sha256: sha256(rom),
    mapper: (rom[7] & 0xf0) | (rom[6] >> 4),
  };
}

function parseAddress(addressText) {
  const normalized = addressText.replace(/^\$/, '');
  const address = Number.parseInt(normalized, 16);
  if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
    throw new Error(`invalid CPU address: ${addressText}`);
  }
  return address;
}

function sourceOffset(bank, cpuAddress, prgLength) {
  const bankSize = 0x4000;
  const addressBase = bank === Math.floor(prgLength / bankSize) - 1 ? 0xc000 : 0x8000;
  if (cpuAddress < addressBase || cpuAddress >= addressBase + bankSize) {
    throw new Error(`CPU address $${hex(cpuAddress, 4)} is outside bank ${bank}`);
  }
  return bank * bankSize + cpuAddress - addressBase;
}

function readStream(prg, offset, maximumLength = 0x400) {
  const bytes = [];
  for (let index = 0; index < maximumLength && offset + index < prg.length; index += 1) {
    bytes.push(prg[offset + index]);
    if (index > 0 && bytes[index - 1] === 0x00 && bytes[index] === 0x81) return bytes;
  }
  throw new Error(`stream at PRG offset $${hex(offset, 5)} has no 00 81 terminator`);
}

function composeStreams(streams) {
  if (streams.length === 0) return [];
  return streams.flatMap((stream, index) => index === streams.length - 1 ? stream : stream.slice(0, -2));
}

function glyph(value) {
  if (value >= 0x01 && value <= 0x09) return String(value);
  if (value >= 0x0a && value <= 0x23) return String.fromCharCode(0x41 + value - 0x0a);
  if (value === 0x24) return ' ';
  if (value === 0x2b) return '+';
  if (value === 0x2d) return '-';
  if (value === 0x2e) return '.';
  return `{${hex(value)}}`;
}

function decodeGlyphs(bytes) {
  return bytes.map(glyph).join('');
}

function record(kind, start, end, raw, fields = {}) {
  return { kind, start, end, raw: [...raw], ...fields };
}

function parseDirectStream(bytes) {
  const records = [];
  let cursor = 0;
  let terminated = false;

  while (cursor < bytes.length) {
    const start = cursor;
    if (bytes[cursor] !== 0x00) {
      const dataStart = cursor;
      while (cursor < bytes.length && bytes[cursor] !== 0x00) cursor += 1;
      const data = bytes.slice(dataStart, cursor);
      records.push(record('direct-write-run', start, cursor, data, {
        data,
        decoded: decodeGlyphs(data),
      }));
      continue;
    }

    if (cursor + 1 >= bytes.length) throw new Error(`truncated control at byte ${cursor}`);
    const control = bytes[cursor + 1];
    if (control === 0x81) {
      records.push(record('end', start, cursor + 2, bytes.slice(start, cursor + 2), { control }));
      cursor += 2;
      terminated = true;
      break;
    }

    if (control === 0x82) {
      if (cursor + 3 >= bytes.length) throw new Error(`truncated indirect control at byte ${cursor}`);
      const pointer = bytes[cursor + 2] | (bytes[cursor + 3] << 8);
      records.push(record('indirect-stream', start, cursor + 4, bytes.slice(start, cursor + 4), {
        control,
        pointer,
      }));
      cursor += 4;
      continue;
    }

    if (control === 0x80 || control === 0x83) {
      records.push(record(control === 0x80 ? 'zero-write' : 'return-control', start, cursor + 2, bytes.slice(start, cursor + 2), { control }));
      cursor += 2;
      continue;
    }

    if (control === 0x84) {
      if (cursor + 3 >= bytes.length) throw new Error(`truncated fill control at byte ${cursor}`);
      const fillStart = bytes[cursor + 2];
      const fillEnd = bytes[cursor + 3];
      records.push(record('fill-range', start, cursor + 4, bytes.slice(start, cursor + 4), {
        control,
        fillStart,
        fillEnd,
      }));
      cursor += 4;
      continue;
    }

    if (control >= 0xc0) {
      if (cursor + 2 >= bytes.length) throw new Error(`truncated repeat control at byte ${cursor}`);
      const count = (control & 0x3f) || 0x100;
      const data = bytes[cursor + 2];
      records.push(record('repeat-write', start, cursor + 3, bytes.slice(start, cursor + 3), {
        control,
        count,
        data,
        decoded: decodeGlyphs([data]),
      }));
      cursor += 3;
      continue;
    }

    if (control >= 0x85 && control < 0xc0) {
      if (cursor + 6 >= bytes.length) throw new Error(`truncated address/read/fill control at byte ${cursor}`);
      const addressHigh = bytes[cursor + 2];
      const addressLow = bytes[cursor + 3];
      const readSlot = bytes[cursor + 4];
      const fillStart = bytes[cursor + 5];
      const fillEnd = bytes[cursor + 6];
      records.push(record('address-read-fill', start, cursor + 7, bytes.slice(start, cursor + 7), {
        control,
        address: (addressHigh << 8) | addressLow,
        addressHigh,
        addressLow,
        readSlot,
        fillStart,
        fillEnd,
      }));
      cursor += 7;
      continue;
    }

    if (control < 0x80) {
      if (cursor + 2 >= bytes.length) throw new Error(`truncated address-set control at byte ${cursor}`);
      const addressHigh = control & 0x3f;
      const addressLow = bytes[cursor + 2];
      records.push(record('address-set', start, cursor + 3, bytes.slice(start, cursor + 3), {
        control,
        ppuControl: (control & 0x40) !== 0 ? 0x24 : 0x20,
        address: (addressHigh << 8) | addressLow,
        addressHigh,
        addressLow,
      }));
      cursor += 3;
      continue;
    }

    records.push(record('unknown-control', start, cursor + 2, bytes.slice(start, cursor + 2), { control }));
    cursor += 2;
  }

  if (!terminated) throw new Error('stream did not reach 00 81 terminator');
  return {
    raw: [...bytes.slice(0, cursor)],
    records,
    roundTrip: records.flatMap(item => item.raw),
    visibleRuns: records
      .filter(item => item.kind === 'direct-write-run')
      .map(item => ({ start: item.start, end: item.end, data: item.data, decoded: item.decoded })),
  };
}

function decodeSource(romPath, bank, cpuAddress) {
  const image = loadRom(romPath);
  const offset = sourceOffset(bank, cpuAddress, image.prg.length);
  const raw = readStream(image.prg, offset);
  const parsed = parseDirectStream(raw);
  return {
    rom: path.basename(romPath),
    sha256: image.sha256,
    mapper: image.mapper,
    bank,
    cpuAddress: `0x${hex(cpuAddress, 4)}`,
    prgOffset: `0x${hex(offset, 5)}`,
    rawHex: raw.map(value => hex(value)).join(' '),
    ...parsed,
  };
}

function decodeSources(romPath, bank, cpuAddresses) {
  const image = loadRom(romPath);
  const sources = cpuAddresses.map(cpuAddress => {
    const offset = sourceOffset(bank, cpuAddress, image.prg.length);
    const raw = readStream(image.prg, offset);
    return {
      cpuAddress: `0x${hex(cpuAddress, 4)}`,
      prgOffset: `0x${hex(offset, 5)}`,
      raw,
      rawHex: raw.map(value => hex(value)).join(' '),
    };
  });
  const raw = composeStreams(sources.map(source => source.raw));
  return {
    rom: path.basename(romPath),
    sha256: image.sha256,
    mapper: image.mapper,
    bank,
    sources,
    raw,
    rawHex: raw.map(value => hex(value)).join(' '),
    ...parseDirectStream(raw),
  };
}

function argumentValue(prefix, fallback) {
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const romPath = path.resolve(process.argv[2] ?? DEFAULT_ROM);
  const bank = Number.parseInt(argumentValue('--bank=', '0'), 10);
  const cpuAddress = parseAddress(argumentValue('--cpu=', '8dc5'));
  console.log(JSON.stringify(decodeSource(romPath, bank, cpuAddress), null, 2));
}

export {
  composeStreams,
  decodeGlyphs,
  decodeSource,
  decodeSources,
  loadRom,
  parseDirectStream,
  parseAddress,
  readStream,
  sourceOffset,
};