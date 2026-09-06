import type { RomMetadataTable } from './types';

const entries: Array<[string, string, string, string]> = [
  ['小精靈', '1980', 'MAZE', '1–2'], ['雷電', '1990', 'SHOOT ’EM UP', '1–2'],
  ['怒首領蜂', '1997', 'SHOOT ’EM UP', '1–2'], ['怒首領蜂 II 蜂暴', '2001', 'SHOOT ’EM UP', '1–2'],
  ['Area 88', '1989', 'SHOOT ’EM UP', '1–2'], ['異形戰機', '1987', 'SHOOT ’EM UP', '1–2'],
  ['瘋狂大射擊', '1990', 'SHOOT ’EM UP', '1–2'],
  ['街頭快打', '1989', 'BEAT ’EM UP', '1–2'], ['吞食天地 2 赤壁之戰', '1992', 'BEAT ’EM UP', '1–3'],
  ['恐龍快打', '1993', 'BEAT ’EM UP', '1–3'], ['辛普森家庭', '1991', 'BEAT ’EM UP', '1–4'],
  ['忍者棒球 (美版)', '1993', 'BEAT ’EM UP', '1–4'],
  ['泡泡龍', '1986', 'ACTION', '1–2'], ['快打旋風 2', '1991', 'FIGHTING', '1–2'],
  ['快打旋風 2 冠軍版 (彩虹改版 2)', '1992', 'FIGHTING', '1–2'],
  ["格鬥拳王 '94", '1994', 'FIGHTING', '1–2'], ["格鬥拳王 '95", '1995', 'FIGHTING', '1–2'],
  ["格鬥拳王 '96", '1996', 'FIGHTING', '1–2'], ["格鬥拳王 '97", '1997', 'FIGHTING', '1–2'],
  ["格鬥拳王 '98", '1998', 'FIGHTING', '1–2'], ['格鬥拳王 2000', '2000', 'FIGHTING', '1–2'],
  ['侍魂', '1993', 'FIGHTING', '1–2'],
  ['侍魂 2', '1994', 'FIGHTING', '1–2'], ['侍魂 4', '1996', 'FIGHTING', '1–2'],
  ['侍魂 5', '2003', 'FIGHTING', '1–2'], ['SNK 對卡普空 SVC Chaos', '2003', 'FIGHTING', '1–2'],
  ['越南大戰', '1996', 'RUN AND GUN', '1–2'], ['越南大戰 2 Turbo', '1998', 'RUN AND GUN', '1–2'],
  ['越南大戰 3', '2000', 'RUN AND GUN', '1–2'], ['越南大戰 4', '2002', 'RUN AND GUN', '1–2'],
  ['越南大戰 5 (JAMMA PCB)', '2003', 'RUN AND GUN', '1–2'],
];

export const ARCADE_METADATA: RomMetadataTable = {};
for (const [name, year, genre, players] of entries) {
  ARCADE_METADATA[name] = { year, genre, players };
}