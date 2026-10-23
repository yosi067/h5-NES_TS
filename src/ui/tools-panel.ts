import type { CheatEntry } from '../features/cheats';
import { PLAYER2_HELP } from '../features/player2';
import {
  PAD_OPACITY_CHOICES,
  PAD_SCALE_CHOICES,
  type FeatureSettings,
  type FeatureSettingsStore,
} from '../features/settings';

/** 目前遊戲支援哪些功能（依核心而定）。 */
export interface ToolsCapabilities {
  fastForward: boolean;
  rewind: boolean;
  /** 倒帶不可用或需要重新載入時顯示的原因。 */
  rewindNote?: string;
  screenshot: boolean;
  /** 金手指格式說明；null 表示此核心不支援。 */
  cheatHint: string | null;
  twoPlayer: boolean;
  autosave: boolean;
}

export interface ToolsApi {
  settings: FeatureSettingsStore;
  capabilities(): ToolsCapabilities;
  isFastForwardOn(): boolean;
  setFastForward(on: boolean): void;
  rewindHold(active: boolean): void;
  screenshot(): void;
  getCheats(): CheatEntry[];
  /** 套用金手指並回傳錯誤訊息清單。 */
  setCheats(entries: CheatEntry[]): string[];
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
  /** 放開倒帶等長按狀態（關閉面板時呼叫）。 */
  release(): void;
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

function toggleRow(label: string, hint: string, checked: boolean, onChange: (checked: boolean) => void): {
  row: HTMLLabelElement;
  input: HTMLInputElement;
  hintNode: HTMLElement;
} {
  const row = el('label', 'stage-toggle');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const copy = el('span', 'stage-toggle-copy');
  const hintNode = el('small', undefined, hint);
  copy.append(el('strong', undefined, label), hintNode);
  row.append(input, copy);
  return { row, input, hintNode };
}

function choiceRow<T extends number>(
  label: string,
  choices: readonly T[],
  format: (value: T) => string,
  current: T,
  onChange: (value: T) => void,
): { row: HTMLElement; sync(value: T): void } {
  const row = el('div', 'tools-choice');
  row.appendChild(el('span', 'tools-choice-label', label));
  const group = el('div', 'tools-segment');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const buttons = choices.map((value) => {
    const node = button(format(value), 'tools-segment-btn');
    node.setAttribute('role', 'radio');
    node.addEventListener('click', () => onChange(value));
    group.appendChild(node);
    return { value, node };
  });
  const sync = (value: T) => {
    for (const item of buttons) item.node.setAttribute('aria-checked', String(item.value === value));
  };
  sync(current);
  row.appendChild(group);
  return { row, sync };
}

export function mountToolsPanel(
  container: HTMLElement,
  api: ToolsApi,
  options: { includeSlots: boolean; includeTouch: boolean; keyboardHints: boolean },
): ToolsPanel {
  container.classList.add('tools-panel');
  let settings: FeatureSettings = api.settings.get();

  // ---- 速度與倒帶 ----
  const speedHeading = el('h3', 'stage-heading', '速度');
  const speedGroup = el('div', 'stage-group');
  const fastButton = button('⏩ 快轉');
  fastButton.setAttribute('aria-pressed', 'false');
  const rewindButton = button('⏪ 按住倒帶');
  rewindButton.classList.add('tools-hold');
  speedGroup.append(fastButton, rewindButton);
  const speedChoice = choiceRow('快轉倍率', [2, 3, 4] as const, (value) => `${value}×`, settings.fastForwardSpeed,
    (value) => api.settings.update({ fastForwardSpeed: value }));
  const rewindToggle = toggleRow('啟用倒帶', '每 1/3 秒保留一份快照（最多約 10 秒）。會增加記憶體用量，預設關閉。',
    settings.rewindEnabled, (checked) => api.settings.update({ rewindEnabled: checked }));
  const speedNote = el('p', 'tools-note');
  if (options.keyboardHints) speedNote.textContent = '鍵盤：按住 Tab 快轉、按住 Backspace 倒帶。';

  fastButton.addEventListener('click', () => {
    api.setFastForward(!api.isFastForwardOn());
    refresh();
  });
  let rewindPointer: number | null = null;
  const endRewind = () => {
    if (rewindPointer === null) return;
    rewindPointer = null;
    rewindButton.classList.remove('is-active');
    api.rewindHold(false);
  };
  rewindButton.addEventListener('pointerdown', (event) => {
    if (rewindButton.disabled) return;
    event.preventDefault();
    rewindPointer = event.pointerId;
    try { rewindButton.setPointerCapture(event.pointerId); } catch { /* 舊瀏覽器 */ }
    rewindButton.classList.add('is-active');
    api.rewindHold(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    rewindButton.addEventListener(type, endRewind);
  }
  rewindButton.addEventListener('contextmenu', (event) => event.preventDefault());

  // ---- 截圖 / 自動存檔 ----
  const captureHeading = el('h3', 'stage-heading', '紀錄');
  const captureGroup = el('div', 'stage-group');
  const shotButton = button('📷 截圖');
  shotButton.addEventListener('click', () => api.screenshot());
  captureGroup.append(shotButton);
  const autosaveToggle = toggleRow('離開時自動存檔', '關閉分頁、切到背景或返回大廳時自動保存進度，下次開同一款遊戲可選擇續玩。',
    settings.autosave, (checked) => api.settings.update({ autosave: checked }));

  // ---- 存檔欄位（手機） ----
  const slotHeading = el('h3', 'stage-heading', '即時存檔');
  const slotList = el('div', 'stage-slots');
  const slotStatus = new Map<number, HTMLElement>();
  if (options.includeSlots && api.slots) {
    for (const slot of api.slots.list) {
      const row = el('div', 'stage-slot');
      const name = el('span', 'stage-slot-name');
      const title = el('span', undefined, api.slots.label(slot));
      const status = el('small', 'tools-slot-status', '…');
      name.append(title, status);
      slotStatus.set(slot, status);
      const save = button('存檔', 'stage-action stage-action-small');
      save.addEventListener('click', async () => {
        const ok = await api.slots!.save(slot);
        api.notify(ok ? '✅ 存檔成功' : '❌ 存檔失敗');
        void updateSlots();
      });
      const load = button('讀取', 'stage-action stage-action-small');
      load.addEventListener('click', async () => {
        const ok = await api.slots!.load(slot);
        api.notify(ok ? '✅ 讀取成功' : '❌ 沒有有效存檔');
      });
      row.append(name, save, load);
      slotList.appendChild(row);
    }
  }
  const updateSlots = async () => {
    if (!api.slots) return;
    for (const [slot, node] of slotStatus) {
      try { node.textContent = await api.slots.describe(slot); } catch { node.textContent = ''; }
    }
  };

  // ---- 雙人 ----
  const playersHeading = el('h3', 'stage-heading', '雙人遊玩');
  const twoPlayerToggle = toggleRow('鍵盤第二玩家', '第二支手把會自動成為 2P；開啟後鍵盤也能操作 2P（1P 已用的鍵優先）。',
    settings.twoPlayerKeyboard, (checked) => api.settings.update({ twoPlayerKeyboard: checked }));
  const playerHelp = el('dl', 'stage-help tools-help');
  for (const [keys, text] of PLAYER2_HELP) playerHelp.append(el('dt', undefined, keys), el('dd', undefined, text));
  const playerNote = el('p', 'tools-note');

  // ---- 金手指 ----
  const cheatHeading = el('h3', 'stage-heading', '金手指');
  const cheatNote = el('p', 'tools-note');
  const cheatList = el('div', 'tools-cheat-list');
  const cheatForm = el('form', 'tools-cheat-form');
  const codeInput = el('input', 'tools-input');
  codeInput.placeholder = '代碼，例如 SXIOPO 或 0075:09';
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  codeInput.setAttribute('aria-label', '金手指代碼');
  const labelInput = el('input', 'tools-input');
  labelInput.placeholder = '說明（選填）';
  labelInput.setAttribute('aria-label', '金手指說明');
  const addButton = button('加入');
  addButton.type = 'submit';
  cheatForm.append(codeInput, labelInput, addButton);
  const cheatErrors = el('p', 'tools-error');
  cheatErrors.hidden = true;

  const applyCheats = (entries: CheatEntry[]) => {
    const errors = api.setCheats(entries);
    cheatErrors.hidden = errors.length === 0;
    cheatErrors.textContent = errors.join('；');
    renderCheats();
  };
  const renderCheats = () => {
    cheatList.replaceChildren();
    const entries = api.getCheats();
    if (entries.length === 0) {
      cheatList.appendChild(el('p', 'tools-empty', '尚未加入代碼。'));
      return;
    }
    entries.forEach((entry, index) => {
      const row = el('label', 'tools-cheat');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = entry.enabled;
      input.addEventListener('change', () => {
        const next = api.getCheats();
        next[index] = { ...next[index], enabled: input.checked };
        applyCheats(next);
      });
      const copy = el('span', 'tools-cheat-copy');
      copy.append(el('code', undefined, entry.code));
      if (entry.label) copy.append(el('small', undefined, entry.label));
      const remove = button('刪除', 'stage-action stage-action-small');
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        const next = api.getCheats();
        next.splice(index, 1);
        applyCheats(next);
      });
      row.append(input, copy, remove);
      cheatList.appendChild(row);
    });
  };
  cheatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;
    applyCheats([...api.getCheats(), { code, label: labelInput.value.trim(), enabled: true }]);
    codeInput.value = '';
    labelInput.value = '';
  });
  // 輸入框不要把按鍵傳給遊戲（避免打字時角色亂動或觸發快捷鍵）。
  for (const input of [codeInput, labelInput]) {
    input.addEventListener('keydown', (event) => event.stopPropagation());
    input.addEventListener('keyup', (event) => event.stopPropagation());
  }

  // ---- 觸控按鍵（手機） ----
  const touchHeading = el('h3', 'stage-heading', '觸控按鍵');
  const opacityChoice = choiceRow('不透明度', PAD_OPACITY_CHOICES, (value) => `${value}%`, settings.padOpacity as typeof PAD_OPACITY_CHOICES[number],
    (value) => api.settings.update({ padOpacity: value }));
  const scaleChoice = choiceRow('按鍵大小', PAD_SCALE_CHOICES, (value) => `${value}%`, settings.padScale as typeof PAD_SCALE_CHOICES[number],
    (value) => api.settings.update({ padScale: value }));
  const touchNote = el('p', 'tools-note', '100% 為原本外觀；放大時按鍵會往螢幕邊緣延伸，不影響畫面配置。');

  // ---- 存檔備份 ----
  const backupHeading = el('h3', 'stage-heading', '存檔備份');
  const backupGroup = el('div', 'stage-group');
  const exportButton = button('匯出全部存檔');
  const importButton = button('匯入備份檔');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  backupGroup.append(exportButton, importButton, fileInput);
  const backupNote = el('p', 'tools-note', '包含即時存檔、電池存檔、N64 存檔、金手指與最愛清單。可在另一台裝置匯入。');
  exportButton.addEventListener('click', () => { void api.exportBackup(); });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void api.importBackup(file).then(() => updateSlots());
  });

  container.append(speedHeading, speedGroup, speedChoice.row, rewindToggle.row);
  if (options.keyboardHints) container.append(speedNote);
  container.append(captureHeading, captureGroup, autosaveToggle.row);
  if (options.includeSlots && api.slots) container.append(slotHeading, slotList);
  container.append(playersHeading, twoPlayerToggle.row);
  if (options.keyboardHints) container.append(playerHelp);
  container.append(playerNote, cheatHeading, cheatNote, cheatList, cheatForm, cheatErrors);
  if (options.includeTouch) container.append(touchHeading, opacityChoice.row, scaleChoice.row, touchNote);
  container.append(backupHeading, backupGroup, backupNote);

  function refresh(): void {
    settings = api.settings.get();
    const caps = api.capabilities();
    fastButton.disabled = !caps.fastForward;
    const fastOn = caps.fastForward && api.isFastForwardOn();
    fastButton.setAttribute('aria-pressed', String(fastOn));
    fastButton.classList.toggle('stage-action-primary', fastOn);
    fastButton.textContent = fastOn ? `⏩ 快轉中（${settings.fastForwardSpeed}×）` : '⏩ 快轉';
    speedChoice.sync(settings.fastForwardSpeed);
    rewindToggle.input.checked = settings.rewindEnabled;
    rewindButton.disabled = !caps.rewind || !settings.rewindEnabled;
    rewindToggle.hintNode.textContent = caps.rewindNote
      ?? '每 1/3 秒保留一份快照（最多約 10 秒）。會增加記憶體用量，預設關閉。';
    shotButton.disabled = !caps.screenshot;
    autosaveToggle.input.checked = settings.autosave;
    autosaveToggle.input.disabled = !caps.autosave;
    twoPlayerToggle.input.checked = settings.twoPlayerKeyboard;
    playerNote.textContent = caps.twoPlayer ? '' : '此主機或核心不支援第二玩家。';
    playerNote.hidden = caps.twoPlayer;
    const cheatsSupported = caps.cheatHint !== null;
    cheatNote.textContent = cheatsSupported
      ? `${caps.cheatHint}金手指每次開遊戲都預設關閉；啟用期間的存檔會包含修改後的數值。`
      : '此核心不支援金手指。';
    for (const node of [codeInput, labelInput, addButton]) node.disabled = !cheatsSupported;
    cheatList.hidden = !cheatsSupported;
    renderCheats();
    opacityChoice.sync(settings.padOpacity as typeof PAD_OPACITY_CHOICES[number]);
    scaleChoice.sync(settings.padScale as typeof PAD_SCALE_CHOICES[number]);
    void updateSlots();
  }

  api.settings.subscribe(() => refresh());
  refresh();
  return { refresh, release: endRewind };
}
