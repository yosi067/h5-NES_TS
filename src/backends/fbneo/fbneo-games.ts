/**
 * FBNeo 支援的街機遊戲清單與畫面方向。
 */

const FBNEO_SUPPORTED_GAMES = [
  'ddonpach',
  'ddp2100',
  'garou',
  'knights',
  'nbbatman',
  'nbbatmanu',
  'kof2000',
  'kof2001',
  'kof2003',
  'kof94',
  'kof95',
  'kof96',
  'kof97',
  'kof98',
  'ms5pcb',
  'samsho2',
  'samsho4',
  'samshoh',
  'mslug',
  'mslug2t',
  'mslug3',
  'mslug4',
  'mslug3b6',
  'neocup98',
  'kof2002',
  'rbffspec',
  'samsh5sp',
  'samsho5',
  'sengoku3',
  'sonicwi3',
  'svc',
  'pacman',
  'tetris',
  'outrun',
  'shinobi',
  'strider',
  'raiden',
  'wof',
  'ffight',
  'dino',
  'captcomm',
  'punisher',
  'tmnt',
  'simpsons',
  'ssriders',
  'snowbros',
  'bublbobl',
  'pang',
  'sf2',
  'sf2rb2',
  '1943',
  'area88',
  'rtype',
  'parodius',
] as const;


type FbNeoGameName = typeof FBNEO_SUPPORTED_GAMES[number];


export type ArcadeRotation = 'none' | 'left' | 'right';


export const FBNEO_ROTATIONS: Partial<Record<FbNeoGameName, Exclude<ArcadeRotation, 'none'>>> = {
  ddonpach: 'left',
  ddp2100: 'left',
  pacman: 'right',
  raiden: 'left',
  '1943': 'left',
};


export function getFbNeoGameName(filename: string): FbNeoGameName | null {
  const baseName = filename.split(/[\\/]/).pop()?.toLowerCase().replace(/\.zip$/, '') ?? '';
  return (FBNEO_SUPPORTED_GAMES as readonly string[]).includes(baseName) ? baseName as FbNeoGameName : null;
}


export function isFbNeoArcadeRomName(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip') && getFbNeoGameName(filename) !== null;
}
