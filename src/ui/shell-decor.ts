/**
 * 機身裝飾（喇叭孔）的擺放：只放在不會碰到任何按鍵、標籤或畫面的地方。
 * 依序嘗試右下角的大、中、小三種尺寸，都會重疊就不畫。
 * 裝飾本身 pointer-events: none，也不參與排版。
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;
}

/** 從候選位置中挑第一個不與障礙物重疊、且在容器內的位置；都不行時回傳 null。 */
export function pickFreeSlot(candidates: Rect[], obstacles: Rect[], bounds: Rect, margin = 6): Rect | null {
  for (const candidate of candidates) {
    const inside = candidate.left >= bounds.left && candidate.top >= bounds.top
      && candidate.right <= bounds.right && candidate.bottom <= bounds.bottom;
    if (!inside) continue;
    if (obstacles.every((obstacle) => !rectsOverlap(candidate, obstacle, margin))) return candidate;
  }
  return null;
}

const OBSTACLE_SELECTOR = [
  '#virtual-controller button',
  '#virtual-controller .dpad',
  '#virtual-controller .n64-stick',
  '#virtual-controller .n64-dpad-mini',
  '#virtual-controller .n64-label',
  '#virtual-controller .ab-touch-area',
  '#virtual-controller .arcade-face-grid',
  '#virtual-controller .pad-history-wrap',
  '#virtual-controller .pad-float',
  '.screen-bezel',
  '.brand-area',
  '.mobile-tools-trigger',
].join(',');

function visibleRect(node: Element): Rect | null {
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const style = getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  return rect;
}

export function mountShellDecor(shell: HTMLElement): { schedule(): void } {
  const grille = document.createElement('div');
  grille.className = 'shell-grille';
  grille.setAttribute('aria-hidden', 'true');
  shell.appendChild(grille);

  let frame: number | null = null;
  const place = () => {
    frame = null;
    grille.classList.remove('is-placed');
    const body = document.body;
    if (!body.classList.contains('game-active') || body.classList.contains('desktop-ui') || body.dataset.skin === 'original') return;

    const landscape = body.classList.contains('mobile-landscape-mode');
    const shellRect = shell.getBoundingClientRect();
    const bottomInset = Number.parseFloat(getComputedStyle(shell).paddingBottom) || 0;
    // 橫向是 GBA 的圓形小孔；直向是 Game Boy 的六條斜槽（寬高比 4:3）。
    const sizes: Array<[number, number]> = landscape ? [[30, 30], [24, 24]] : [[112, 84], [88, 66], [68, 51]];
    const right = shellRect.right - (landscape ? 12 : 14);
    const bottom = shellRect.bottom - Math.max(landscape ? 10 : 12, bottomInset);
    const candidates = sizes.map(([width, height]) => ({ left: right - width, top: bottom - height, right, bottom }));
    const obstacles: Rect[] = [];
    document.querySelectorAll(OBSTACLE_SELECTOR).forEach((node) => {
      if (node === grille) return;
      const rect = visibleRect(node);
      if (!rect) return;
      // A / B 的字母印在按鈕右下方，往下多留一點空間。
      const extra = node.classList.contains('ab-touch-area') ? 24 : 0;
      obstacles.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom + extra });
    });
    const slot = pickFreeSlot(candidates, obstacles, shellRect);
    if (!slot) return;
    grille.style.left = `${slot.left - shellRect.left}px`;
    grille.style.top = `${slot.top - shellRect.top}px`;
    grille.style.width = `${slot.right - slot.left}px`;
    grille.style.height = `${slot.bottom - slot.top}px`;
    grille.classList.add('is-placed');
  };

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(place);
  };
  const scheduleTwice = () => {
    schedule();
    window.setTimeout(schedule, 300);
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', scheduleTwice, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  new MutationObserver(scheduleTwice).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-system', 'data-skin', 'data-pad-profile'] });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(shell);
  scheduleTwice();
  return { schedule };
}
