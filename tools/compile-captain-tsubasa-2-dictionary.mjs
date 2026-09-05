import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { compileGmod, readJsonc } from './game-profile.mjs';
import {
  buildTranslatedDictionaryRom,
  rasterizeNesGlyph,
} from './compile-captain-tsubasa-2.mjs';
import { createBpsPatch } from './compile-captain-tsubasa-2-opening.mjs';

async function readSourceRom(filePath) {
  const bytes = await fs.readFile(filePath);
  if (path.extname(filePath).toLowerCase() !== '.zip') return bytes;
  const archive = await JSZip.loadAsync(bytes);
  const romFile = Object.values(archive.files).find(
    file => !file.dir && file.name.toLowerCase().endsWith('.nes'),
  );
  if (!romFile) throw new Error(`ZIP ${filePath} contains no NES ROM`);
  return Buffer.from(await romFile.async('uint8array'));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const romPath = process.argv[2]
    ?? path.join(root, 'roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const compiledPath = process.argv[3]
    ?? path.join(root, 'artifacts/captain-tsubasa-2-fixed-bank-words-compiled.json');
  const outputPath = process.argv[4]
    ?? path.join(root, 'public/game-profiles/captain-tsubasa-2-jp/captain-tsubasa-2-fixed-bank-words-zh-Hant.gmod');
  const [source, compiled] = await Promise.all([
    readSourceRom(romPath),
    fs.readFile(compiledPath, 'utf8').then(JSON.parse),
  ]);
  const adapter = readJsonc(path.join(root, 'game-profiles/captain-tsubasa-2-jp/adapter.jsonc'));
  const profile = readJsonc(path.join(root, 'game-profiles/captain-tsubasa-2-jp/runtime.jsonc'));
  const built = await buildTranslatedDictionaryRom(source, adapter, compiled, rasterizeNesGlyph);
  const patchBytes = createBpsPatch(source, built.targetRom);
  const gmod = await compileGmod(profile, null, {
    sourceRomBytes: source,
    targetRomBytes: built.targetRom,
    patchBytes,
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, gmod);
  console.log(`Built ${path.basename(outputPath)}: ${built.overlayCount} PRG bytes, ${built.chrOverlayCount} CHR bytes, ${patchBytes.length} BPS bytes, target ${built.targetSha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
