import { ARCADE_METADATA } from './arcade';
import { CONSOLE_METADATA } from './consoles';
import { NES_METADATA } from './nes';
import type { RomMagazineMeta, RomMetadataInput, RomMetadataTable } from './types';

export type { RomMagazineMeta, RomMetadataInput } from './types';

const UNKNOWN_META: RomMagazineMeta = {
  year: '年代不詳',
  genre: 'ARCHIVE',
  players: '未收錄',
};

const ROCKMAN_YEARS: Record<string, string> = {
  '1': '1987', '2': '1988', '3': '1990', '4': '1991',
  '5': '1992', '6': '1993', '7': '2008',
};

function normalizeIdentity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s._\-()[\]{}'’"!?！？:：,+/\\]/g, '');
}

function tableFor(input: RomMetadataInput): RomMetadataTable {
  if (input.system === 'nes') return NES_METADATA;
  if (input.system === 'arcade') return ARCADE_METADATA;
  return CONSOLE_METADATA;
}

function findNormalized(table: RomMetadataTable, name: string): RomMagazineMeta | undefined {
  const target = normalizeIdentity(name);
  for (const key in table) {
    if (normalizeIdentity(key) === target) return table[key];
  }
  return undefined;
}

function findSeriesAlias(identity: string): RomMagazineMeta | undefined {
  const rockman = identity.match(/(?:洛克人|rockman|megaman)([1-7])(?![0-9])/);
  if (rockman) {
    return { year: ROCKMAN_YEARS[rockman[1]], genre: 'ACTION', players: '1' };
  }

  const finalFantasy = identity.match(/(?:太空戰士|最終幻想|finalfantasy)([1-6])(?![0-9])/);
  if (finalFantasy) {
    const years: Record<string, string> = {
      '1': '1987', '2': '1988', '3': '1990', '4': '1991', '5': '1992', '6': '1994',
    };
    return { year: years[finalFantasy[1]], genre: 'RPG', players: '1' };
  }

  const dragonQuest = identity.match(/(?:勇者鬥惡龍|dragonquest)([1-6])(?![0-9])/);
  if (dragonQuest) {
    const years: Record<string, string> = {
      '1': '1986', '2': '1987', '3': '1988', '4': '1990', '5': '1992', '6': '1995',
    };
    return { year: years[dragonQuest[1]], genre: 'RPG', players: '1' };
  }

  return undefined;
}

export function getRomMagazineMeta(input: RomMetadataInput): RomMagazineMeta {
  const table = tableFor(input);
  const exact = table[input.name] || findNormalized(table, input.name);
  if (exact) return exact;

  const alias = findSeriesAlias(normalizeIdentity(`${input.name} ${input.file}`));
  return alias || UNKNOWN_META;
}