import { describe, expect, it } from 'vitest';
import { shouldForceLegacySnesCore, shouldUseSnes9x } from '../src/snes/snes9x-backend';

function makeRom(mapMode: number, cartridgeType: number, copierHeader = false): Uint8Array {
  const prefix = copierHeader ? 512 : 0;
  const rom = new Uint8Array(prefix + 0x10000);
  rom[prefix + 0x7FD5] = mapMode;
  rom[prefix + 0x7FD6] = cartridgeType;
  return rom;
}

describe('SFC core routing', () => {
  it('keeps standard LoROM games on the native core', () => {
    expect(shouldUseSnes9x(makeRom(0x20, 0x00), 'Super Mario World (USA).sfc')).toBe(false);
  });

  it('routes SA-1 games to Snes9x', () => {
    expect(shouldUseSnes9x(makeRom(0x23, 0x34), 'Super Mario RPG (Japan).sfc')).toBe(true);
  });

  it.each([0x43, 0x45])('routes S-DD1 cartridge type %# to Snes9x', cartridgeType => {
    expect(shouldUseSnes9x(makeRom(0x32, cartridgeType), 'Star Ocean (Japan).sfc')).toBe(true);
  });

  it.each([0x13, 0x14, 0x15, 0x1A])('routes SuperFX cartridge type %# to Snes9x', cartridgeType => {
    expect(shouldUseSnes9x(makeRom(0x20, cartridgeType), 'SuperFX game.sfc')).toBe(true);
  });

  it.each([0xF5, 0xF9])('routes SPC7110 cartridge type %# to Snes9x', cartridgeType => {
    expect(shouldUseSnes9x(makeRom(0x3A, cartridgeType), 'SPC7110 game.sfc')).toBe(true);
  });

  it.each([0x03, 0x05, 0xF3])('keeps supported enhancement type %# on the native core', cartridgeType => {
    expect(shouldUseSnes9x(makeRom(0x20, cartridgeType), 'Supported chip game.sfc')).toBe(false);
  });

  it('accounts for a 512-byte copier header', () => {
    expect(shouldUseSnes9x(makeRom(0x23, 0x34, true), 'SA-1 game.smc')).toBe(true);
  });

  it('preserves the known Super Mario Kart graphics fallback', () => {
    expect(shouldUseSnes9x(makeRom(0x20, 0x03), 'Super Mario Kart (Japan).sfc')).toBe(true);
  });

  it('preserves the known Super Butouden 3 graphics fallback', () => {
    expect(shouldUseSnes9x(makeRom(0x20, 0x00), 'Dragon Ball Z - Super Butouden 3 (Japan).sfc')).toBe(true);
  });

  it('keeps Seiken Densetsu 3 on the native core', () => {
    expect(shouldUseSnes9x(makeRom(0x20, 0x00), 'Seiken Densetsu 3 (Japan).sfc')).toBe(false);
  });
});

describe('Snes9x browser compatibility', () => {
  it('forces the legacy core on Android Chrome 80', () => {
    expect(shouldForceLegacySnesCore(
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/80.0.3987.149 Mobile Safari/537.36',
    )).toBe(true);
  });

  it('uses the modern core on Chrome 91 and newer', () => {
    expect(shouldForceLegacySnesCore(
      'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36',
    )).toBe(false);
  });
});