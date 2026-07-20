import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

interface CatalogRom {
  name: string;
  file: string;
  system?: string;
}

interface CatalogFile {
  roms: CatalogRom[];
}

const rootDir = process.cwd();
const romsDir = resolve(rootDir, 'roms');
const catalog = JSON.parse(
  readFileSync(resolve(rootDir, 'public/roms.json'), 'utf8').replace(/^\uFEFF/, ''),
) as CatalogFile;
const publishedExtensions = new Set([
  '.nes', '.gb', '.gbc', '.gg', '.sms', '.smc', '.sfc', '.fig', '.z64', '.n64', '.v64', '.zip',
]);
const archiveSystemByExtension = new Map([
  ['.nes', 'nes'],
  ['.gb', 'gb'],
  ['.gbc', 'gb'],
  ['.gg', 'gg'],
  ['.sms', 'sms'],
  ['.smc', 'snes'],
  ['.sfc', 'snes'],
  ['.fig', 'snes'],
  ['.z64', 'n64'],
  ['.n64', 'n64'],
  ['.v64', 'n64'],
]);
const expectedSystemCounts = {
  nes: 30,
  gb: 6,
  gg: 4,
  sms: 1,
  snes: 44,
  arcade: 37,
  n64: 6,
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

describe('ROM catalog', () => {
  it('matches every publishable top-level ROM file exactly once', () => {
    const catalogFiles = catalog.roms.map(rom => rom.file).sort();
    const diskFiles = readdirSync(romsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && publishedExtensions.has(extensionOf(entry.name)))
      .map(entry => entry.name)
      .sort();

    expect(new Set(catalogFiles).size).toBe(catalogFiles.length);
    expect(catalogFiles).toEqual(diskFiles);
  });

  it('keeps the documented console totals in sync', () => {
    const counts = catalog.roms.reduce<Record<string, number>>((totals, rom) => {
      const system = rom.system ?? archiveSystemByExtension.get(extensionOf(rom.file));
      expect(system, `${rom.file} must map to a supported console`).toBeDefined();
      totals[system!] = (totals[system!] ?? 0) + 1;
      return totals;
    }, {});

    expect(counts).toEqual(expectedSystemCounts);
  });

  it('classifies each non-arcade ZIP by its contained ROM', async () => {
    const genericArchives = catalog.roms.filter(rom =>
      extensionOf(rom.file) === '.zip' && rom.system !== 'arcade' && !rom.name.includes('FBNeo Arcade'),
    );

    for (const rom of genericArchives) {
      const archive = await JSZip.loadAsync(readFileSync(resolve(romsDir, rom.file)));
      const containedRom = Object.values(archive.files).find(entry =>
        !entry.dir && archiveSystemByExtension.has(extensionOf(entry.name)),
      );

      expect(containedRom, `${rom.file} must contain a supported ROM`).toBeDefined();
      expect(rom.system, `${rom.file} must declare its console`).toBe(
        archiveSystemByExtension.get(extensionOf(containedRom!.name)),
      );
    }
  });
});