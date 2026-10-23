import { mountBindingPanel, type BindingPanel } from './binding-panel';
import type { BindingLayout, BindingStore } from './input-bindings';
import { chooseHudPlacement, computeStageFit, parseAspectRatio } from './stage-fit';

export interface StageActions {
  isRunning(): boolean;
  pause(): void;
  resume(): void;
  reset(): void;
  save(slot: number): void;
  load(slot: number): void;
  returnToLobby(): void;
  openRomFile(): void;
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  getLayout(): BindingLayout;
  getGameTitle(): string;
  notify(message: string): void;
  /** 選用：回傳欄位的存檔時間或狀態（「空」「有存檔」）。 */
  describeSlot?(slot: number): Promise<string>;
}

/** 選用的額外分頁（例如「功能」）。 */
export interface StageExtraTab {
  id: string;
  label: string;
  mount(panel: HTMLElement): { refresh(): void; release?(): void };
}

export interface StageSettings {
  integerScale: boolean;
  scanlines: boolean;
  frame: boolean;
}

export interface DesktopStage {
  /** 遊戲或主機切換後呼叫，更新標題、跑馬燈與按鍵配置。 */
  refresh(): void;
  toggleDrawer(): void;
  closeDrawer(): void;
}

const SETTINGS_KEY = 'h5emu.stage-settings.v1';
const DEFAULT_SETTINGS: StageSettings = { integerScale: false, scanlines: false, frame: true };
const SAVE_SLOTS = [0, 1, 2, 3, 4];
const FRAME_MARGIN = 20;

const SYSTEM_LABELS: Record<string, string> = {
  nes: 'FC / NES',
  gb: 'GAME BOY',
  gg: 'GAME GEAR',
  sms: 'MASTER SYSTEM',
  snes: 'SFC / SNES',
  genesis: 'MEGA DRIVE',
  n64: 'NINTENDO 64',
  arcade: 'ARCADE',
};

function loadSettings(): StageSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<StageSettings>;
    return {
      integerScale: parsed.integerScale === true,
      scanlines: parsed.scanlines === true,
      frame: parsed.frame !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: StageSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 設定無法保存時仍套用於本次工作階段。
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountDesktopStage(options: {
  shell: HTMLElement;
  bindings: BindingStore;
  actions: StageActions;
  extraTabs?: StageExtraTab[];
}): DesktopStage {
  const { shell, bindings, actions } = options;
  const extraTabs = options.extraTabs ?? [];
  const settings = loadSettings();

  // ---- 跑馬燈（外框內的遊戲名稱） ----
  const bezel = shell.querySelector<HTMLElement>('.screen-bezel');
  const marquee = el('div', 'stage-marquee');
  marquee.setAttribute('aria-hidden', 'true');
  const marqueeSystem = el('span', 'stage-marquee-system');
  const marqueeTitle = el('span', 'stage-marquee-title');
  marquee.append(marqueeSystem, marqueeTitle);
  bezel?.appendChild(marquee);

  // ---- 浮動工具列 ----
  const hud = el('div', 'stage-hud');
  hud.dataset.placement = 'top-bar';
  const hudTitle = el('div', 'stage-hud-title');
  const hudSystem = el('span', 'stage-hud-system');
  const hudGame = el('strong', 'stage-hud-game');
  hudTitle.append(hudSystem, hudGame);
  const hudButtons = el('div', 'stage-hud-buttons');
  const menuButton = el('button', 'stage-btn');
  menuButton.type = 'button';
  menuButton.id = 'stage-menu-btn';
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-controls', 'stage-drawer');
  menuButton.append(el('span', 'stage-btn-glyph', '☰'), el('span', 'stage-btn-label', '選單'), el('kbd', undefined, 'M'));
  const fullscreenButton = el('button', 'stage-btn stage-btn-icon', '⛶');
  fullscreenButton.type = 'button';
  fullscreenButton.setAttribute('aria-label', '全螢幕');
  fullscreenButton.title = '全螢幕';
  hudButtons.append(menuButton, fullscreenButton);
  hud.append(hudTitle, hudButtons);

  // ---- 側邊抽屜 ----
  const scrim = el('div', 'stage-scrim');
  scrim.hidden = true;
  const drawer = el('aside', 'stage-drawer');
  drawer.id = 'stage-drawer';
  drawer.hidden = true;
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '遊戲選單');
  drawer.tabIndex = -1;

  const drawerHead = el('header', 'stage-drawer-head');
  const drawerTitle = el('div', 'stage-drawer-title');
  const drawerSystem = el('span', 'stage-drawer-system');
  const drawerGame = el('strong', 'stage-drawer-game');
  drawerTitle.append(drawerSystem, drawerGame);
  const closeButton = el('button', 'stage-btn stage-btn-icon', '✕');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '關閉選單');
  drawerHead.append(drawerTitle, closeButton);

  const tabs = el('div', 'stage-tabs');
  tabs.setAttribute('role', 'tablist');
  const panels = el('div', 'stage-panels');
  const tabDefs = [
    { id: 'play', label: '操作' },
    ...extraTabs.map((tab) => ({ id: tab.id, label: tab.label })),
    { id: 'keys', label: '按鍵' },
    { id: 'screen', label: '畫面' },
    { id: 'help', label: '說明' },
  ];
  const tabButtons = new Map<string, HTMLButtonElement>();
  const panelNodes = new Map<string, HTMLElement>();
  const selectTab = (id: string) => {
    for (const [tabId, button] of tabButtons) {
      button.setAttribute('aria-selected', String(tabId === id));
      button.tabIndex = tabId === id ? 0 : -1;
    }
    for (const [panelId, panel] of panelNodes) panel.hidden = panelId !== id;
    if (id === 'keys') bindingPanel.showLayout(actions.getLayout());
    else bindingPanel.cancelCapture();
    extraHandles.get(id)?.refresh();
  };
  for (const tab of tabDefs) {
    const button = el('button', 'stage-tab', tab.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => selectTab(tab.id));
    tabs.appendChild(button);
    tabButtons.set(tab.id, button);
    const panel = el('section', `stage-panel stage-panel-${tab.id}`);
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    panels.appendChild(panel);
    panelNodes.set(tab.id, panel);
  }

  // 操作
  const playPanel = panelNodes.get('play')!;
  const playGroup = el('div', 'stage-group');
  const pauseButton = el('button', 'stage-action stage-action-primary');
  pauseButton.type = 'button';
  const resetButton = el('button', 'stage-action', '重置遊戲');
  resetButton.type = 'button';
  playGroup.append(pauseButton, resetButton);
  const slotTitle = el('h3', 'stage-heading', '即時存檔');
  const slotList = el('div', 'stage-slots');
  const slotStatus = new Map<number, HTMLElement>();
  const updateSlotStatus = () => {
    if (!actions.describeSlot) return;
    for (const [slot, node] of slotStatus) {
      void actions.describeSlot(slot).then((text) => { node.textContent = text; }).catch(() => { node.textContent = ''; });
    }
  };
  for (const slot of SAVE_SLOTS) {
    const row = el('div', 'stage-slot');
    const name = el('span', 'stage-slot-name', slot === 0 ? '欄位 1（F5 / F7）' : `欄位 ${slot + 1}`);
    if (actions.describeSlot) {
      const status = el('small', 'stage-slot-status');
      slotStatus.set(slot, status);
      name.appendChild(status);
    }
    row.appendChild(name);
    const save = el('button', 'stage-action stage-action-small', '存檔');
    save.type = 'button';
    save.addEventListener('click', () => {
      actions.save(slot);
      window.setTimeout(updateSlotStatus, 400);
    });
    const load = el('button', 'stage-action stage-action-small', '讀取');
    load.type = 'button';
    load.addEventListener('click', () => actions.load(slot));
    row.append(save, load);
    slotList.appendChild(row);
  }
  const systemGroup = el('div', 'stage-group');
  const romButton = el('button', 'stage-action', '載入本機 ROM');
  romButton.type = 'button';
  const lobbyButton = el('button', 'stage-action stage-action-danger', '返回遊戲大廳');
  lobbyButton.type = 'button';
  systemGroup.append(romButton, lobbyButton);
  playPanel.append(playGroup, slotTitle, slotList, systemGroup);

  // 額外分頁
  const extraHandles = new Map<string, { refresh(): void; release?(): void }>();
  for (const tab of extraTabs) {
    extraHandles.set(tab.id, tab.mount(panelNodes.get(tab.id)!));
  }

  // 按鍵
  const keysPanel = panelNodes.get('keys')!;
  const bindingPanel: BindingPanel = mountBindingPanel(keysPanel, bindings, actions.notify);

  // 畫面
  const screenPanel = panelNodes.get('screen')!;
  const toggleRows: Array<{ key: keyof StageSettings; label: string; hint: string }> = [
    { key: 'frame', label: '主機外框', hint: '依主機顯示機身與跑馬燈；關閉後畫面更大。' },
    { key: 'integerScale', label: '整數倍縮放', hint: '像素不糊；放不下整數倍時自動回到填滿。' },
    { key: 'scanlines', label: '掃描線', hint: '疊加細緻橫紋，模擬映像管質感。' },
  ];
  const toggleInputs = new Map<keyof StageSettings, HTMLInputElement>();
  for (const row of toggleRows) {
    const label = el('label', 'stage-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = settings[row.key];
    input.addEventListener('change', () => {
      settings[row.key] = input.checked;
      saveSettings(settings);
      applySettings();
    });
    toggleInputs.set(row.key, input);
    const copy = el('span', 'stage-toggle-copy');
    copy.append(el('strong', undefined, row.label), el('small', undefined, row.hint));
    label.append(input, copy);
    screenPanel.appendChild(label);
  }

  // 說明
  const helpPanel = panelNodes.get('help')!;
  const shortcuts: Array<[string, string]> = [
    ['M / F1', '開關選單'],
    ['Esc', '關閉選單（選單關閉時返回大廳）'],
    ['F5 / F7', '快速存檔 / 讀檔（欄位 1）'],
    ['Shift + F1~F4', '存到欄位 2~5'],
    ['Ctrl + 1~4', '讀取欄位 2~5'],
    ['按住 Tab', '快轉'],
    ['按住 Backspace', '倒帶（需在「功能」啟用）'],
  ];
  const helpList = el('dl', 'stage-help');
  for (const [keys, text] of shortcuts) {
    helpList.append(el('dt', undefined, keys), el('dd', undefined, text));
  }
  helpPanel.appendChild(helpList);

  drawer.append(drawerHead, tabs, panels);
  shell.append(hud, scrim, drawer);

  // ---- 行為 ----
  let isOpen = false;
  let lastFocus: HTMLElement | null = null;

  const applySettings = () => {
    document.body.classList.toggle('stage-integer', settings.integerScale);
    document.body.classList.toggle('fx-scanlines', settings.scanlines);
    document.body.classList.toggle('stage-no-frame', !settings.frame);
    scheduleFit();
  };

  const updatePauseLabel = () => {
    pauseButton.textContent = actions.isRunning() ? '暫停' : '繼續';
  };

  const openDrawer = () => {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updatePauseLabel();
    updateSlotStatus();
    drawer.hidden = false;
    scrim.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    selectTab(tabButtons.has('play') ? 'play' : tabDefs[0].id);
    requestAnimationFrame(() => {
      drawer.classList.add('is-open');
      scrim.classList.add('is-open');
      drawer.focus();
    });
  };

  const closeDrawer = () => {
    if (!isOpen) return;
    isOpen = false;
    bindingPanel.cancelCapture();
    for (const handle of extraHandles.values()) handle.release?.();
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    drawer.hidden = true;
    scrim.hidden = true;
    (lastFocus && document.contains(lastFocus) ? lastFocus : menuButton).focus({ preventScroll: true });
  };

  const toggleDrawer = () => (isOpen ? closeDrawer() : openDrawer());

  menuButton.addEventListener('click', toggleDrawer);
  closeButton.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  fullscreenButton.addEventListener('click', () => actions.toggleFullscreen());
  pauseButton.addEventListener('click', () => {
    if (actions.isRunning()) actions.pause();
    else actions.resume();
    updatePauseLabel();
  });
  resetButton.addEventListener('click', () => {
    actions.reset();
    closeDrawer();
  });
  romButton.addEventListener('click', () => actions.openRomFile());
  lobbyButton.addEventListener('click', () => {
    closeDrawer();
    actions.returnToLobby();
  });
  tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const order = tabDefs.map((tab) => tab.id);
    const current = order.find((id) => tabButtons.get(id)?.getAttribute('aria-selected') === 'true') ?? order[0];
    const next = order[(order.indexOf(current) + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    selectTab(next);
    tabButtons.get(next)?.focus();
  });

  window.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('desktop-ui') || !document.body.classList.contains('game-active')) return;
    if (document.body.classList.contains('binding-capture')) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && ['text', 'search', 'url', 'email', 'number', 'password', 'tel'].includes(target.type)))) {
      if (isOpen && event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDrawer();
      }
      return;
    }
    const modified = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
    if (!modified && (event.code === 'KeyM' || event.code === 'F1')) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) toggleDrawer();
      return;
    }
    if (isOpen && event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
      return;
    }
    if (isOpen && event.code === 'Tab') {
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]'))
        .filter((node) => !node.closest('[hidden]'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === drawer)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }, true);

  // ---- 版面：不裁切、不變形地放入最大的畫面，並把按鈕放進黑邊 ----
  let fitFrame: number | null = null;
  function scheduleFit(): void {
    if (fitFrame !== null) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = null;
      applyFit();
    });
  }

  const findScreen = (): HTMLElement | null => {
    for (const id of ['screen', 'canvas', 'snes9x-screen']) {
      const node = document.getElementById(id);
      if (node && getComputedStyle(node).display !== 'none') return node;
    }
    return null;
  };

  function applyFit(): void {
    const body = document.body;
    if (!body.classList.contains('desktop-ui') || !body.classList.contains('game-active')) return;
    const screenNode = findScreen();
    if (!screenNode || !bezel) return;

    const fullscreen = actions.isFullscreen();
    const shellRect = shell.getBoundingClientRect();
    const hudHeight = fullscreen ? 0 : hud.offsetHeight;
    const frameStyle = getComputedStyle(bezel);
    const chromeX = fullscreen ? 0 : Number.parseFloat(frameStyle.getPropertyValue('--frame-x')) || 0;
    const chromeY = fullscreen ? 0 : Number.parseFloat(frameStyle.getPropertyValue('--frame-y')) || 0;

    let aspect = parseAspectRatio(screenNode.style.aspectRatio) ?? 0;
    if (!aspect && screenNode instanceof HTMLCanvasElement && screenNode.height > 0) aspect = screenNode.width / screenNode.height;
    if (!aspect) aspect = 4 / 3;
    const nativeHeight = screenNode instanceof HTMLCanvasElement && screenNode.id === 'screen' ? screenNode.height : 0;

    const fit = computeStageFit({
      areaWidth: shellRect.width,
      areaHeight: shellRect.height - hudHeight,
      chromeX,
      chromeY,
      margin: fullscreen ? 0 : FRAME_MARGIN,
      aspect,
      nativeHeight,
      integerScale: settings.integerScale,
    });
    shell.style.setProperty('--stage-w', `${fit.width}px`);
    shell.style.setProperty('--stage-h', `${fit.height}px`);
    shell.style.setProperty('--stage-top', `${hudHeight}px`);
    body.classList.toggle('stage-fit-integer', fit.integer);

    placeHud(fullscreen, shellRect, fit.width, fit.height);
  }

  function placeHud(fullscreen: boolean, shellRect: DOMRect, width: number, height: number): void {
    if (!fullscreen) {
      hud.dataset.placement = 'top-bar';
      hud.style.removeProperty('left');
      hud.style.removeProperty('top');
      return;
    }
    const free = {
      left: (shellRect.width - width) / 2,
      right: (shellRect.width - width) / 2,
      top: (shellRect.height - height) / 2,
      bottom: (shellRect.height - height) / 2,
    };
    const placement = chooseHudPlacement(free);
    hud.dataset.placement = placement;
    const hudWidth = hud.offsetWidth;
    const hudHeight = hud.offsetHeight;
    let left = shellRect.width - hudWidth - 12;
    let top = 12;
    if (placement === 'right-bar') {
      left = shellRect.width - free.right + Math.max(8, (free.right - hudWidth) / 2);
      left = Math.min(left, shellRect.width - hudWidth - 4);
    } else if (placement === 'top-bar') {
      top = Math.max(4, (free.top - hudHeight) / 2);
    }
    hud.style.left = `${Math.max(4, left)}px`;
    hud.style.top = `${top}px`;
  }

  // 全螢幕：自動收起選單，滑鼠移動時才顯示浮在畫面上的按鈕。
  let hudIdleTimer: number | null = null;
  const wakeHud = () => {
    hud.classList.remove('is-idle');
    if (hudIdleTimer !== null) window.clearTimeout(hudIdleTimer);
    hudIdleTimer = window.setTimeout(() => {
      if (hud.dataset.placement === 'overlay' && !isOpen) hud.classList.add('is-idle');
    }, 2500);
  };
  shell.addEventListener('mousemove', wakeHud, { passive: true });

  document.addEventListener('fullscreenchange', () => {
    if (actions.isFullscreen()) closeDrawer();
    wakeHud();
    scheduleFit();
    requestAnimationFrame(scheduleFit);
  });
  window.addEventListener('resize', scheduleFit, { passive: true });
  new ResizeObserver(scheduleFit).observe(shell);
  const screenInner = shell.querySelector('.screen-inner');
  if (screenInner) new MutationObserver(scheduleFit).observe(screenInner, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  new MutationObserver(scheduleFit).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-system'] });

  applySettings();

  return {
    refresh() {
      const system = document.body.dataset.system ?? 'nes';
      const label = SYSTEM_LABELS[system] ?? system.toUpperCase();
      const title = actions.getGameTitle();
      for (const node of [marqueeSystem, hudSystem, drawerSystem]) node.textContent = label;
      for (const node of [marqueeTitle, hudGame, drawerGame]) node.textContent = title;
      if (isOpen && !panelNodes.get('keys')?.hidden) bindingPanel.showLayout(actions.getLayout());
      for (const [id, handle] of extraHandles) if (isOpen && !panelNodes.get(id)?.hidden) handle.refresh();
      updatePauseLabel();
      updateSlotStatus();
      scheduleFit();
    },
    toggleDrawer,
    closeDrawer,
  };
}
