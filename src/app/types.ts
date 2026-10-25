/**
 * 遊戲目錄與主機的共用型別。
 */

// ===== 型別定義 =====

export interface RomInfo {
  name: string;
  file: string;
  system?: string;  // 'nes' | 'gb' | 'gg' | 'sms' | 'genesis' | 'snes' | 'n64' (可選，自動偵測)
  cover?: string;
  description?: string;
  region?: string;
  variant?: string;
  cartridge?: boolean;
  coverSource?: string;
  descriptionSource?: string;
  verified?: boolean;
}


export interface RomListResponse {
  roms: RomInfo[];
}


export interface GameMetadataResponse {
  version: number;
  games: Record<string, Partial<RomInfo>>;
}


export type SystemKey = 'nes' | 'gb' | 'gg' | 'sms' | 'genesis' | 'snes' | 'n64' | 'arcade';


export interface MachineInfo {
  key: SystemKey;
  title: string;
  label: string;
  artClass: string;
  artFile: string;
  section: string;
  issue: string;
  year: string;
  page: string;
}
