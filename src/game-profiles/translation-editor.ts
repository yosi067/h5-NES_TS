import './translation-editor.css';

// Standalone editor: no emulator, shared profile modules, remote fonts or APIs.
interface LocalizationEntry {
  id: string;
  category: string;
  source: string;
  translation: string;
  notes?: string;
}

interface LocalizationDocument {
  format: 'nes-localization';
  version: 1;
  gameId: 'captain-tsubasa-2-jp';
  sourceSha256: string;
  locale: 'zh-Hant';
  entries: LocalizationEntry[];
  values: [];
}

const STORAGE_KEY = 'nes-localization:captain-tsubasa-2-jp:zh-Hant:v1';
const CATALOG_URL = new URL('./game-profiles/captain-tsubasa-2-jp/localization.json', document.baseURI);
const MAX_BYTES = 4 * 1024 * 1024;
const PAGE_SIZE = 40;
const MAX_ENTRIES = 10_000;
const TEXT_LIMIT = 16_384;
const NOTES_LIMIT = 4_096;
const encoder = new TextEncoder();

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing editor element: ${id}`);
  return node as T;
}

const ui = {
  notification: element('notification'),
  saveState: element('save-state'),
  saveDot: element('save-dot'),
  save: element<HTMLButtonElement>('save-button'),
  export: element<HTMLButtonElement>('export-button'),
  import: element<HTMLButtonElement>('import-button'),
  file: element<HTMLInputElement>('import-file'),
  filters: element<HTMLFieldSetElement>('filters'),
  search: element<HTMLInputElement>('search'),
  category: element<HTMLSelectElement>('category'),
  reviewFilter: element<HTMLSelectElement>('review-filter'),
  list: element<HTMLUListElement>('entry-list'),
  previous: element<HTMLButtonElement>('previous-page'),
  next: element<HTMLButtonElement>('next-page'),
  translation: element<HTMLTextAreaElement>('translation'),
  notes: element<HTMLTextAreaElement>('notes'),
  reviewed: element<HTMLInputElement>('review-check'),
  externalDraft: element('external-draft'),
};

let catalog: LocalizationDocument | null = null;
let entries: LocalizationEntry[] = [];
let entryById = new Map<string, LocalizationEntry>();
const reviewedIds = new Set<string>(); // Deliberately not part of the exchange contract.
let selectedId: string | null = null;
let page = 0;
let dirty = false;
let busy = false;
let observedStorage: string | null = null;
let storageReadable = true;
let revision = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function notify(message: string, error = false): void {
  ui.notification.textContent = message;
  ui.notification.classList.toggle('error', error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function assertKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    fail('檔案包含此版本不支援的欄位。');
  }
}

function boundedString(value: unknown, limit: number, label: string, nonempty = false): string {
  if (typeof value !== 'string' || value.length > limit || (nonempty && !value.trim())) {
    fail(`${label}格式不正確或超過長度限制（${limit.toLocaleString()} 字元）。`);
  }
  return value;
}

/** Creates fresh objects; never trusts imported ids, categories or source text for edits. */
function validateDocument(raw: unknown, baseline?: LocalizationDocument): LocalizationDocument {
  if (!isRecord(raw)) fail('檔案必須是單一 JSON 物件。');
  assertKeys(raw, ['format', 'version', 'gameId', 'sourceSha256', 'locale', 'entries', 'values']);
  if (raw.format !== 'nes-localization' || raw.version !== 1 ||
      raw.gameId !== 'captain-tsubasa-2-jp' || raw.locale !== 'zh-Hant') {
    fail('交換格式、版本、遊戲或語系不符。');
  }
  if (typeof raw.sourceSha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(raw.sourceSha256)) {
    fail('ROM SHA-256 必須是 64 位十六進位字串。');
  }
  if (baseline && raw.sourceSha256 !== baseline.sourceSha256) fail('ROM 身分不符，不能套用此翻譯。');
  if (!Array.isArray(raw.values) || raw.values.length !== 0) fail('能力數值尚未確認；values 必須是空陣列。');
  if (!Array.isArray(raw.entries) || raw.entries.length === 0 || raw.entries.length > MAX_ENTRIES) {
    fail(`entries 必須包含 1 至 ${MAX_ENTRIES.toLocaleString()} 條字串。`);
  }

  const originals = baseline ? new Map(baseline.entries.map(entry => [entry.id, entry])) : null;
  const incoming = new Map<string, LocalizationEntry>();
  for (const value of raw.entries) {
    if (!isRecord(value)) fail('字串項目格式不正確。');
    assertKeys(value, ['id', 'category', 'source', 'translation', 'notes']);
    const id = boundedString(value.id, 256, 'ID', true);
    const category = boundedString(value.category, 256, '分類', true);
    const source = boundedString(value.source, TEXT_LIMIT, '原文');
    const translation = boundedString(value.translation, TEXT_LIMIT, '譯文');
    const notes = value.notes === undefined ? undefined : boundedString(value.notes, NOTES_LIMIT, '備註');
    if (incoming.has(id)) fail(`ID 重複：${id}`);
    const original = originals?.get(id);
    if (originals && !original) fail(`未知 ID：${id}`);
    if (original && (source !== original.source || category !== original.category)) {
      fail(`原文或分類不符：${id}`);
    }
    incoming.set(id, {
      id: original?.id ?? id,
      category: original?.category ?? category,
      source: original?.source ?? source,
      translation,
      ...(notes === undefined ? {} : { notes }),
    });
  }
  if (baseline && (incoming.size !== baseline.entries.length || baseline.entries.some(entry => !incoming.has(entry.id)))) {
    fail('匯入檔缺少 ID；請使用包含全部字串的完整交換檔。');
  }
  return {
    format: 'nes-localization', version: 1, gameId: 'captain-tsubasa-2-jp',
    sourceSha256: baseline?.sourceSha256 ?? raw.sourceSha256,
    locale: 'zh-Hant',
    entries: baseline ? baseline.entries.map(entry => incoming.get(entry.id)!) : [...incoming.values()],
    values: [],
  };
}

function parseDocument(text: string, baseline?: LocalizationDocument): LocalizationDocument {
  if (text.length > MAX_BYTES || encoder.encode(text).byteLength > MAX_BYTES) fail('檔案超過 4 MiB 上限。');
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    fail('不是有效的 JSON 檔案。');
  }
  const result = validateDocument(raw, baseline);
  serialize(result); // Also guarantee the normalized document can be saved/exported.
  return result;
}

function serialize(value: LocalizationDocument): string {
  const text = JSON.stringify(value);
  if (encoder.encode(text).byteLength > MAX_BYTES) fail('完整翻譯已超過 4 MiB；請縮短譯文或備註後重試。');
  return text;
}

function currentDocument(): LocalizationDocument {
  if (!catalog) fail('請先載入可信任的字串目錄。');
  return { ...catalog, entries: entries.map(entry => ({ ...entry })), values: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '發生未知錯誤。';
}

function updateSaveState(label?: string): void {
  ui.saveState.textContent = label ?? (dirty ? '有尚未儲存的變更' : '尚無新變更');
  ui.saveDot.classList.toggle('unsaved', dirty);
}

function markDirty(): void {
  dirty = true;
  revision++;
  updateSaveState();
}

function statusOf(entry: LocalizationEntry): 'empty' | 'pending' | 'reviewed' {
  if (!entry.translation.trim()) return 'empty';
  return reviewedIds.has(entry.id) ? 'reviewed' : 'pending';
}

const stateLabels = { empty: '尚未翻譯', pending: '待校對', reviewed: '本次已校對' };
const categoryLabels: Record<string, string> = {
  opening: '開場', cutscene: '劇情', cutscenes: '劇情', dialogue: '對話',
  menu: '選單', menus: '選單', battle: '比賽', commentary: '賽事解說',
  player: '球員', players: '球員', team: '球隊', teams: '球隊',
  system: '系統', dictionary: '詞彙', story: '故事', other: '其他',
  battleMessage: '比賽訊息', interface: '介面文字',
};

function categoryLabel(category: string): string {
  return Object.prototype.hasOwnProperty.call(categoryLabels, category) ? categoryLabels[category] : category;
}

function updateProgress(): void {
  const translated = entries.filter(entry => entry.translation.trim()).length;
  const reviewed = entries.filter(entry => statusOf(entry) === 'reviewed').length;
  element('total-count').textContent = entries.length.toLocaleString();
  element('translated-count').textContent = translated.toLocaleString();
  element('empty-count').textContent = (entries.length - translated).toLocaleString();
  element('reviewed-count').textContent = reviewed.toLocaleString();
  element('completion').textContent = `${entries.length ? Math.floor(translated / entries.length * 100) : 0}% 已填寫`;
  const progress = element<HTMLProgressElement>('progress');
  progress.max = entries.length || 1;
  progress.value = translated;
}

function filteredEntries(): LocalizationEntry[] {
  const query = ui.search.value.trim().toLocaleLowerCase();
  const category = ui.category.value;
  const state = ui.reviewFilter.value;
  return entries.filter(entry => (!category || entry.category === category) &&
    (state === 'all' || statusOf(entry) === state) &&
    (!query || [entry.id, entry.category, entry.source, entry.translation, entry.notes ?? '']
      .some(text => text.toLocaleLowerCase().includes(query))));
}

function textNode(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function renderList(selectFirst = false): void {
  const matches = filteredEntries();
  const pages = Math.ceil(matches.length / PAGE_SIZE);
  page = Math.max(0, Math.min(page, pages - 1));
  const visible = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (selectFirst) selectedId = visible[0]?.id ?? null;
  const fragment = document.createDocumentFragment();
  for (const entry of visible) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-button';
    button.dataset.entryId = entry.id;
    if (selectedId === entry.id) button.setAttribute('aria-current', 'true');
    const header = textNode('span', 'entry-row-header', '');
    header.append(textNode('span', 'entry-row-id', entry.id), textNode('span', `row-status ${statusOf(entry)}`, stateLabels[statusOf(entry)]));
    const source = textNode('span', 'entry-row-source', entry.source || '（空原文）');
    source.lang = 'ja';
    button.append(header, source, textNode('span', 'entry-row-translation', entry.translation || '等待你的譯文…'));
    item.append(button);
    fragment.append(item);
  }
  ui.list.replaceChildren(fragment);
  element('empty-results').hidden = matches.length !== 0;
  element('result-count').textContent = `${matches.length.toLocaleString()} 條符合`;
  element('page-label').textContent = `${pages ? page + 1 : 0} / ${pages}`;
  ui.previous.disabled = page === 0;
  ui.next.disabled = page + 1 >= pages;
  if (selectFirst) renderEditor();
}

function selectedEntry(): LocalizationEntry | undefined {
  return selectedId === null ? undefined : entryById.get(selectedId);
}

function updatePreview(entry: LocalizationEntry): void {
  const hasTranslation = Boolean(entry.translation.trim());
  const preview = element('preview-text');
  preview.textContent = hasTranslation ? entry.translation : entry.source || '（空原文）';
  preview.lang = hasTranslation ? 'zh-Hant' : 'ja';
  element('preview-kind').textContent = hasTranslation ? '繁中譯文' : '原文參考';
  element('translation-length').textContent = `${entry.translation.length.toLocaleString()} / 16,384`;
  const state = statusOf(entry);
  element('entry-state').textContent = stateLabels[state];
  element('entry-state').className = `state-pill ${state}`;
  ui.reviewed.checked = state === 'reviewed';
  ui.reviewed.disabled = !hasTranslation;
}

function renderEditor(): void {
  const entry = selectedEntry();
  element('editor-empty').hidden = Boolean(entry);
  element('editor-content').hidden = !entry;
  if (!entry) {
    element('entry-state').textContent = '尚未選取';
    element('entry-state').className = 'state-pill';
    return;
  }
  element('entry-id').textContent = entry.id;
  element('entry-category').textContent = categoryLabel(entry.category);
  element('source-text').textContent = entry.source || '（空原文）';
  ui.translation.value = entry.translation;
  ui.notes.value = entry.notes ?? '';
  updatePreview(entry);
}

function replaceEntries(value: LocalizationDocument): void {
  entries = value.entries.map(entry => ({ ...entry }));
  entryById = new Map(entries.map(entry => [entry.id, entry]));
  reviewedIds.clear();
  revision++;
  page = 0;
  updateProgress();
  renderList(true);
}

function setBusy(value: boolean): void {
  busy = value;
  ui.import.disabled = value || !catalog;
  ui.export.disabled = value || !catalog;
  ui.save.disabled = value || !catalog;
}

// Bound the download before JSON parsing, even when Content-Length is absent.
async function readCatalog(response: Response): Promise<string> {
  if (!response.ok) fail(`目錄讀取失敗（HTTP ${response.status}）。`);
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES) fail('目錄超過 4 MiB 上限。');
  if (!response.body) fail('瀏覽器無法讀取目錄資料流。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        fail('目錄超過 4 MiB 上限。');
      }
      text += decoder.decode(result.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function loadCatalog(): Promise<void> {
  if (busy) return;
  setBusy(true);
  const retry = element<HTMLButtonElement>('retry-button');
  retry.disabled = true;
  element('load-error').hidden = true;
  element('workspace').setAttribute('aria-busy', 'true');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(CATALOG_URL, { signal: controller.signal, cache: 'no-cache', credentials: 'same-origin' });
    const baseline = parseDocument(await readCatalog(response));
    catalog = baseline;
    const categories = [...new Set(baseline.entries.map(entry => entry.category))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = categoryLabel(category);
      ui.category.append(option);
    }
    element('source-sha').textContent = baseline.sourceSha256;
    let initial = baseline;
    let message = '目錄已就緒。選擇字串開始編輯；修改後請明確儲存草稿。';
    let warning = false;
    try {
      observedStorage = localStorage.getItem(STORAGE_KEY);
      storageReadable = true;
      if (observedStorage !== null) {
        initial = parseDocument(observedStorage, baseline);
        message = '已還原通過 ROM 身分與原文驗證的本機草稿。校對標記需於本次重新確認。';
      }
    } catch (error) {
      // Invalid or inaccessible storage is never deleted or silently overwritten.
      if (observedStorage === null) storageReadable = false;
      message = `未套用本機草稿：${errorMessage(error)} 原資料未更動，可繼續使用基準目錄並匯出備份。`;
      warning = true;
    }
    replaceEntries(initial);
    dirty = false;
    ui.filters.disabled = false;
    updateSaveState(initial === baseline ? '基準目錄・尚無新變更' : '已還原本機草稿');
    notify(message, warning);
  } catch (error) {
    element('load-error').hidden = false;
    element('load-error-text').textContent = `${errorMessage(error)} 請確認網站提供 ${CATALOG_URL.pathname}。`;
    updateSaveState('目錄尚未載入');
    notify('載入失敗，未變更任何本機草稿。可確認目錄後重試。', true);
  } finally {
    clearTimeout(timeout);
    retry.disabled = false;
    element('workspace').setAttribute('aria-busy', 'false');
    setBusy(false);
  }
}

function saveDraft(): void {
  if (busy || !catalog) return;
  try {
    const text = serialize(validateDocument(currentDocument(), catalog));
    const latest = localStorage.getItem(STORAGE_KEY);
    if ((!storageReadable || latest !== observedStorage) &&
        !window.confirm('本機草稿已被其他分頁變更，或先前無法讀取。要以目前完整內容覆蓋嗎？')) return;
    if (latest !== null) {
      try {
        parseDocument(latest, catalog);
      } catch {
        if (!window.confirm('現有本機草稿未通過驗證。確定要以目前內容覆蓋？原草稿將被取代。')) return;
      }
    }
    // The sole storage write in this module; import, typing and export never write.
    localStorage.setItem(STORAGE_KEY, text);
    observedStorage = text;
    storageReadable = true;
    dirty = false;
    ui.externalDraft.hidden = true;
    updateSaveState(`已儲存 · ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`);
    notify('本機草稿已儲存。已接入同源同步的遊戲分頁可於下一次文字事件讀取；建議另行匯出備份。');
  } catch (error) {
    notify(`儲存失敗：${errorMessage(error)} 編輯內容仍保留於此頁；可能是瀏覽器儲存空間不足或存取被封鎖，請匯出備份。`, true);
  }
}

function exportDocument(): void {
  if (busy || !catalog) return;
  let url: string | undefined;
  try {
    const text = serialize(validateDocument(currentDocument(), catalog));
    url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `captain-tsubasa-2-jp.zh-Hant.${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    notify('已送出完整 JSON 下載（包含所有字串，不受篩選影響）。這不會寫入本機草稿，請確認瀏覽器已完成下載。');
  } catch (error) {
    notify(`匯出失敗：${errorMessage(error)} 編輯內容未變更。`, true);
  } finally {
    if (url) {
      const downloadUrl = url;
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
    }
  }
}

async function importDocument(file: File): Promise<void> {
  if (!catalog || busy) return;
  setBusy(true);
  const startRevision = revision;
  try {
    if (file.size > MAX_BYTES) fail('匯入檔超過 4 MiB 上限。');
    // Fatal decoding avoids silently repairing malformed UTF-8 source strings.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    const incoming = parseDocument(text, catalog);
    if (revision !== startRevision) fail('讀取檔案期間編輯內容已變更，請重新匯入以免覆蓋新修改。');
    if (!window.confirm(`檔案驗證通過。要以檔案中的 ${incoming.entries.length.toLocaleString()} 條譯文與備註取代目前內容嗎？${dirty ? '尚未儲存的變更將被取代。' : ''}此操作不會自動儲存。`)) {
      notify('已取消匯入，目前編輯內容未變更。');
      return;
    }
    replaceEntries(incoming);
    markDirty();
    notify('匯入成功：ROM、全部 ID、分類與原文均一致。請檢查後儲存本機草稿；本次校對標記已重設。');
  } catch (error) {
    notify(`匯入失敗：${errorMessage(error)} 目前編輯與本機草稿均未變更。`, true);
  } finally {
    ui.file.value = '';
    setBusy(false);
  }
}

function reloadDraft(): void {
  if (!catalog || busy) return;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) fail('本機草稿已移除。目前內容仍保留，可儲存或匯出備份。');
    const incoming = parseDocument(text, catalog);
    if (!window.confirm(`要以最新本機草稿取代目前內容並重設本次校對標記嗎？${dirty ? '尚未儲存的修改將被取代。' : ''}`)) return;
    replaceEntries(incoming);
    observedStorage = text;
    storageReadable = true;
    dirty = false;
    ui.externalDraft.hidden = true;
    updateSaveState('已讀取最新本機草稿');
    notify('已讀取並驗證最新草稿；未寫入任何資料。');
  } catch (error) {
    notify(`無法讀取草稿：${errorMessage(error)} 目前編輯內容未變更。`, true);
  }
}

ui.list.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button[data-entry-id]');
  if (!button || !ui.list.contains(button)) return;
  const id = button.dataset.entryId;
  if (id === undefined || !entryById.has(id)) return;
  selectedId = id;
  for (const row of ui.list.querySelectorAll('button')) row.removeAttribute('aria-current');
  button.setAttribute('aria-current', 'true');
  renderEditor();
});

function onEdit(): void {
  const entry = selectedEntry();
  if (!entry) return;
  entry.translation = ui.translation.value;
  if (ui.notes.value) entry.notes = ui.notes.value;
  else delete entry.notes;
  reviewedIds.delete(entry.id);
  markDirty();
  updatePreview(entry);
  updateProgress();
  // Only the list is replaced. The active textarea, selection and IME stay intact.
  // Keep the selected editor even if its new state no longer matches the filter.
  renderList();
}

ui.translation.addEventListener('input', onEdit);
ui.notes.addEventListener('input', onEdit);
ui.reviewed.addEventListener('change', () => {
  const entry = selectedEntry();
  if (!entry || !entry.translation.trim()) return;
  if (ui.reviewed.checked) reviewedIds.add(entry.id);
  else reviewedIds.delete(entry.id);
  revision++;
  updatePreview(entry);
  updateProgress();
  renderList();
});

function changeFilters(): void {
  clearTimeout(searchTimer);
  page = 0;
  renderList(true);
}
ui.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(changeFilters, 150);
});
ui.category.addEventListener('change', changeFilters);
ui.reviewFilter.addEventListener('change', changeFilters);
element('clear-filters').addEventListener('click', () => {
  ui.search.value = '';
  ui.category.value = '';
  ui.reviewFilter.value = 'all';
  changeFilters();
});
ui.previous.addEventListener('click', () => { page--; renderList(true); });
ui.next.addEventListener('click', () => { page++; renderList(true); });
ui.save.addEventListener('click', saveDraft);
ui.export.addEventListener('click', exportDocument);
ui.import.addEventListener('click', () => ui.file.click());
ui.file.addEventListener('change', () => {
  const file = ui.file.files?.[0];
  if (file) void importDocument(file);
});
element('retry-button').addEventListener('click', () => { void loadCatalog(); });
element('reload-draft').addEventListener('click', reloadDraft);
window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('storage', event => {
  // A clear() event has a null key. Ignore sessionStorage notifications.
  try {
    if (event.storageArea !== localStorage) return;
  } catch { return; }
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  ui.externalDraft.hidden = false;
  notify('偵測到其他分頁變更草稿。目前內容保持不變，可選擇讀取最新草稿。');
});

void loadCatalog();