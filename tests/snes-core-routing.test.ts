import { describe, expect, it } from 'vitest';
import {
  getSnes9xUnsupportedReason,
  shouldForceLegacySnesCore,
  shouldUseDigitalArcadeDpad,
} from '../src/snes/snes9x-backend';
import { shouldUseTemporarySnes9xFallback } from '../src/snes/snes-routing';

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

  it('routes Mario RPG, Star Ocean, and Super Mario Kart to Rust WASM for diagnostics', () => {
    expect(shouldUseTemporarySnes9xFallback('Super Mario RPG (Japan).sfc')).toBe(false);
    expect(shouldUseTemporarySnes9xFallback('Star Ocean (Japan).sfc')).toBe(false);
    expect(shouldUseTemporarySnes9xFallback('Super Mario Kart (Japan).zip')).toBe(false);
  });

  it('does not force fallback for unrelated SNES ROMs', () => {
    expect(shouldUseTemporarySnes9xFallback('Super Mario World (USA).sfc')).toBe(false);
  });
});