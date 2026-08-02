import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'public', 'roms.json');
const romsPath = path.join(root, 'roms');
const outputPath = path.join(root, 'artifacts', 'snes-rom-manifest.json');
const snesExtensions = new Set(['.sfc', '.smc', '.fig']);

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function readU16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function printableTitle(data, offset) {
  return Buffer.from(data.subarray(offset, offset + 21))
    .toString('ascii')
    .replace(/[\0\x01-\x1F\x7F-\xFF]/g, '')
    .trim();
}

function chipFor(mapMode, romType) {
  const mode = mapMode & 0x0F;
  if (mode === 0x03) return 'SA-1';
  if (romType === 0x43 || romType === 0x45) return 'S-DD1';
  if ([0x13, 0x14, 0x15, 0x1A].includes(romType)) return 'SuperFX';
  if (romType === 0xF5 || romType === 0xF9) return 'SPC7110';
  if (romType === 0xF3 && mode === 0x00) return 'CX4';
  if (romType >= 0x03 && romType <= 0x05 && [0x00, 0x01].includes(mode)) return 'DSP-1';
  return 'None';
}

function scoreHeader(data, mapOffset) {
  if (mapOffset + 0x20 > data.length) return null;

  const mapMode = data[mapOffset];
  const romType = data[mapOffset + 1];
  const headerOffset = mapOffset - 0x15;
  const candidateIsExHiRom = mapOffset === 0x40FFD5;
  const candidateIsHiRom = mapOffset === 0xFFD5;
  const mode = mapMode & 0x0F;
  let score = 0;

  if (candidateIsExHiRom ? mode === 0x05 : candidateIsHiRom ? [0x01, 0x05].includes(mode) : [0x00, 0x03].includes(mode)) {
    score += 10;
  }
  if (data[mapOffset + 2] >= 7 && data[mapOffset + 2] <= 13) score += 5;
  if (data[mapOffset + 3] <= 8) score += 3;
  if (romType <= 0x06 || [0x13, 0x14, 0x15, 0x1A, 0x43, 0x45, 0xF3, 0xF5, 0xF9].includes(romType)) {
    score += 3;
  }

  const complement = readU16LE(data, headerOffset + 0x1C);
  const checksum = readU16LE(data, headerOffset + 0x1E);
  if ((checksum ^ complement) === 0xFFFF) score += 20;

  const title = printableTitle(data, headerOffset);
  score += [...title].filter(character => character === ' ' || /[\x21-\x7E]/.test(character)).length;

  return {
    score,
    mapMode,
    romType,
    headerOffset,
    title,
    romSizeCode: data[mapOffset + 2],
    sramSizeCode: data[mapOffset + 3],
    region: data[mapOffset + 4],
    version: data[mapOffset + 6],
    complement,
    checksum,
    checksumValid: (checksum ^ complement) === 0xFFFF,
  };
}

function parseHeader(input) {
  const copierHeaderSize = input.length % 0x400 === 0x200 ? 0x200 : 0;
  const data = input.subarray(copierHeaderSize);
  const candidates = [0x7FD5, 0xFFD5, 0x40FFD5]
    .map(offset => scoreHeader(data, offset))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  const header = candidates[0];
  if (!header || header.score < 10) {
    return {
      status: 'no-header',
      bytes: input.length,
      sha256: sha256(input),
      copierHeaderSize,
    };
  }

  const mode = header.mapMode & 0x0F;
  const mapMode = mode === 0x03 ? 'SA1' : mode === 0x05 && header.headerOffset >= 0x40FFC0 ? 'ExHiROM' : mode === 0x01 ? 'HiROM' : 'LoROM';
  const enhancement = chipFor(header.mapMode, header.romType);
  return {
    status: 'ok',
    bytes: input.length,
    sha256: sha256(input),
    copierHeaderSize,
    mapMode,
    mapModeByte: header.mapMode,
    romType: header.romType,
    title: header.title,
    romSizeCode: header.romSizeCode,
    sramSizeCode: header.sramSizeCode,
    region: header.region,
    version: header.version,
    complement: header.complement,
    checksum: header.checksum,
    checksumValid: header.checksumValid,
    headerOffset: header.headerOffset,
    enhancement,
    nativeCoreSupported: ['None', 'DSP-1', 'CX4', 'SA-1', 'S-DD1'].includes(enhancement),
  };
}

async function readCatalogRom(file) {
  const filePath = path.join(romsPath, file);
  const extension = path.extname(file).toLowerCase();
  if (extension !== '.zip') {
    try {
      return { data: await readFile(filePath), archiveMember: null };
    } catch {
      return null;
    }
  }

  try {
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const members = Object.values(zip.files)
      .filter(entry => !entry.dir && snesExtensions.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (members.length === 0) return null;
    return {
      data: Buffer.from(await members[0].async('uint8array')),
      archiveMember: members[0].name,
    };
  } catch {
    return null;
  }
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const snesGames = catalog.roms.filter(rom => rom.system === 'snes');
const games = [];
for (const game of snesGames) {
  const rom = await readCatalogRom(game.file);
  if (!rom) {
    games.push({ name: game.name, file: game.file, status: 'missing' });
    continue;
  }
  games.push({
    name: game.name,
    file: game.file,
    archiveMember: rom.archiveMember,
    ...parseHeader(rom.data),
  });
}

const report = {
  catalogPath: path.relative(root, catalogPath),
  romsPath: path.relative(root, romsPath),
  count: games.length,
  statusCounts: Object.fromEntries(
    [...new Set(games.map(game => game.status))].sort().map(status => [
      status,
      games.filter(game => game.status === status).length,
    ]),
  ),
  enhancementCounts: Object.fromEntries(
    [...new Set(games.map(game => game.enhancement ?? 'missing'))].sort().map(enhancement => [
      enhancement,
      games.filter(game => (game.enhancement ?? 'missing') === enhancement).length,
    ]),
  ),
  games,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outputPath)} (${games.length} SNES catalog entries)`);
console.log(JSON.stringify({ statusCounts: report.statusCounts, enhancementCounts: report.enhancementCounts }, null, 2));