import { mountToolsPanel, type ToolsApi, type ToolsPanel } from './tools-panel';

/**
 * 手機版功能選單：固定在視窗左上角的小按鈕＋底部抽屜。
 * 按鈕使用 position: fixed，不參與遊戲畫面與虛擬手把的排版。
 */
export interface MobileTools {
  refresh(): void;
  close(): void;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type);
  }
  return false;
}

export function mountMobileTools(api: ToolsApi & { returnToLobby(): void }): MobileTools {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mobile-tools-trigger';
  trigger.setAttribute('aria-label', '開啟功能選單');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = '☰';

  const scrim = document.createElement('div');
  scrim.className = 'mobile-tools-scrim';
  scrim.hidden = true;

  const sheet = document.createElement('section');
  sheet.className = 'mobile-tools-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', '遊戲功能');
  sheet.tabIndex = -1;

  const head = document.createElement('header');
  head.className = 'mobile-tools-head';
  const title = document.createElement('strong');
  title.textContent = '遊戲功能';
  const lobbyButton = document.createElement('button');
  lobbyButton.type = 'button';
  lobbyButton.className = 'stage-action stage-action-small stage-action-danger';
  lobbyButton.textContent = '返回大廳';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'stage-action stage-action-small';
  closeButton.textContent = '關閉';
  closeButton.setAttribute('aria-label', '關閉功能選單');
  const headActions = document.createElement('div');
  headActions.className = 'mobile-tools-head-actions';
  headActions.append(lobbyButton, closeButton);
  head.append(title, headActions);

  const body = document.createElement('div');
  body.className = 'mobile-tools-body';
  sheet.append(head, body);
  document.body.append(trigger, scrim, sheet);

  const panel: ToolsPanel = mountToolsPanel(body, api, { includeSlots: true, includeTouch: true });

  // 把按鈕貼在「H5-EMU」品牌字右側：直向是畫面與手把之間的橫條，橫向是左欄的標籤，
  // 兩處都是裝飾空間，不會蓋到遊戲畫面或任何按鍵。品牌字不可見時才退回視窗左上角。
  const TRIGGER_SIZE = 34;
  let placeFrame: number | null = null;
  const placeTrigger = () => {
    placeFrame = null;
    const brand = document.getElementById('game-home-link');
    const rect = brand?.getBoundingClientRect();
    const visible = Boolean(brand && rect && rect.width > 0 && rect.height > 0
      && getComputedStyle(brand).visibility !== 'hidden'
      && getComputedStyle(brand.closest('.brand-area') ?? brand).display !== 'none');
    if (!visible || !rect) {
      trigger.style.removeProperty('left');
      trigger.style.removeProperty('top');
      trigger.classList.remove('is-anchored');
      return;
    }
    // 品牌字後面若有「TM」等偽元素，按鈕要再往右讓開。
    const afterContent = brand ? getComputedStyle(brand, '::after').content : 'none';
    const trailing = afterContent && afterContent !== 'none' && afterContent !== 'normal' ? 16 : 0;
    const left = Math.min(window.innerWidth - TRIGGER_SIZE - 4, rect.right + 8 + trailing);
    const top = Math.max(4, rect.top + rect.height / 2 - TRIGGER_SIZE / 2);
    trigger.style.left = `${Math.round(left)}px`;
    trigger.style.top = `${Math.round(top)}px`;
    trigger.classList.add('is-anchored');
  };
  const schedulePlace = () => {
    if (placeFrame === null) placeFrame = requestAnimationFrame(placeTrigger);
  };
  window.addEventListener('resize', schedulePlace, { passive: true });
  window.addEventListener('scroll', schedulePlace, { passive: true });
  window.addEventListener('orientationchange', () => { schedulePlace(); window.setTimeout(schedulePlace, 300); }, { passive: true });
  window.visualViewport?.addEventListener('resize', schedulePlace, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedulePlace, { passive: true });
  new MutationObserver(() => { schedulePlace(); window.setTimeout(schedulePlace, 250); })
    .observe(document.body, { attributes: true, attributeFilter: ['class', 'data-system'] });
  const shell = document.getElementById('gameboy-shell');
  if (shell && typeof ResizeObserver !== 'undefined') new ResizeObserver(schedulePlace).observe(shell);
  schedulePlace();

  let open = false;
  const show = () => {
    if (open) return;
    open = true;
    panel.refresh();
    scrim.hidden = false;
    sheet.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-tools-open');
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      scrim.classList.add('is-open');
      sheet.focus({ preventScroll: true });
    });
  };
  const hide = () => {
    if (!open) return;
    open = false;
    sheet.classList.remove('is-open');
    scrim.classList.remove('is-open');
    sheet.hidden = true;
    scrim.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mobile-tools-open');
  };

  trigger.addEventListener('click', () => (open ? hide() : show()));
  closeButton.addEventListener('click', hide);
  scrim.addEventListener('click', hide);
  lobbyButton.addEventListener('click', () => {
    hide();
    api.returnToLobby();
  });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  });

  return { refresh: () => { if (open) panel.refresh(); }, close: hide };
}
