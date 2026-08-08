import { describe, expect, it } from 'vitest';
import {
  getSnes9xUnsupportedReason,
  hasSnes9xSaveMarker,
  isTengaiMakyoZero,
  isUninitializedSnes9xSave,
  shouldForceLegacySnesCore,
  shouldUseDigitalArcadeDpad,
  shouldUseSnes9x,
} from '../src/snes/snes9x-backend';

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

  it('uses a digital arcade pad only on affected Android browsers', () => {
    expect(shouldUseDigitalArcadeDpad(
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/80.0.3987.149 Mobile Safari/537.36',
      true,
    )).toBe(true);
    expect(shouldUseDigitalArcadeDpad(
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      true,
    )).toBe(false);
    expect(shouldUseDigitalArcadeDpad('Mozilla/5.0 (iPhone) Safari/605.1.15', false)).toBe(false);
  });

  it('rejects clearly underpowered Android devices before core startup', () => {
    expect(getSnes9xUnsupportedReason('Mozilla/5.0 (Linux; Android 10) Chrome/100.0', 1, true))
      .toContain('1 GB');
    expect(getSnes9xUnsupportedReason('Mozilla/5.0 (Linux; Android 10) Chrome/100.0', undefined, true))
      .toBeNull();
  });

  it('rejects browsers without WebAssembly', () => {
    expect(getSnes9xUnsupportedReason('Mozilla/5.0', 4, false)).toContain('WebAssembly');
  });
});

describe('Tengai Makyo Zero startup detection', () => {
  it('recognizes the catalog ROM name', () => {
    expect(isTengaiMakyoZero('天外魔境_零.smc')).toBe(true);
    expect(isTengaiMakyoZero('Tengai Makyou Zero.smc')).toBe(true);
  });

  it('does not match unrelated SFC games', () => {
    expect(isTengaiMakyoZero('Super Mario World (USA).sfc')).toBe(false);
  });

  it('recognizes the completed SPC7110 SRAM marker', () => {
    const saveData = new Uint8Array(32);
    const marker = new TextEncoder().encode('SPC7110 CHECK OK');
    saveData.set(marker, saveData.length - marker.length);
    expect(hasSnes9xSaveMarker(saveData, 'SPC7110 CHECK OK')).toBe(true);
    saveData[saveData.length - 1] = 0;
    expect(hasSnes9xSaveMarker(saveData, 'SPC7110 CHECK OK')).toBe(false);
  });

  it('recognizes the marker when SRAM has trailing bytes', () => {
    const saveData = new Uint8Array(32);
    saveData.set(new TextEncoder().encode('SPC7110 CHECK OK'), 4);
    expect(hasSnes9xSaveMarker(saveData, 'SPC7110 CHECK OK')).toBe(true);
  });

  it('only treats an empty or untouched SRAM image as uninitialized', () => {
    expect(isUninitializedSnes9xSave(new Uint8Array())).toBe(true);
    expect(isUninitializedSnes9xSave(new Uint8Array(8192).fill(0xAA))).toBe(true);

    const existingSave = new Uint8Array(8192).fill(0xAA);
    existingSave[128] = 0;
    expect(isUninitializedSnes9xSave(existingSave)).toBe(false);
  });
});