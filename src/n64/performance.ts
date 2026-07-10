export interface N64PerformanceProfile {
  name: 'desktop' | 'mobile' | 'mobile-low-end';
  width: number;
  height: number;
  skipFrame: boolean;
  mainLoopTimingMode: number;
}

interface NavigatorHardwareInfo extends Navigator {
  deviceMemory?: number;
}

export function selectN64PerformanceProfile(
  nav: NavigatorHardwareInfo = navigator,
  viewportWidth = window.innerWidth,
): N64PerformanceProfile {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touchTablet = nav.maxTouchPoints > 1 && viewportWidth <= 1366;
  const mobile = mobileUserAgent || touchTablet || (coarsePointer && viewportWidth <= 1180);
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency ?? 4;
  const lowEnd = mobile && ((memory !== undefined && memory <= 4) || cores <= 4);

  if (lowEnd) {
    return { name: 'mobile-low-end', width: 320, height: 240, skipFrame: true, mainLoopTimingMode: 1 };
  }
  if (mobile) {
    return { name: 'mobile', width: 320, height: 240, skipFrame: false, mainLoopTimingMode: 1 };
  }
  return { name: 'desktop', width: 640, height: 480, skipFrame: false, mainLoopTimingMode: 0 };
}

function setIniValue(config: string, section: string, key: string, value: string): string {
  const lines = config.split(/\r?\n/);
  let inSection = false;
  let sectionFound = false;
  const sectionHeader = `[${section}]`;

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (inSection) {
        lines.splice(index, 0, `${key} = ${value}`);
        return lines.join('\n');
      }
      inSection = trimmed === sectionHeader;
      sectionFound ||= inSection;
      continue;
    }

    if (inSection) {
      const equals = trimmed.indexOf('=');
      if (equals >= 0 && trimmed.slice(0, equals).trim() === key) {
        lines[index] = `${key} = ${value}`;
        return lines.join('\n');
      }
    }
  }

  if (inSection) {
    lines.push(`${key} = ${value}`);
  } else if (!sectionFound) {
    lines.push('', sectionHeader, `${key} = ${value}`);
  }
  return lines.join('\n');
}

export function applyN64PerformanceProfile(
  config: string,
  profile: N64PerformanceProfile,
): string {
  let result = config;
  result = setIniValue(result, 'Core', 'OnScreenDisplay', 'False');
  result = setIniValue(result, 'Video-General', 'ScreenWidth', String(profile.width));
  result = setIniValue(result, 'Video-General', 'ScreenHeight', String(profile.height));

  if (profile.name !== 'desktop') {
    result = setIniValue(result, 'Audio-SDL', 'PRIMARY_BUFFER_TARGET', '4096');
    result = setIniValue(result, 'Audio-SDL', 'SECONDARY_BUFFER_SIZE', '2048');
    result = setIniValue(result, 'Audio-SDL', 'RESAMPLE', '"trivial"');
    result = setIniValue(result, 'Video-Rice', 'FastTextureLoading', 'True');
    result = setIniValue(result, 'Video-Rice', 'AccurateTextureMapping', 'False');
    result = setIniValue(result, 'Video-Rice', 'Mipmapping', '0');
    result = setIniValue(result, 'Video-Rice', 'TextureQuality', '2');
    result = setIniValue(result, 'Video-Rice', 'SkipFrame', profile.skipFrame ? 'True' : 'False');
  }

  return result;
}
