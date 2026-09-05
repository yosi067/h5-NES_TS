import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { compileGmod, readJsonc } from './game-profile.mjs';
import { rasterizeNesGlyph } from './compile-captain-tsubasa-2.mjs';

const require = createRequire(import.meta.url);
const RomPatcher = require('rom-patcher/rom-patcher-js/RomPatcher');
const BinFile = require('rom-patcher/rom-patcher-js/modules/BinFile');

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inspectInes(rom) {
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') fail('ROM is not an iNES image');
  const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
  const prgStart = 16 + trainerSize;
  const prgSize = rom[4] * 16 * 1024;
  const chrStart = prgStart + prgSize;
  const chrSize = rom[5] * 8 * 1024;
  if (prgSize === 0 || chrSize === 0 || chrStart + chrSize > rom.length) fail('ROM has invalid PRG or CHR data');
  return { prgStart, prgSize, chrStart, chrSize };
}

export async function buildTranslatedOpeningRom(sourceBytes, adapter, compiled, rasterize = rasterizeNesGlyph) {
  const source = Buffer.from(sourceBytes);
  const sourceSha256 = sha256(source);
  if (!adapter.sourceRoms.some(candidate => candidate.sha256 === sourceSha256)
      || compiled.adapterId !== adapter.adapterId
      || compiled.sceneId !== 'opening.intro.00') {
    fail('Compiled opening does not match the source ROM or adapter');
  }
  const { prgStart, prgSize, chrStart, chrSize } = inspectInes(source);
  if (!Array.isArray(compiled.rawBytes)
      || compiled.rawBytes.length !== compiled.encodedLength
      || compiled.physicalPrgOffset < 0
      || compiled.physicalPrgOffset + compiled.encodedLength > prgSize) {
    fail('Compiled opening has invalid PRG data');
  }
  const sourceScene = source.subarray(
    prgStart + compiled.physicalPrgOffset,
    prgStart + compiled.physicalPrgOffset + compiled.encodedLength,
  );
  if (sha256(sourceScene) !== compiled.sourceSceneSha256) fail('Source opening checksum does not match compiled evidence');

  const target = Buffer.from(source);
  Buffer.from(compiled.rawBytes).copy(target, prgStart + compiled.physicalPrgOffset);
  const codes = new Set();
  let fontBytes = 0;
  for (const glyph of compiled.glyphs ?? []) {
    if (!Number.isInteger(glyph.code) || glyph.code < 0 || glyph.code > 0x7f
        || codes.has(glyph.code) || [...glyph.character].length !== 1) {
      fail(`Compiled opening has invalid glyph code ${glyph.code}`);
    }
    codes.add(glyph.code);
    if (glyph.code === 0) {
      if (glyph.character !== ' ') fail('Glyph code 0 must remain a space');
      continue;
    }
    const tile = Buffer.from(await rasterize(glyph.character));
    if (tile.length !== 16) fail(`Glyph ${glyph.character} is not one NES tile`);
    const tileOffset = glyph.code * 16;
    if (tileOffset + 16 > chrSize) fail(`Glyph ${glyph.character} is outside CHR ROM`);
    tile.copy(target, chrStart + tileOffset);
    fontBytes += tile.length;
  }
  return {
    targetRom: target,
    sourceSha256,
    targetSha256: sha256(target),
    scriptBytes: compiled.rawBytes.length,
    glyphCount: codes.size - (codes.has(0) ? 1 : 0),
    fontBytes,
  };
}

async function readSourceRom(filePath) {
  const bytes = await fs.readFile(filePath);
  if (path.extname(filePath).toLowerCase() !== '.zip') return bytes;
  const archive = await JSZip.loadAsync(bytes);
  const romFile = Object.values(archive.files).find(
    file => !file.dir && file.name.toLowerCase().endsWith('.nes'),
  );
  if (!romFile) fail(`ZIP ${filePath} contains no NES ROM`);
  return Buffer.from(await romFile.async('uint8array'));
}

export function createBpsPatch(sourceBytes, targetBytes) {
  return Buffer.from(RomPatcher.createPatch(
    new BinFile(Uint8Array.from(sourceBytes)),
    new BinFile(Uint8Array.from(targetBytes)),
    'bps',
  ).export()._u8array);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const romPath = process.argv[2] ?? path.join(root, 'roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const outputPath = process.argv[3]
    ?? path.join(root, 'public/game-profiles/captain-tsubasa-2-jp/captain-tsubasa-2-opening-zh-Hant.gmod');
  const [source, compiled] = await Promise.all([
    readSourceRom(romPath),
    fs.readFile(path.join(root, 'artifacts/captain-tsubasa-2-opening-zh-Hant-compiled.json'), 'utf8').then(JSON.parse),
  ]);
  const adapter = readJsonc(path.join(root, 'game-profiles/captain-tsubasa-2-jp/adapter.jsonc'));
  const profile = readJsonc(path.join(root, 'game-profiles/captain-tsubasa-2-jp/runtime.jsonc'));
  const built = await buildTranslatedOpeningRom(source, adapter, compiled);
  const patchBytes = createBpsPatch(source, built.targetRom);
  const gmod = await compileGmod(profile, null, {
    sourceRomBytes: source,
    targetRomBytes: built.targetRom,
    patchBytes,
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, gmod);
  console.log(`Built ${path.basename(outputPath)}: ${built.scriptBytes} PRG bytes, ${built.glyphCount} glyphs, ${patchBytes.length} BPS bytes, target ${built.targetSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}