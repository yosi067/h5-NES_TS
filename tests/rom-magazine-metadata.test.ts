import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getRomMagazineMeta } from '../src/data/rom-metadata';

interface CatalogRom {
  name: string;
  file: string;
  system: string;
}

const catalog = JSON.parse(readFileSync('public/roms.json', 'utf8')) as { roms: CatalogRom[] };

describe('ROM magazine metadata', () => {
  it('covers every catalog entry with a year and genre', () => {
    const unresolved = catalog.roms.filter((rom) => {
      const meta = getRomMagazineMeta(rom);
      return !meta.year || !meta.genre || meta.genre === 'ARCHIVE';
    });

    expect(unresolved.map((rom) => rom.name)).toEqual([]);
    expect(catalog.roms).toHaveLength(209);
  });

  it.each(['Rockman 4', 'Mega Man 4', '洛克人4'])(
    'resolves series aliases such as %s',
    (name) => {
      expect(getRomMagazineMeta({ name, file: `${name}.zip`, system: 'nes' })).toEqual({
        year: '1991',
        genre: 'ACTION',
        players: '1',
      });
    },
  );

  it('labels every FC compilation as 1990年代', () => {
    const compilations = catalog.roms.filter(
      (rom) => rom.system === 'nes' && /合 1/.test(rom.name),
    );

    expect(compilations).toHaveLength(8);
    expect(compilations.map((rom) => getRomMagazineMeta(rom).year)).toEqual(
      Array(8).fill('1990年代'),
    );
  });
});