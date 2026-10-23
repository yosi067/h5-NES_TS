/**
 * 金手指解析與保存。只在使用者手動啟用時生效；不寫入任何即時存檔或 SRAM。
 *
 * 自製核心支援：
 * - FC：Game Genie（6/8 碼）與 RAM 鎖值「位址:值」（$0000-$1FFF、$6000-$7FFF）
 * - GB：GameShark（01VVLLHH）與 RAM 鎖值（$C000-$DFFF、$FF80-$FFFE）
 * - GG / SMS：RAM 鎖值（$C000-$FFFF）
 * - SFC：Pro Action Replay（7E0DBE09）與 RAM 鎖值（7E/7F 銀行）
 * EmulatorJS 核心（Snes9x、Genesis Plus GX、FCEUmm）直接使用核心內建格式。
 */
export type NativeCheatSystem = 'nes' | 'gb' | 'gg' | 'sms' | 'snes';

export interface CheatEntry {
  code: string;
  label: string;
  enabled: boolean;
}

export interface CompiledCheats {
  /** 扁平化 [位址, 值, ...]，直接交給 WASM setCheats。 */
  ram: number[];
  /** 扁平化 [位址, 值, 比較值或 -1, ...]（只有 FC Game Genie）。 */
  rom: number[];
  errors: Array<{ code: string; message: string }>;
}

export const CHEATS_KEY_PREFIX = 'h5emu.cheats.v1:';
const MAX_CHEATS_PER_GAME = 64;
const GAME_GENIE_LETTERS = 'APZLGITYEOXUKSVN';

export type ParsedCheat =
  | { kind: 'ram'; address: number; value: number }
  | { kind: 'rom'; address: number; value: number; compare: number };

export function decodeNesGameGenie(code: string): ParsedCheat | null {
  const letters = code.toUpperCase().replace(/[\s-]/g, '');
  if (letters.length !== 6 && letters.length !== 8) return null;
  const n = Array.from(letters, (letter) => GAME_GENIE_LETTERS.indexOf(letter));
  if (n.some((value) => value < 0)) return null;
  const address = 0x8000
    + (((n[3] & 7) << 12) | ((n[5] & 7) << 8) | ((n[4] & 8) << 8)
      | ((n[2] & 7) << 4) | ((n[1] & 8) << 4) | (n[4] & 7) | (n[3] & 8));
  if (letters.length === 6) {
    const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[5] & 8);
    return { kind: 'rom', address, value, compare: -1 };
  }
  const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[7] & 8);
  const compare = ((n[7] & 7) << 4) | ((n[6] & 8) << 4) | (n[6] & 7) | (n[5] & 8);
  return { kind: 'rom', address, value, compare };
}

export function isRamAddressAllowed(system: NativeCheatSystem, address: number): boolean {
  switch (system) {
    case 'nes':
      return address < 0x2000 || (address >= 0x6000 && address < 0x8000);
    case 'gb':
      return (address >= 0xC000 && address <= 0xFDFF) || (address >= 0xFF80 && address <= 0xFFFE);
    case 'gg':
    case 'sms':
      return address >= 0xC000 && address <= 0xFFFF;
    case 'snes': {
      const bank = address >> 16;
      const offset = address & 0xFFFF;
      return bank === 0x7E || bank === 0x7F
        || (((bank >= 0x00 && bank <= 0x3F) || (bank >= 0x80 && bank <= 0xBF)) && offset < 0x2000);
    }
  }
}

/** 解析單一代碼；無法辨識或位址不在可寫 RAM 時回傳錯誤訊息。 */
export function parseCheatCode(system: NativeCheatSystem, input: string): ParsedCheat | { error: string } {
  const code = input.trim();
  if (!code) return { error: '空白代碼' };

  if (system === 'nes' && /^[APZLGITYEOXUKSVN-]+$/i.test(code)) {
    const decoded = decodeNesGameGenie(code);
    if (decoded) return decoded;
  }

  const raw = /^\$?([0-9a-f]{1,6})\s*[:= ]\s*\$?([0-9a-f]{1,2})$/i.exec(code);
  if (raw) {
    const address = Number.parseInt(raw[1], 16);
    const value = Number.parseInt(raw[2], 16);
    if (!isRamAddressAllowed(system, address)) return { error: '位址不在可寫入的 RAM 範圍' };
    return { kind: 'ram', address, value };
  }

  const compact = /^([0-9a-f]{8})$/i.exec(code);
  if (compact) {
    const hex = compact[1];
    if (system === 'snes') {
      const address = Number.parseInt(hex.slice(0, 6), 16);
      const value = Number.parseInt(hex.slice(6, 8), 16);
      if (!isRamAddressAllowed('snes', address)) return { error: 'PAR 位址不在 WRAM（7E/7F）' };
      return { kind: 'ram', address, value };
    }
    if (system === 'gb') {
      const value = Number.parseInt(hex.slice(2, 4), 16);
      const address = Number.parseInt(hex.slice(6, 8) + hex.slice(4, 6), 16);
      if (!isRamAddressAllowed('gb', address)) return { error: 'GameShark 位址不在 WRAM / HRAM' };
      return { kind: 'ram', address, value };
    }
  }

  if (system === 'nes') return { error: '請輸入 Game Genie 6/8 碼，或「位址:值」如 0075:09' };
  if (system === 'snes') return { error: '請輸入 PAR 8 碼如 7E0DBE09，或「位址:值」' };
  if (system === 'gb') return { error: '請輸入 GameShark 8 碼如 01FF16D0，或「位址:值」' };
  return { error: '請輸入「位址:值」，例如 C010:63' };
}

/** 一行可用「+」串多個代碼（常見於 Game Genie 組合碼）。 */
export function compileCheats(system: NativeCheatSystem, entries: CheatEntry[]): CompiledCheats {
  const result: CompiledCheats = { ram: [], rom: [], errors: [] };
  for (const entry of entries) {
    if (!entry.enabled) continue;
    for (const part of entry.code.split('+')) {
      const parsed = parseCheatCode(system, part);
      if ('error' in parsed) {
        result.errors.push({ code: part.trim(), message: parsed.error });
      } else if (parsed.kind === 'ram') {
        result.ram.push(parsed.address, parsed.value);
      } else {
        result.rom.push(parsed.address, parsed.value, parsed.compare);
      }
    }
  }
  return result;
}

export function loadCheats(storage: Storage | null, gameKey: string): CheatEntry[] {
  try {
    const raw = storage?.getItem(CHEATS_KEY_PREFIX + gameKey);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is CheatEntry => Boolean(item) && typeof (item as CheatEntry).code === 'string')
      .slice(0, MAX_CHEATS_PER_GAME)
      .map((item) => ({
        code: item.code.slice(0, 200),
        label: typeof item.label === 'string' ? item.label.slice(0, 60) : '',
        // 每次開遊戲都從「關閉」開始，避免忘記關掉的金手指影響正常遊玩或存檔。
        enabled: false,
      }));
  } catch {
    return [];
  }
}

export function saveCheats(storage: Storage | null, gameKey: string, entries: CheatEntry[]): void {
  try {
    const list = entries.slice(0, MAX_CHEATS_PER_GAME).map(({ code, label }) => ({ code, label, enabled: false }));
    if (list.length === 0) storage?.removeItem(CHEATS_KEY_PREFIX + gameKey);
    else storage?.setItem(CHEATS_KEY_PREFIX + gameKey, JSON.stringify(list));
  } catch {
    // 無法保存時仍可在本次遊玩使用。
  }
}
