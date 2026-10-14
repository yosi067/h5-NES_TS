import { describe, expect, it } from 'vitest';
import { computePortraitFit, isInAppBrowser, shouldUseDesktopUi } from '../src/ui/browser-env';

describe('isInAppBrowser', () => {
  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 Line/14.5.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Instagram 320.0',
  ])('detects in-app browser UA %#', (ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it('does not flag Safari, Chrome or desktop browsers', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36')).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36')).toBe(false);
  });
});

describe('computePortraitFit', () => {
  it('leaves the screen alone when everything fits', () => {
    expect(computePortraitFit({ viewportHeight: 700, contentBottom: 650, screenHeight: 270, screenWidth: 360 }))
      .toEqual({ aspect: 360 / 270, maxScreenHeight: null });
  });

  it('shrinks the screen by the overflow amount', () => {
    expect(computePortraitFit({ viewportHeight: 600, contentBottom: 660, screenHeight: 270, screenWidth: 360 }).maxScreenHeight).toBe(210);
  });

  it('never shrinks below 55 percent of the screen height', () => {
    const result = computePortraitFit({ viewportHeight: 400, contentBottom: 700, screenHeight: 270, screenWidth: 360 });
    expect(result.maxScreenHeight).toBeCloseTo(148.5);
  });
});

describe('shouldUseDesktopUi', () => {
  const desktop = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    platform: 'Win32',
    maxTouchPoints: 0,
    hasFinePointerAndHover: true,
    viewportWidth: 1366,
  };

  it('accepts mouse and keyboard desktops, including touchscreen laptops', () => {
    expect(shouldUseDesktopUi(desktop)).toBe(true);
    expect(shouldUseDesktopUi({ ...desktop, maxTouchPoints: 10 })).toBe(true);
  });

  it('rejects phones, tablets and narrow windows', () => {
    expect(shouldUseDesktopUi({ ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' })).toBe(false);
    expect(shouldUseDesktopUi({ ...desktop, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(false);
    expect(shouldUseDesktopUi({ ...desktop, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
    expect(shouldUseDesktopUi({ ...desktop, hasFinePointerAndHover: false })).toBe(false);
    expect(shouldUseDesktopUi({ ...desktop, viewportWidth: 700 })).toBe(false);
  });
});
