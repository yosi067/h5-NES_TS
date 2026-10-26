/**
 * 主機目錄、ROM 主機判定與遊戲顯示名稱／封面。
 */
import { getPublicAssetUrl } from '../app/assets';
import type { MachineInfo, RomInfo, SystemKey } from '../app/types';
import { isFbNeoArcadeRomName } from '../backends/fbneo/fbneo-games';
import { romCatalog } from '../lobby/lobby-view';

export const MACHINES: MachineInfo[] = [
  { key: 'nes', title: 'FC/NES', label: '經典中的經典，傳說的紅白機。', artClass: 'nes', artFile: 'nes.png', section: 'FEATURE', issue: 'VOL.01', year: '1983', page: '012' },
  { key: 'gb', title: 'Game Boy', label: '最想帶去學校還有躲在棉被裡玩的好東西。', artClass: 'gb', artFile: 'gb.png', section: 'SPECIAL', issue: 'NO.08', year: '1989', page: '024' },
  { key: 'snes', title: 'SFC 超任', label: '無數經典的超任，是你爸媽最想藏起來不讓你碰的東西。', artClass: 'snes', artFile: 'snes.png', section: 'CLASSIC', issue: 'VOL.16', year: '1990', page: '036' },
  { key: 'arcade', title: '大型電玩', label: '雜貨店外面那些有搖桿的街機，要投錢幣的那種。', artClass: 'arcade', artFile: 'arcade.png', section: 'ARCADE', issue: 'NO.88', year: '1992', page: '048' },
  { key: 'gg', title: 'Game Gear', label: '經典的彩色掌機還可以看電視，一次吃你六顆鹼性電池的小怪物。', artClass: 'gg', artFile: 'gg.png', section: 'RETRO', issue: 'VOL.06', year: '1990', page: '060' },
  { key: 'genesis', title: 'Mega Drive', label: '電動店總是會放這台讓音速小子跑一整天。', artClass: 'md', artFile: 'md.png', section: 'HARDWARE', issue: 'MD.88', year: '1988', page: '072' },
  { key: 'n64', title: 'Nintendo 64', label: '劃時代的 3D 主機，不過手機還跑不動，建議先在電腦上玩。', artClass: 'n64', artFile: 'n64.png', section: 'NEW', issue: 'VOL.64', year: '1996', page: '084' },
];


export const LOBBY_MARIO_ROM_FILE = '超级玛丽.nes';


export function isN64RomName(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.z64') || lower.endsWith('.n64') || lower.endsWith('.v64');
}


export function detectRomSystem(rom: RomInfo): SystemKey {
  const normalized = rom.system?.toLowerCase();
  if (normalized === 'fbneo' || normalized === 'arcade') return 'arcade';
  if (normalized === 'nes' || normalized === 'gb' || normalized === 'gg' || normalized === 'sms' || normalized === 'genesis' || normalized === 'snes' || normalized === 'n64') {
    return normalized;
  }

  const lower = rom.file.toLowerCase();
  if (isFbNeoArcadeRomName(rom.file)) return 'arcade';
  if (isN64RomName(rom.file)) return 'n64';
  if (lower.endsWith('.sfc') || lower.endsWith('.smc') || lower.endsWith('.fig')) return 'snes';
  if (lower.endsWith('.md') || lower.endsWith('.gen') || lower.endsWith('.smd')) return 'genesis';
  if (lower.endsWith('.sms')) return 'sms';
  if (lower.endsWith('.gg')) return 'gg';
  if (lower.endsWith('.gb') || lower.endsWith('.gbc')) return 'gb';
  return 'nes';
}


export function getRomDisplayName(rom: RomInfo): string {
  return rom.name
    .replace(/\s*\((?:NES|FC|GB|GBC|GG|SMS|MD|Mega\s+Drive|Genesis|SFC|SNES|N64|FBNeo\s+Arcade|Arcade)\)\s*$/i, '')
    .trim();
}


export function getRomCatalogEntry(filename: string, fallbackName = filename): RomInfo {
  return romCatalog.find(rom => rom.file === filename) ?? {
    name: fallbackName,
    file: filename,
  };
}


export function getRomCoverUrl(rom: RomInfo): string {
  if (!rom.cover) return '';
  if (/^(?:https?:|data:|blob:|\/)/i.test(rom.cover)) return rom.cover;
  return getPublicAssetUrl(rom.cover.replace(/^\/+/, ''));
}
