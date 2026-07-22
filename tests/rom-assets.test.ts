import { describe, expect, it } from 'vitest';
import { getRomAssetUrl, hasN64RomMagic } from '../src/rom-assets';

describe('ROM assets', () => {
  it('keeps commas readable while encoding unsafe filename characters', () => {
    expect(getRomAssetUrl('./', 'Legend of Zelda, The - Ocarina of Time.z64'))
      .toBe('./roms/Legend%20of%20Zelda,%20The%20-%20Ocarina%20of%20Time.z64');
    expect(getRomAssetUrl('/h5-NES_TS/', '測試 #1?.z64'))
      .toBe('/h5-NES_TS/roms/%E6%B8%AC%E8%A9%A6%20%231%3F.z64');
  });

  it('recognizes all supported N64 byte orders', () => {
    expect(hasN64RomMagic(Uint8Array.from([0x80, 0x37, 0x12, 0x40]).buffer)).toBe(true);
    expect(hasN64RomMagic(Uint8Array.from([0x37, 0x80, 0x40, 0x12]).buffer)).toBe(true);
    expect(hasN64RomMagic(Uint8Array.from([0x40, 0x12, 0x37, 0x80]).buffer)).toBe(true);
  });

  it('rejects an HTML fallback response', () => {
    expect(hasN64RomMagic(new TextEncoder().encode('<!DOCTYPE html>').buffer)).toBe(false);
  });
});