import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsDirectory, '..');
const catalogPath = path.join(projectRoot, 'public', 'roms.json');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const romDirectory = path.join(projectRoot, 'roms');
const strict = process.argv.includes('--strict');
const jsonOutput = process.argv.includes('--json');

const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const metadataData = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  : { games: {} };
const catalog = catalogData.roms.map(rom => ({
  ...rom,
  ...(metadataData.games?.[rom.file] ?? {}),
}));
const assetEntries = fs.readdirSync(romDirectory, { withFileTypes: true });
const assetNames = assetEntries.map(entry => entry.name);
const catalogFiles = catalog.map(rom => rom.file);
const catalogFileSet = new Set(catalogFiles);
const duplicateFiles = [...new Set(catalogFiles.filter((file, index) => catalogFiles.indexOf(file) !== index))];
const missingAssets = catalogFiles.filter(file => !assetNames.includes(file));
const unlistedAssets = assetNames.filter(file => !catalogFileSet.has(file));
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const withCover = catalog.filter(rom => hasText(rom.cover));
const withDescription = catalog.filter(rom => hasText(rom.description));
const withSources = catalog.filter(rom => hasText(rom.coverSource) && hasText(rom.descriptionSource));
const verified = catalog.filter(rom => rom.verified === true);
const complete = catalog.filter(rom => hasText(rom.cover) && hasText(rom.description) && rom.verified === true);
const systems = catalog.reduce((counts, rom) => {
  const system = rom.system || 'unset';
  counts[system] = (counts[system] || 0) + 1;
  return counts;
}, {});
const cartridgeCount = catalog.filter(rom => rom.cartridge !== false && rom.system !== 'arcade').length;

const report = {
  catalogEntries: catalog.length,
  romAssets: assetNames.length,
  fileAssets: assetEntries.filter(entry => entry.isFile()).length,
  directoryAssets: assetEntries.filter(entry => entry.isDirectory()).length,
  systems,
  cartridgeEntries: cartridgeCount,
  arcadeEntries: catalog.length - cartridgeCount,
  coverage: {
    cover: { count: withCover.length, total: catalog.length, missing: catalog.length - withCover.length },
    description: { count: withDescription.length, total: catalog.length, missing: catalog.length - withDescription.length },
    sources: { count: withSources.length, total: catalog.length, missing: catalog.length - withSources.length },
    verified: { count: verified.length, total: catalog.length, missing: catalog.length - verified.length },
    complete: { count: complete.length, total: catalog.length, missing: catalog.length - complete.length },
  },
  integrity: {
    missingAssets,
    unlistedAssets,
    duplicateFiles,
  },
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Game catalog audit');
  console.log(`Catalog entries: ${report.catalogEntries}`);
  console.log(`ROM assets: ${report.romAssets} (${report.fileAssets} files, ${report.directoryAssets} directories)`);
  console.log(`Cartridge entries: ${report.cartridgeEntries}`);
  console.log(`Arcade entries: ${report.arcadeEntries}`);
  console.log(`Cover coverage: ${report.coverage.cover.count}/${report.catalogEntries}`);
  console.log(`Description coverage: ${report.coverage.description.count}/${report.catalogEntries}`);
  console.log(`Source coverage: ${report.coverage.sources.count}/${report.catalogEntries}`);
  console.log(`Verified records: ${report.coverage.verified.count}/${report.catalogEntries}`);
  console.log(`Complete records: ${report.coverage.complete.count}/${report.catalogEntries}`);
  console.log(`Catalog entries without assets: ${missingAssets.length}`);
  console.log(`Assets not listed in catalog: ${unlistedAssets.length}`);
  console.log(`Duplicate catalog filenames: ${duplicateFiles.length}`);
  if (unlistedAssets.length > 0) console.log(`Unlisted assets: ${unlistedAssets.join(', ')}`);
}

const hasIntegrityIssue = missingAssets.length > 0 || unlistedAssets.length > 0 || duplicateFiles.length > 0;
const hasMetadataIssue = complete.length !== catalog.length;
if (strict && (hasIntegrityIssue || hasMetadataIssue)) process.exitCode = 1;
