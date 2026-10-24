import {
  PAD_OPACITY_CHOICES,
  PAD_SCALE_CHOICES,
  SKINS,
  type FeatureSettingsStore,
} from '../features/settings';

/**
 * 精簡功能面板：只放「點一下就懂」的東西。
 * - 快轉：一顆按鈕，關 → 2× → 4× → 關 循環
 * - 存檔欄位（手機）：存 / 讀，旁邊顯示存檔時間
 * - 按鍵外觀（手機）：透明度、大小
 * - 存檔備份：匯出 / 匯入
 */
export interface ToolsApi {
  settings: FeatureSettingsStore;
  canFastForward(): boolean;
  /** 目前快轉倍率；1 表示關閉。 */
  fastForwardLevel(): number;
  setFastForwardLevel(level: 1 | 2 | 4): void;
  exportBackup(): Promise<void>;
  importBackup(file: File): Promise<void>;
  notify(message: string): void;
  slots?: {
    list: number[];
    label(slot: number): string;
    describe(slot: number): Promise<string>;
    save(slot: number): Promise<boolean>;
    load(slot: number): Promise<boolean>;
  };
}

export interface ToolsPanel {
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className = 'stage-action'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

function segmentRow<T extends number>(
  label: string,
  choices: ReadonlyArray<{ value: T; text: string }>,
  onChange: (value: T) => void,
): { row: HTMLElement; sync(value: T): void } {
  const row = el('div', 'tools-choice');
  row.appendChild(el('span', 'tools-choice-label', label));
  const group = el('div', 'tools-segment');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const items = choices.map((choice) => {
    const node = button(choice.text, 'tools-segment-btn');
    node.setAttribute('role', 'radio');
    node.addEventListener('click', () => onChange(choice.value));
    group.appendChild(node);
    return { value: choice.value, node };
  });
  row.appendChild(group);
  return {
    row,
    sync: (value) => { for (const item of items) item.node.setAttribute('aria-checked', String(item.value === value)); },
  };
}

const NEXT_FAST_FORWARD: Record<number, 1 | 2 | 4> = { 1: 2, 2: 4, 4: 1 };

export function mountToolsPanel(
  container: HTMLElement,
  api: ToolsApi,
  options: { includeSlots: boolean; includeTouch: boolean },
): ToolsPanel {
  container.classList.add('tools-panel');

  // ---- 快轉 ----
  const fastButton = button('', 'stage-action tools-fast');
  fastButton.addEventListener('click', () => {
    api.setFastForwardLevel(NEXT_FAST_FORWARD[api.fastForwardLevel()] ?? 1);
    refresh();
  });
  container.appendChild(fastButton);

  // ---- 存檔欄位 ----
  const slotStatus = new Map<number, HTMLElement>();
  if (options.includeSlots && api.slots) {
    const slots = api.slots;
    container.appendChild(el('h3', 'stage-heading', '存檔'));
    const list = el('div', 'stage-slots');
    for (const slot of slots.list) {
      const row = el('div', 'stage-slot');
      const name = el('span', 'stage-slot-name');
      name.append(el('span', undefined, slots.label(slot)));
      const status = el('small', 'tools-slot-status', '');
      name.append(status);
      slotStatus.set(slot, status);
      const save = button('存', 'stage-action stage-action-small');
      save.addEventListener('click', async () => {
        const ok = await slots.save(slot);
        api.notify(ok ? '✅ 已存檔' : '❌ 存檔失敗');
        void updateSlots();
      });
      const load = button('讀', 'stage-action stage-action-small');
      load.addEventListener('click', async () => {
        const ok = await slots.load(slot);
        api.notify(ok ? '✅ 已讀取' : '這格沒有存檔');
      });
      row.append(name, save, load);
      list.appendChild(row);
    }
    container.appendChild(list);
  }
  const updateSlots = async () => {
    if (!api.slots) return;
    for (const [slot, node] of slotStatus) {
      try { node.textContent = await api.slots.describe(slot); } catch { node.textContent = ''; }
    }
  };

  // ---- 機身樣式 ----
  const skinPicker = options.includeTouch ? mountSkinPicker(container, api.settings) : null;

  // ---- 按鍵外觀 ----
  let opacity: ReturnType<typeof segmentRow<number>> | null = null;
  let scale: ReturnType<typeof segmentRow<number>> | null = null;
  if (options.includeTouch) {
    container.appendChild(el('h3', 'stage-heading', '按鍵外觀'));
    const opacityText: Record<number, string> = { 100: '清楚', 70: '半透明', 40: '很淡' };
    const scaleText: Record<number, string> = { 90: '小', 100: '標準', 115: '大' };
    opacity = segmentRow('透明度', PAD_OPACITY_CHOICES.map((value) => ({ value: value as number, text: opacityText[value] })),
      (value) => api.settings.update({ padOpacity: value }));
    scale = segmentRow('大小', PAD_SCALE_CHOICES.map((value) => ({ value: value as number, text: scaleText[value] })),
      (value) => api.settings.update({ padScale: value }));
    container.append(opacity.row, scale.row);
  }

  // ---- 存檔備份 ----
  container.appendChild(el('h3', 'stage-heading', '換手機或清除瀏覽器前'));
  const backupGroup = el('div', 'stage-group');
  const exportButton = button('備份存檔');
  const importButton = button('還原備份');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  backupGroup.append(exportButton, importButton, fileInput);
  container.appendChild(backupGroup);
  exportButton.addEventListener('click', () => { void api.exportBackup(); });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void api.importBackup(file).then(() => updateSlots());
  });

  function refresh(): void {
    const settings = api.settings.get();
    const level = api.fastForwardLevel();
    const canFast = api.canFastForward();
    fastButton.disabled = !canFast;
    fastButton.textContent = !canFast ? '⏩ 此遊戲不能快轉' : level > 1 ? `⏩ 快轉中 ${level}×（再按切換）` : '⏩ 快轉';
    fastButton.classList.toggle('stage-action-primary', canFast && level > 1);
    fastButton.setAttribute('aria-pressed', String(level > 1));
    skinPicker?.refresh();
    opacity?.sync(settings.padOpacity);
    scale?.sync(settings.padScale);
    void updateSlots();
  }

  api.settings.subscribe(() => refresh());
  refresh();
  return { refresh };
}

/** 機身樣式色塊：點一下立即套用。 */
export function mountSkinPicker(container: HTMLElement, settings: FeatureSettingsStore): { refresh(): void } {
  container.appendChild(el('h3', 'stage-heading', '機身畫風'));
  const grid = el('div', 'skin-picker');
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', '機身畫風');
  const items = SKINS.map((skin) => {
    const node = button('', 'skin-chip');
    node.setAttribute('role', 'radio');
    node.dataset.style = skin.id;
    node.title = skin.hint;
    node.append(el('span', 'skin-chip-swatch'), el('span', 'skin-chip-name', skin.name));
    node.addEventListener('click', () => settings.update({ skin: skin.id }));
    grid.appendChild(node);
    return { id: skin.id, node };
  });
  container.appendChild(grid);
  const refresh = () => {
    const current = settings.get().skin;
    for (const item of items) item.node.setAttribute('aria-checked', String(item.id === current));
  };
  refresh();
  return { refresh };
}

/** 電腦版外框：大型機台 / 原本主機外框。 */
export function mountDesktopFramePicker(container: HTMLElement, settings: FeatureSettingsStore): { refresh(): void } {
  container.appendChild(el('h3', 'stage-heading', '外框樣式'));
  const row = segmentRow<number>('外框', [{ value: 0, text: '大型機台' }, { value: 1, text: '原本主機外框' }],
    (value) => settings.update({ desktopFrame: value === 1 ? 'classic' : 'arcade' }));
  container.appendChild(row.row);
  const refresh = () => row.sync(settings.get().desktopFrame === 'classic' ? 1 : 0);
  refresh();
  settings.subscribe(refresh);
  return { refresh };
}
