import { describe, expect, it } from 'vitest';
import {
  applyN64PerformanceProfile,
  selectN64PerformanceProfile,
  type N64PerformanceProfile,
} from '../src/n64/performance';

const BASE_CONFIG = `[Audio-SDL]
PRIMARY_BUFFER_TARGET = 2048
SECONDARY_BUFFER_SIZE = 1024
RESAMPLE = "src-sinc-fastest"

[Core]
OnScreenDisplay = True

[Video-General]
ScreenWidth = 640
ScreenHeight = 480

[Video-Rice]
FastTextureLoading = False
AccurateTextureMapping = True
SkipFrame = False
Mipmapping = 2
TextureQuality = 0
`;

function navigatorInfo(overrides: Partial<Navigator & { deviceMemory?: number }>) {
  return {
    userAgent: 'Desktop Browser',
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    ...overrides,
  } as Navigator & { deviceMemory?: number };
}

describe('N64 mobile performance profiles', () => {
  it('uses native low resolution and frame skipping on low-end phones', () => {
    const profile = selectN64PerformanceProfile(navigatorInfo({
      userAgent: 'Mozilla/5.0 Android Mobile',
      hardwareConcurrency: 4,
      deviceMemory: 4,
      maxTouchPoints: 5,
    }), 412);

    expect(profile).toEqual({
      name: 'mobile-low-end',
      width: 320,
      height: 240,
      skipFrame: true,
      mainLoopTimingMode: 1,
      primaryAudioTarget: 4096,
      secondaryAudioBuffer: 2048,
    });
  });

  it('uses display-synchronised pacing and native resolution on high-end iOS', () => {
    const profile = selectN64PerformanceProfile(navigatorInfo({
      userAgent: 'Mozilla/5.0 iPhone Mobile',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      maxTouchPoints: 5,
    }), 430);

    expect(profile.name).toBe('ios-high-end');
    expect(profile.skipFrame).toBe(false);
    expect(profile.width).toBe(320);
    expect(profile.height).toBe(240);
    expect(profile.mainLoopTimingMode).toBe(0);
    expect(profile.secondaryAudioBuffer).toBe(1024);
  });

  it('does not misclassify iOS when Safari exposes a low logical core count', () => {
    const profile = selectN64PerformanceProfile(navigatorInfo({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
      hardwareConcurrency: 2,
      maxTouchPoints: 5,
    }), 430);

    expect(profile.name).toBe('ios-high-end');
    expect(profile.mainLoopTimingMode).toBe(0);
  });

  it('rewrites only the intended Mupen sections for mobile', () => {
    const profile: N64PerformanceProfile = {
      name: 'mobile-low-end',
      width: 320,
      height: 240,
      skipFrame: true,
      mainLoopTimingMode: 1,
      primaryAudioTarget: 4096,
      secondaryAudioBuffer: 2048,
    };
    const config = applyN64PerformanceProfile(BASE_CONFIG, profile);

    expect(config).toContain('[Video-General]\nScreenWidth = 320\nScreenHeight = 240');
    expect(config).toContain('RESAMPLE = "trivial"');
    expect(config).toContain('FastTextureLoading = True');
    expect(config).toContain('AccurateTextureMapping = False');
    expect(config).toContain('SkipFrame = True');
    expect(config).toContain('OnScreenDisplay = False');
  });

  it('uses linear resampling on high-end iOS without changing low-end mobile', () => {
    const iosProfile = selectN64PerformanceProfile(navigatorInfo({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
      hardwareConcurrency: 8,
      maxTouchPoints: 5,
    }));
    const iosConfig = applyN64PerformanceProfile(BASE_CONFIG, iosProfile);

    expect(iosConfig).toContain('RESAMPLE = "src-linear"');
    expect(applyN64PerformanceProfile(BASE_CONFIG, {
      name: 'mobile-low-end',
      width: 320,
      height: 240,
      skipFrame: true,
      mainLoopTimingMode: 1,
      primaryAudioTarget: 4096,
      secondaryAudioBuffer: 2048,
    })).toContain('RESAMPLE = "trivial"');
  });
});
