import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { compileGmod, readJsonc, validateCatalog, verifyProfileAgainstRom } from './game-profile.mjs';

const OPENING_UNIT_ID = 'opening.narration.0001';
const OPENING_LINE_SLOTS = [
  [...range(0x6040, 0x6044), ...range(0x6046, 0x6051)],
  range(0x6053, 0x6061),
  range(0x6062, 0x606c),
  range(0x606e, 0x607e),
];
const OPENING_NAMETABLE_ADDRESS = 0x2269;
const FONT_CHR_BASE = 0x00000;
const FIRST_TRANSLATION_TILE = 0x02;
const LAST_TRANSLATION_TILE = 0x3f;
const PIXEL_FONT_URL = 'https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.08.11/fusion-pixel-font-8px-monospaced-bdf-v2026.08.11.zip';
const PIXEL_FONT_SHA256 = '8e2147c08c76f99d1e670bf6ad30b35787a1fb6a8e69626a73c8f4705249a69e';
const PIXEL_FONT_CACHE = process.env.H5_NES_PIXEL_FONT
  ?? path.join(os.tmpdir(), 'h5-nes-fonts', 'fusion-pixel-8px-monospaced-zh_hant.bdf');
const TALL_PIXEL_FONT_URL = 'https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.08.11/fusion-pixel-font-10px-monospaced-bdf-v2026.08.11.zip';
const TALL_PIXEL_FONT_SHA256 = '220c6f337be0a983f8a1068beec57970fc18baf20f5302f4ee3fccac9e1f7e1e';
const TALL_PIXEL_FONT_CACHE = process.env.H5_NES_TALL_PIXEL_FONT
  ?? path.join(os.tmpdir(), 'h5-nes-fonts', 'fusion-pixel-10px-monospaced-zh_hant.bdf');

let pixelFontText;
let tallPixelFontText;

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

async function loadPixelFont() {
  if (pixelFontText) return pixelFontText;
  try {
    pixelFontText = await fs.readFile(PIXEL_FONT_CACHE, 'utf8');
    return pixelFontText;
  } catch (error) {
    if (error.code !== 'ENOENT' || process.env.H5_NES_PIXEL_FONT) throw error;
  }

  const response = await fetch(PIXEL_FONT_URL);
  if (!response.ok) throw new Error(`Unable to download pixel font: HTTP ${response.status}`);
  const archiveBytes = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash('sha256').update(archiveBytes).digest('hex');
  if (digest !== PIXEL_FONT_SHA256) throw new Error('Downloaded pixel font checksum does not match');
  const archive = await JSZip.loadAsync(archiveBytes);
  const fontFile = Object.values(archive.files).find(file => file.name.endsWith('fusion-pixel-8px-monospaced-zh_hant.bdf'));
  if (!fontFile) throw new Error('Traditional Chinese BDF is missing from the pixel font archive');
  pixelFontText = (await fontFile.async('string')).replaceAll('\r\n', '\n');
  await fs.mkdir(path.dirname(PIXEL_FONT_CACHE), { recursive: true });
  await fs.writeFile(PIXEL_FONT_CACHE, pixelFontText);
  return pixelFontText;
}

async function loadTallPixelFont() {
  if (tallPixelFontText) return tallPixelFontText;
  try {
    tallPixelFontText = await fs.readFile(TALL_PIXEL_FONT_CACHE, 'utf8');
    return tallPixelFontText;
  } catch (error) {
    if (error.code !== 'ENOENT' || process.env.H5_NES_TALL_PIXEL_FONT) throw error;
  }

  const response = await fetch(TALL_PIXEL_FONT_URL);
  if (!response.ok) throw new Error(`Unable to download tall pixel font: HTTP ${response.status}`);
  const archiveBytes = Buffer.from(await response.arrayBuffer());
  const digest = crypto.createHash('sha256').update(archiveBytes).digest('hex');
  if (digest !== TALL_PIXEL_FONT_SHA256) throw new Error('Downloaded tall pixel font checksum does not match');
  const archive = await JSZip.loadAsync(archiveBytes);
  const fontFile = Object.values(archive.files).find(file => file.name.endsWith('fusion-pixel-10px-monospaced-zh_hant.bdf'));
  if (!fontFile) throw new Error('Tall Traditional Chinese BDF is missing from the pixel font archive');
  tallPixelFontText = (await fontFile.async('string')).replaceAll('\r\n', '\n');
  await fs.mkdir(path.dirname(TALL_PIXEL_FONT_CACHE), { recursive: true });
  await fs.writeFile(TALL_PIXEL_FONT_CACHE, tallPixelFontText);
  return tallPixelFontText;
}

function readBdfGlyph(fontText, character, expectedSize) {
  const marker = `\nENCODING ${character.codePointAt(0)}\n`;
  const encodingIndex = fontText.indexOf(marker);
  if (encodingIndex < 0) throw new Error(`Pixel font has no glyph for ${character}`);
  const bitmapIndex = fontText.indexOf('\nBITMAP\n', encodingIndex);
  const endIndex = fontText.indexOf('\nENDCHAR', bitmapIndex);
  if (bitmapIndex < 0 || endIndex < 0) throw new Error(`Pixel font glyph ${character} is malformed`);
  const glyphHeader = fontText.slice(encodingIndex, bitmapIndex);
  const fontBoundingBox = fontText.match(/^FONTBOUNDINGBOX (\d+) (\d+) (-?\d+) (-?\d+)$/m);
  const boundingBox = glyphHeader.match(/\nBBX (\d+) (\d+) (-?\d+) (-?\d+)$/);
  const hexRows = fontText.slice(bitmapIndex + 8, endIndex).trim().split('\n');
  const glyphRows = hexRows.map(row => parseInt(row, 16));
  if (!fontBoundingBox || !boundingBox
      || Number(fontBoundingBox[1]) !== expectedSize
      || Number(fontBoundingBox[2]) !== expectedSize
      || Number(boundingBox[1]) > expectedSize
      || Number(boundingBox[2]) > expectedSize
      || glyphRows.length !== Number(boundingBox[2])
      || glyphRows.some(row => !Number.isSafeInteger(row) || row < 0)) {
    throw new Error(`Pixel font glyph ${character} does not fit a ${expectedSize}x${expectedSize} bitmap`);
  }
  const glyphWidth = Number(boundingBox[1]);
  const glyphHeight = Number(boundingBox[2]);
  const glyphYOffset = Number(boundingBox[4]);
  const fontYOffset = Number(fontBoundingBox[4]);
  const left = Math.floor((expectedSize - glyphWidth) / 2);
  const top = expectedSize + fontYOffset - glyphHeight - glyphYOffset;
  const rows = Array(expectedSize).fill(0);
  glyphRows.forEach((row, index) => {
    const normalized = row >> (hexRows[index].length * 4 - glyphWidth);
    rows[top + index] = normalized << (expectedSize - glyphWidth - left);
  });
  return rows;
}

function inspectInes(rom) {
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') {
    throw new Error('ROM is not an iNES image');
  }
  const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
  const prgStart = 16 + trainerSize;
  const prgSize = rom[4] * 16 * 1024;
  const chrSize = rom[5] * 8 * 1024;
  if (prgSize === 0 || chrSize === 0 || prgStart + prgSize + chrSize > rom.length) {
    throw new Error('ROM has invalid PRG or CHR data');
  }
  return { prgStart, prgSize, chrStart: prgStart + prgSize, chrSize };
}

export async function buildTranslatedDictionaryRom(
  sourceBytes,
  adapter,
  compiled,
  rasterize = rasterizeNesGlyph,
) {
  const source = Buffer.from(sourceBytes);
  const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
  const acceptedSourceHashes = adapter.sourceRoms.map(candidate => candidate.sha256.toLowerCase());
  const compiledSourceSha256 = typeof compiled?.sourceSha256 === 'string'
    ? compiled.sourceSha256.toLowerCase()
    : '';
  if (!acceptedSourceHashes.includes(sourceSha256)
      || compiled?.adapterId !== adapter.adapterId
      || !compiled?.dictionaryId
      || !acceptedSourceHashes.includes(compiledSourceSha256)
      || !Array.isArray(compiled.records)
      || !Array.isArray(compiled.overlays)) {
    throw new Error('Compiled dictionary does not match the source ROM or adapter');
  }
  const { prgStart, prgSize, chrStart, chrSize } = inspectInes(source);
  const target = Buffer.from(source);
  const offsets = new Set();
  const recordRanges = new Map();
  for (const record of compiled.records) {
    if (!record?.id || !Number.isInteger(record.physicalPrgOffset) || record.physicalPrgOffset < 0
        || !Array.isArray(record.sourceBytes) || !Array.isArray(record.rawBytes)
        || record.sourceBytes.length !== record.rawBytes.length || record.rawBytes.length < 1
        || record.rawBytes.at(-1) !== compiled.recordTerminator
        || record.physicalPrgOffset + record.rawBytes.length > prgSize) {
      throw new Error(`Compiled dictionary has an invalid record ${record?.id ?? '<unknown>'}`);
    }
    const key = record.physicalPrgOffset;
    if (recordRanges.has(key)) throw new Error(`Compiled dictionary has duplicate record offset ${key}`);
    for (const existing of recordRanges.values()) {
      const overlaps = key < existing.physicalPrgOffset + existing.rawBytes.length
        && existing.physicalPrgOffset < key + record.rawBytes.length;
      if (overlaps) throw new Error(`Compiled dictionary records overlap at ${key}`);
    }
    recordRanges.set(key, record);
    for (let index = 0; index < record.rawBytes.length; index += 1) {
      const sourceValue = record.sourceBytes[index];
      const targetValue = record.rawBytes[index];
      if (![sourceValue, targetValue].every(value => Number.isInteger(value) && value >= 0 && value <= 255)
          || source[prgStart + key + index] !== sourceValue) {
        throw new Error(`Compiled dictionary record ${record.id} does not match source bytes`);
      }
    }
  }
  for (const overlay of compiled.overlays) {
    if (!overlay?.id || !Number.isInteger(overlay.offset) || overlay.offset < 0
        || overlay.offset >= prgSize || offsets.has(overlay.offset)
        || !Number.isInteger(overlay.expectedOriginal) || overlay.expectedOriginal < 0 || overlay.expectedOriginal > 255
        || !Number.isInteger(overlay.value) || overlay.value < 0 || overlay.value > 255) {
      throw new Error(`Compiled dictionary has an invalid PRG overlay ${overlay?.id ?? '<unknown>'}`);
    }
    offsets.add(overlay.offset);
    const record = [...recordRanges.values()].find(candidate => (
      overlay.offset >= candidate.physicalPrgOffset
      && overlay.offset < candidate.physicalPrgOffset + candidate.rawBytes.length
    ));
    if (!record) throw new Error(`Dictionary overlay ${overlay.id} is outside compiled records`);
    const recordOffset = overlay.offset - record.physicalPrgOffset;
    if (record.rawBytes[recordOffset] !== overlay.value) {
      throw new Error(`Dictionary overlay ${overlay.id} disagrees with its compiled record`);
    }
    if (source[prgStart + overlay.offset] !== overlay.expectedOriginal) {
      throw new Error(`Dictionary overlay ${overlay.id} expected 0x${overlay.expectedOriginal.toString(16).padStart(2, '0')}, found 0x${source[prgStart + overlay.offset].toString(16).padStart(2, '0')}`);
    }
    target[prgStart + overlay.offset] = overlay.value;
  }
  for (const record of recordRanges.values()) {
    for (let index = 0; index < record.rawBytes.length; index += 1) {
      const offset = record.physicalPrgOffset + index;
      const changed = record.sourceBytes[index] !== record.rawBytes[index];
      if (changed !== offsets.has(offset)) {
        throw new Error(`Compiled dictionary overlay set is incomplete for ${record.id}`);
      }
    }
  }
  const glyphCodes = new Set();
  let chrOverlayCount = 0;
  for (const glyph of compiled.glyphs ?? []) {
    if (!glyph?.character || [...glyph.character].length !== 1
        || !Number.isInteger(glyph.code) || glyph.code < 0 || glyph.code > 0xd8
        || glyphCodes.has(glyph.code) || (glyph.code === 0 && glyph.character !== ' ')) {
      throw new Error(`Compiled dictionary has an invalid glyph ${glyph?.character ?? '<unknown>'}`);
    }
    glyphCodes.add(glyph.code);
    if (glyph.code === 0) continue;
    const tile = Buffer.from(await rasterize(glyph.character));
    if (tile.length !== 16) throw new Error(`Dictionary glyph ${glyph.character} is not one NES tile`);
    const tileOffset = glyph.code * 16;
    if (tileOffset + tile.length > chrSize) {
      throw new Error(`Dictionary glyph ${glyph.character} is outside CHR ROM`);
    }
    for (let byteIndex = 0; byteIndex < tile.length; byteIndex += 1) {
      const offset = tileOffset + byteIndex;
      if (source[chrStart + offset] === tile[byteIndex]) continue;
      target[chrStart + offset] = tile[byteIndex];
      chrOverlayCount += 1;
    }
  }
  return {
    targetRom: target,
    sourceSha256,
    targetSha256: crypto.createHash('sha256').update(target).digest('hex'),
    overlayCount: offsets.size,
    chrOverlayCount,
  };
}

export async function rasterizeNesGlyph(character) {
  const rows = readBdfGlyph(await loadPixelFont(), character, 8);
  return [...rows, ...rows];
}

export async function rasterizeNesTallGlyph(character) {
  const sourceRows = readBdfGlyph(await loadTallPixelFont(), character, 10);
  const rows = sourceRows.map(row => {
    let scaled = 0;
    for (let targetX = 0; targetX < 8; targetX++) {
      const sourceX = Math.round(targetX * 9 / 7);
      scaled |= ((row >> (9 - sourceX)) & 1) << (7 - targetX);
    }
    return scaled;
  });
  const cellRows = [0, 0, 0, ...rows, 0, 0, 0];
  const upperRows = cellRows.slice(0, 8);
  const lowerRows = cellRows.slice(8);
  return [...upperRows, ...upperRows, ...lowerRows, ...lowerRows];
}

export async function buildCaptainTsubasa2Profile(baseProfile, catalog, rom) {
  verifyProfileAgainstRom(baseProfile, rom);
  validateCatalog(catalog);
  const unit = catalog.units.find(candidate => candidate.id === OPENING_UNIT_ID);
  if (!unit?.target) throw new Error(`Translation unit ${OPENING_UNIT_ID} has no target text`);

  const lines = unit.target.split('\n');
  if (lines.length > OPENING_LINE_SLOTS.length) throw new Error('Opening translation exceeds four lines');
  lines.forEach((line, index) => {
    if ([...line].length > OPENING_LINE_SLOTS[index].length) {
      throw new Error(`Opening translation line ${index + 1} exceeds ${OPENING_LINE_SLOTS[index].length} tiles`);
    }
  });

  const characters = [...new Set(lines.flatMap(line => [...line]))];
  if (FIRST_TRANSLATION_TILE + characters.length - 1 > LAST_TRANSLATION_TILE) {
    throw new Error('Opening translation has too many unique glyphs for its NES font page');
  }
  const tileByCharacter = new Map(characters.map((character, index) => [
    character,
    FIRST_TRANSLATION_TILE + index,
  ]));

  const prgStart = 16 + ((rom[6] & 0x04) !== 0 ? 512 : 0);
  const prgSize = rom[4] * 16 * 1024;
  const chrStart = prgStart + prgSize;
  const prgReadOverlays = [];
  for (let lineIndex = 0; lineIndex < OPENING_LINE_SLOTS.length; lineIndex++) {
    const encoded = [...(lines[lineIndex] ?? '')].map(character => tileByCharacter.get(character));
    for (let slotIndex = 0; slotIndex < OPENING_LINE_SLOTS[lineIndex].length; slotIndex++) {
      const offset = OPENING_LINE_SLOTS[lineIndex][slotIndex];
      const value = encoded[slotIndex] ?? 0x00;
      if (rom[prgStart + offset] === value) continue;
      prgReadOverlays.push({
        id: `opening-text-${lineIndex + 1}-${slotIndex + 1}`,
        offset,
        expectedOriginal: rom[prgStart + offset],
        value,
      });
    }
  }

  const chrOverlays = [];
  for (const [character, tile] of tileByCharacter) {
    const tileBytes = await rasterizeNesGlyph(character);
    const tileOffset = FONT_CHR_BASE + tile * 16;
    for (let byteIndex = 0; byteIndex < tileBytes.length; byteIndex++) {
      const offset = tileOffset + byteIndex;
      if (rom[chrStart + offset] === tileBytes[byteIndex]) continue;
      chrOverlays.push({
        id: `opening-glyph-${tile.toString(16)}-${byteIndex}`,
        offset,
        expectedOriginal: rom[chrStart + offset],
        value: tileBytes[byteIndex],
      });
    }
  }

  return {
    ...baseProfile,
    prgReadOverlays: [...(baseProfile.prgReadOverlays ?? []), ...prgReadOverlays],
    chrOverlayPages: [
      ...(baseProfile.chrOverlayPages ?? []),
      {
        id: 'opening-narration-0001-font',
        guard: {
          address: OPENING_NAMETABLE_ADDRESS,
          value: FIRST_TRANSLATION_TILE,
          requireActiveTable: true,
        },
        overlays: chrOverlays,
      },
    ],
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const profilePath = path.join(root, 'game-profiles/captain-tsubasa-2-jp/runtime.jsonc');
  const catalogPath = path.join(root, 'game-profiles/captain-tsubasa-2-jp/translations.json');
  const romPath = process.argv[2] ?? path.join(root, 'roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const outputPath = process.argv[3]
    ?? path.join(root, 'public/game-profiles/captain-tsubasa-2-jp/captain-tsubasa-2-jp.gmod');
  const [catalog, rom] = await Promise.all([
    fs.readFile(catalogPath, 'utf8').then(JSON.parse),
    fs.readFile(romPath),
  ]);
  const profile = await buildCaptainTsubasa2Profile(readJsonc(profilePath), catalog, rom);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await compileGmod(profile));
  console.log(`Compiled ${profile.id}: ${profile.prgReadOverlays.length} PRG bytes, ${profile.chrOverlayPages[0].overlays.length} CHR bytes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}