/**
 * 手機／平板／PWA 的版面模式判定，以及直向時自動縮小遊戲畫面。
 */
import { computePortraitFit, isInAppBrowser, shouldUseDesktopUi } from './browser-env';
import { runtime } from '../app/runtime';

function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}


function isStandaloneDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
      || standaloneNavigator.standalone,
  );
}


export function updateIOSInstallHint(): void {
  const hint = document.getElementById('ios-install-hint');
  if (!hint || hint.dataset.dismissed === 'true') return;

  const isIOSBrowser = isIOSDevice() && !isStandaloneDisplayMode() && !isInAppBrowser(navigator.userAgent);
  const isLobbyVisible = runtime.romSelector ? getComputedStyle(runtime.romSelector).display !== 'none' : false;
  hint.hidden = !isIOSBrowser || !isLobbyVisible;
}


let portraitFitFrame: number | null = null;


/** 直立觸控版：內容超出可視高度時縮小遊戲畫面，避免按鍵被推出螢幕或整頁需要捲動。 */
export function requestPortraitFit(): void {
  if (portraitFitFrame !== null) return;
  portraitFitFrame = requestAnimationFrame(() => {
    portraitFitFrame = null;
    applyPortraitFit();
  });
}


function applyPortraitFit(): void {
  const root = document.documentElement;
  const body = document.body;
  root.style.removeProperty('--screen-max-h');
  body.classList.remove('screen-shrunk');
  if (
    !body.classList.contains('game-active')
    || !body.classList.contains('touch-device-mode')
    || body.classList.contains('mobile-landscape-mode')
    || body.classList.contains('n64-initializing')
    || window.matchMedia('(min-width: 769px)').matches
  ) return;

  const screenEl = ['screen', 'canvas', 'snes9x-screen']
    .map((id) => document.getElementById(id))
    .find((element) => element !== null && element.getBoundingClientRect().height > 0);
  const area = Array.from(document.querySelectorAll<HTMLElement>('#virtual-controller > div'))
    .find((element) => element.style.display !== 'none' && element.offsetHeight > 0);
  if (!screenEl || !area) return;

  const screenRect = screenEl.getBoundingClientRect();
  let bottom = 0;
  for (const child of Array.from(area.children) as HTMLElement[]) {
    const style = getComputedStyle(child);
    if (style.position === 'absolute' || style.position === 'fixed' || child.offsetHeight === 0) continue;
    bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
  }
  const shellPadding = runtime.gameboyShell ? parseFloat(getComputedStyle(runtime.gameboyShell).paddingBottom) || 0 : 0;
  bottom += (parseFloat(getComputedStyle(area).paddingBottom) || 0) + shellPadding + window.scrollY;

  const fit = computePortraitFit({
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    contentBottom: bottom,
    screenHeight: screenRect.height,
    screenWidth: screenRect.width,
  });
  root.style.setProperty('--screen-aspect', String(fit.aspect));
  if (fit.maxScreenHeight !== null) {
    root.style.setProperty('--screen-max-h', `${fit.maxScreenHeight}px`);
    body.classList.add('screen-shrunk');
  }
}


function watchBodyClassForPortraitFit(): void {
  const keyOf = () => document.body.className.replace(/\bscreen-shrunk\b/, '').trim();
  let lastKey = keyOf();
  new MutationObserver(() => {
    const key = keyOf();
    if (key === lastKey) return;
    lastKey = key;
    requestPortraitFit();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}


export function setupIOSInstallHint(): void {
  document.getElementById('ios-install-hint-close')?.addEventListener('click', () => {
    const hint = document.getElementById('ios-install-hint');
    if (!hint) return;
    hint.dataset.dismissed = 'true';
    hint.hidden = true;
  });
}


export function setupResponsiveModeDetection(): void {
  document.body.classList.toggle('android-device-mode', /Android/i.test(navigator.userAgent));
  const iosDevice = isIOSDevice();
  const inAppBrowser = isInAppBrowser(navigator.userAgent);
  document.body.classList.toggle('in-app-browser', inAppBrowser);
  let wasIOSBrowserLandscape = false;
  let collapseAddressBarFrame: number | null = null;

  const canScrollRoot = () => {
    const scrollingElement = document.scrollingElement;
    return Boolean(scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight + 1);
  };

  const requestIOSAddressBarCollapse = () => {
    if (!document.body.classList.contains('ios-safari-browser-mode') || window.scrollY > 0 || !canScrollRoot()) {
      return;
    }

    if (collapseAddressBarFrame !== null) {
      window.cancelAnimationFrame(collapseAddressBarFrame);
    }

    collapseAddressBarFrame = window.requestAnimationFrame(() => {
      collapseAddressBarFrame = null;
      if (document.body.classList.contains('ios-safari-browser-mode') && canScrollRoot()) {
        window.scrollTo(0, 1);
      }
    });
  };

  const updateResponsiveMode = () => {
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const isLandscape = viewportWidth > viewportHeight;
    const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    const isDesktopUi = shouldUseDesktopUi({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      hasFinePointerAndHover: window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches,
      viewportWidth,
    });
    const isCompressedLandscape = isLandscape && viewportHeight <= 560;
    const shouldUseMobileLandscape = !isDesktopUi && isTouchDevice && isLandscape && (viewportWidth <= 1180 || isCompressedLandscape);
    const isIOSLandscape = iosDevice && isLandscape;
    const isStandalone = isStandaloneDisplayMode();
    // 內嵌瀏覽器（LINE 等）沒有 Safari 的網址列收合行為，不套用 Safari 專用的捲動技巧。
    const isIOSBrowser = iosDevice && !isStandalone && !inAppBrowser;
    const isIOSBrowserLandscape = isIOSLandscape && isIOSBrowser;

    document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
    document.documentElement.style.setProperty('--visual-viewport-center-x', `${viewportOffsetLeft + viewportWidth / 2}px`);
    document.documentElement.style.setProperty('--visual-viewport-center-y', `${viewportOffsetTop + viewportHeight / 2}px`);
    document.documentElement.classList.toggle('ios-safari-browser-mode', isIOSBrowser);
    document.body.classList.toggle('ios-safari-browser-mode', isIOSBrowser);
    document.documentElement.classList.toggle('ios-safari-landscape-mode', isIOSBrowserLandscape);
    document.body.classList.toggle('ios-safari-landscape-mode', isIOSBrowserLandscape);
    document.documentElement.classList.toggle('standalone-mode', isStandalone);
    document.body.classList.toggle('standalone-mode', isStandalone);
    document.body.classList.toggle('touch-device-mode', isTouchDevice && !isDesktopUi);
    document.body.classList.toggle('desktop-ui', isDesktopUi);
    document.body.classList.toggle('mobile-landscape-mode', shouldUseMobileLandscape);
    document.body.classList.toggle('fullscreen-active', Boolean(document.fullscreenElement) || (isIOSLandscape && !isDesktopUi));
    updateIOSInstallHint();

    if (isIOSBrowserLandscape && !wasIOSBrowserLandscape) {
      requestIOSAddressBarCollapse();
    }
    wasIOSBrowserLandscape = isIOSBrowserLandscape;
    requestPortraitFit();
  };

  updateResponsiveMode();
  watchBodyClassForPortraitFit();
  window.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.addEventListener('orientationchange', () => {
    updateResponsiveMode();
    window.requestAnimationFrame(updateResponsiveMode);
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateResponsiveMode, { passive: true });
  window.addEventListener('touchstart', requestIOSAddressBarCollapse, { passive: true });
  window.addEventListener('touchend', requestIOSAddressBarCollapse, { passive: true });
}
