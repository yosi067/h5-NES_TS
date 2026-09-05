// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest';

// Exercise the shipped DOM and event handlers, not a copy of the validator.
const html = readFileSync(resolve(__dirname, '../translation-studio.html'), 'utf8');
const STORAGE_KEY = 'nes-localization:captain-tsubasa-2-jp:zh-Hant:v1';

interface Entry {
  id: string;
  category: string;
  source: string;
  translation: string;
  notes?: string;
}

interface Catalog {
  format: string;
  version: number;
  gameId: string;
  sourceSha256: string;
  locale: string;
  entries: Entry[];
  values: unknown[];
}

function catalogFixture(): Catalog {
  return {
    format: 'nes-localization', version: 1, gameId: 'captain-tsubasa-2-jp',
    sourceSha256: 'a'.repeat(64), locale: 'zh-Hant', values: [],
    entries: [
      { id: 'opening.01', category: 'opening', source: 'はじまり', translation: '' },
      { id: 'battle.01', category: 'battleMessage', source: 'シュート', translation: '射門', notes: '既有備註' },
      { id: 'interface.01', category: 'interface', source: 'つづける', translation: '' },
    ],
  };
}

function node<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing test element: ${id}`);
  return result as T;
}

function click(id: string): void {
  node(id).click();
}

function input(id: string, value: string): void {
  node<HTMLInputElement | HTMLTextAreaElement>(id).value = value;
  node(id).dispatchEvent(new Event('input', { bubbles: true }));
}

function change(id: string, value: string): void {
  node<HTMLSelectElement>(id).value = value;
  node(id).dispatchEvent(new Event('change', { bubbles: true }));
}

function selectEntry(id: string): void {
  const button = [...node('entry-list').querySelectorAll<HTMLButtonElement>('button')]
    .find(row => row.dataset.entryId === id);
  expect(button, `Visible entry ${id}`).toBeDefined();
  // Click a child to exercise delegated row selection as well.
  (button!.querySelector('span') as HTMLElement).click();
}

function reviewSelected(): void {
  node<HTMLInputElement>('review-check').checked = true;
  node('review-check').dispatchEvent(new Event('change', { bubbles: true }));
}

let canonical: Catalog;
let stored: Map<string, string>;
let blobs: Blob[];
let downloads: Array<{ href: string; filename: string }>;
let fetchMock: Mock<[RequestInfo | URL, RequestInit?], Promise<Response>>;
let setItem: Mock<[string, string], void>;
let confirmMock: MockInstance<[message?: string], boolean>;
let windowListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }>;

beforeEach(() => {
  vi.resetModules();
  // Keep jsdom FileReader's setImmediate work real while controlling UI timers.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  canonical = catalogFixture();
  stored = new Map();
  blobs = [];
  downloads = [];
  windowListeners = [];
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  // Scripts are imported explicitly below; jsdom must not navigate or load the app.
  document.querySelectorAll('script').forEach(script => script.remove());

  setItem = vi.fn((key: string, value: string) => { stored.set(key, value); });
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem,
    removeItem: vi.fn((key: string) => { stored.delete(key); }),
    clear: vi.fn(() => stored.clear()),
    key: vi.fn((index: number) => [...stored.keys()][index] ?? null),
    get length() { return stored.size; },
  });
  // A real streamed Response exercises the editor's bounded UTF-8 catalog reader.
  fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify(canonical), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const nativeAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    windowListeners.push({ type, listener, options });
    nativeAdd(type, listener, options);
  });
  // Keep the URL constructor intact: the editor also uses it for the catalog URL.
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: Blob): string {
      blobs.push(blob);
      return `blob:translation-editor-${blobs.length}`;
    }
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ href: this.href, filename: this.download });
  });
});

afterEach(() => {
  // resetModules does not remove module-level window listeners or timers.
  for (const { type, listener, options } of windowListeners) {
    window.removeEventListener(type, listener, options);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

async function boot(): Promise<void> {
  await import('../src/game-profiles/translation-editor');
  await vi.waitFor(() => expect(node('workspace').getAttribute('aria-busy')).toBe('false'));
  expect(node('load-error').hidden).toBe(true);
  expect(node<HTMLButtonElement>('save-button').disabled).toBe(false);
}

async function importJson(value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  const file = new File([text], 'translation.json', { type: 'application/json' });
  // jsdom File does not consistently implement arrayBuffer across versions.
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(text).buffer,
  });
  const fileInput = node<HTMLInputElement>('import-file');
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(node<HTMLButtonElement>('import-button').disabled).toBe(false));
  expect(fileInput.value).toBe('');
}

async function exportedDocument(): Promise<Catalog> {
  const count = blobs.length;
  click('export-button');
  expect(blobs).toHaveLength(count + 1);
  const blob = blobs[count];
  expect(blob.type).toBe('application/json;charset=utf-8');
  // Read the actual Blob passed to the download API, not editor internals.
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  return JSON.parse(text) as Catalog;
}

describe('translation editor browser UI', () => {
  it('loads the canonical catalog and displays Chinese category labels without changing category keys', async () => {
    await boot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(new URL('./game-profiles/captain-tsubasa-2-jp/localization.json', document.baseURI).href);
    expect(options).toMatchObject({ cache: 'no-cache', credentials: 'same-origin' });
    expect(node('source-sha').textContent).toBe(canonical.sourceSha256);
    expect(node('total-count').textContent).toBe('3');
    expect(node('translated-count').textContent).toBe('1');
    expect(node('empty-count').textContent).toBe('2');
    expect(node('completion').textContent).toBe('33% 已填寫');
    const labels = Object.fromEntries([...node<HTMLSelectElement>('category').options]
      .map(option => [option.value, option.textContent]));
    expect(labels).toEqual({ '': '所有分類', opening: '開場', battleMessage: '比賽訊息', interface: '介面文字' });
    for (const [id, category, label] of [
      ['opening.01', 'opening', '開場'],
      ['battle.01', 'battleMessage', '比賽訊息'],
      ['interface.01', 'interface', '介面文字'],
    ]) {
      change('category', category);
      expect(node('entry-id').textContent).toBe(id);
      expect(node('entry-category').textContent).toBe(label);
      expect(node('entry-list').children).toHaveLength(1);
    }
    expect(setItem).not.toHaveBeenCalled();
  });

  it('edits translation and notes, updates preview/review/progress, and saves only on explicit request', async () => {
    await boot();
    input('translation', '開始吧！\n第二行');
    input('notes', '保留換行');
    reviewSelected();
    expect(node('preview-text').textContent).toBe('開始吧！\n第二行');
    expect(node('preview-text').lang).toBe('zh-Hant');
    expect(node('translated-count').textContent).toBe('2');
    expect(node('reviewed-count').textContent).toBe('1');
    expect(node('save-dot').classList.contains('unsaved')).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    selectEntry('battle.01');
    selectEntry('opening.01');
    expect(node<HTMLTextAreaElement>('translation').value).toBe('開始吧！\n第二行');
    expect(node<HTMLTextAreaElement>('notes').value).toBe('保留換行');
    click('save-button');
    const expected = structuredClone(canonical);
    Object.assign(expected.entries[0], { translation: '開始吧！\n第二行', notes: '保留換行' });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(JSON.parse(stored.get(STORAGE_KEY)!)).toEqual(expected);
    expect(node('save-dot').classList.contains('unsaved')).toBe(false);
    expect(node('save-state').textContent).toContain('已儲存');
    input('notes', '');
    expect(node<HTMLInputElement>('review-check').checked).toBe(false);
    expect(node('reviewed-count').textContent).toBe('0');
    click('save-button');
    expect(JSON.parse(stored.get(STORAGE_KEY)!).entries[0]).not.toHaveProperty('notes');
  });

  it('restores a valid stored draft without writing or restoring session review marks', async () => {
    const draft = structuredClone(canonical);
    Object.assign(draft.entries[0], { translation: '已存的譯文', notes: '已存的備註' });
    stored.set(STORAGE_KEY, JSON.stringify(draft));
    await boot();
    expect(node<HTMLTextAreaElement>('translation').value).toBe('已存的譯文');
    expect(node<HTMLTextAreaElement>('notes').value).toBe('已存的備註');
    expect(node('save-state').textContent).toBe('已還原本機草稿');
    expect(node<HTMLInputElement>('review-check').checked).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('exports every entry despite active filters, downloads JSON, and releases the URL without saving', async () => {
    await boot();
    input('translation', '未儲存但可匯出');
    reviewSelected();
    change('category', 'interface');
    expect(node('entry-list').children).toHaveLength(1);
    const expected = structuredClone(canonical);
    expected.entries[0].translation = '未儲存但可匯出';
    expect(await exportedDocument()).toEqual(expected);
    expect(downloads).toEqual([{
      href: 'blob:translation-editor-1',
      filename: expect.stringMatching(/^captain-tsubasa-2-jp\.zh-Hant\.\d{4}-\d{2}-\d{2}\.json$/),
    }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:translation-editor-1');
    expect(setItem).not.toHaveBeenCalled();
    expect(node('save-dot').classList.contains('unsaved')).toBe(true);
  });

  it('imports a valid complete file in canonical order, resets reviews, and requires an explicit save', async () => {
    await boot();
    input('translation', '原本編輯');
    reviewSelected();
    const incoming = structuredClone(canonical);
    Object.assign(incoming.entries[0], { translation: '匯入的譯文', notes: '匯入的備註' });
    incoming.entries[1].translation = '';
    delete incoming.entries[1].notes;
    const expected = structuredClone(incoming);
    incoming.entries.reverse();
    const chooser = vi.spyOn(node('import-file'), 'click');
    click('import-button');
    expect(chooser).toHaveBeenCalledTimes(1);
    await importJson(incoming);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(node('notification').textContent).toContain('匯入成功');
    expect(node('entry-id').textContent).toBe('opening.01');
    expect(node<HTMLTextAreaElement>('translation').value).toBe('匯入的譯文');
    expect(node<HTMLTextAreaElement>('notes').value).toBe('匯入的備註');
    expect(node('reviewed-count').textContent).toBe('0');
    expect(node('save-dot').classList.contains('unsaved')).toBe(true);
    expect(await exportedDocument()).toEqual(expected);
    expect(setItem).not.toHaveBeenCalled();
    click('save-button');
    expect(JSON.parse(stored.get(STORAGE_KEY)!)).toEqual(expected);
  });

  it('preserves current edits when a valid import is cancelled', async () => {
    await boot();
    input('translation', '不要覆蓋');
    confirmMock.mockReturnValue(false);
    await importJson(canonical);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(node('notification').textContent).toContain('已取消匯入');
    expect(node<HTMLTextAreaElement>('translation').value).toBe('不要覆蓋');
    expect(node('save-dot').classList.contains('unsaved')).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
  });

  const invalidImports: Array<[string, (draft: Catalog) => void, string]> = [
    ['wrong game', draft => { draft.gameId = 'another-game'; }, '遊戲或語系不符'],
    ['wrong ROM hash', draft => { draft.sourceSha256 = 'b'.repeat(64); }, 'ROM 身分不符'],
    ['changed source', draft => { draft.entries[2].source = '改過的原文'; }, '原文或分類不符'],
    ['changed category', draft => { draft.entries[2].category = 'opening'; }, '原文或分類不符'],
    ['duplicate ID', draft => { draft.entries[2] = { ...draft.entries[0] }; }, 'ID 重複'],
    ['missing entry', draft => { draft.entries.pop(); }, '缺少 ID'],
    ['unknown ID', draft => { draft.entries[2].id = 'unknown.01'; }, '未知 ID'],
    ['nonempty values', draft => { draft.values = [{ id: 'speed', value: 99 }]; }, 'values 必須是空陣列'],
  ];

  it.each(invalidImports)('rejects %s atomically, preserving all edits, review state and saved data', async (_name, mutate, message) => {
    await boot();
    click('save-button');
    const saved = stored.get(STORAGE_KEY);
    setItem.mockClear();
    input('translation', '第一筆未儲存');
    input('notes', '第一筆備註');
    selectEntry('battle.01');
    input('translation', '第二筆未儲存');
    input('notes', '第二筆備註');
    reviewSelected();
    const expected = structuredClone(canonical);
    Object.assign(expected.entries[0], { translation: '第一筆未儲存', notes: '第一筆備註' });
    Object.assign(expected.entries[1], { translation: '第二筆未儲存', notes: '第二筆備註' });
    const incoming = structuredClone(canonical);
    // Valid earlier rows must not be applied before a later row fails validation.
    incoming.entries[0].translation = '不可部分套用';
    incoming.entries[1].notes = '不可部分套用';
    mutate(incoming);
    await importJson(incoming);
    expect(node('notification').classList.contains('error')).toBe(true);
    expect(node('notification').textContent).toContain(message);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(node('entry-id').textContent).toBe('battle.01');
    expect(node<HTMLTextAreaElement>('translation').value).toBe('第二筆未儲存');
    expect(node<HTMLTextAreaElement>('notes').value).toBe('第二筆備註');
    expect(node<HTMLInputElement>('review-check').checked).toBe(true);
    expect(node('reviewed-count').textContent).toBe('1');
    expect(node('save-dot').classList.contains('unsaved')).toBe(true);
    expect(await exportedDocument()).toEqual(expected);
    expect(stored.get(STORAGE_KEY)).toBe(saved);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('renders markup in canonical text and imported translations/notes literally, including the preview', async () => {
    const source = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const translation = '<svg onload="alert(3)">譯文</svg>&lt;b&gt;';
    const notes = '</textarea><img src=x onerror="alert(4)">';
    canonical.entries[0].source = source;
    await boot();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    expect(node('source-text').textContent).toBe(source);
    expect(node('preview-text').textContent).toBe(source);
    expect(node('entry-list').querySelector('.entry-row-source')?.textContent).toBe(source);
    const incoming = structuredClone(canonical);
    Object.assign(incoming.entries[0], { translation, notes });
    await importJson(incoming);
    expect(node('notification').textContent).toContain('匯入成功');
    expect(node<HTMLTextAreaElement>('translation').value).toBe(translation);
    expect(node<HTMLTextAreaElement>('notes').value).toBe(notes);
    expect(node('preview-text').textContent).toBe(translation);
    expect(node('entry-list').querySelector('.entry-row-translation')?.textContent).toBe(translation);
    expect(document.querySelector('img, svg, script')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(await exportedDocument()).toEqual(incoming);
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Both the whole catalog and each tested filter retain >40 matches.
      // Thus reset-to-page-one assertions cannot pass merely through clamping.
      for (let index = 0; index < 45; index++) {
        canonical.entries.push({
          id: `page.${index.toString().padStart(2, '0')}`, category: 'battleMessage',
          source: `分頁原文 ${index}`, translation: `分頁譯文 ${index}`,
        });
      }
    });

    it.each(['search', 'category', 'review-filter', 'clear-filters', 'import'] as const)(
      'resets pagination and selection after %s', async action => {
        await boot();
        expect(node('page-label').textContent).toBe('1 / 2');
        expect(node('entry-list').children).toHaveLength(40);
        if (action === 'clear-filters') {
          input('search', '分頁');
          await vi.advanceTimersByTimeAsync(150);
        }
        click('next-page');
        expect(node('page-label').textContent).toBe('2 / 2');
        expect(node<HTMLButtonElement>('next-page').disabled).toBe(true);
        expect(node<HTMLButtonElement>('previous-page').disabled).toBe(false);
        let first = 'opening.01';
        if (action === 'search') {
          input('search', '分頁');
          await vi.advanceTimersByTimeAsync(149);
          expect(node('page-label').textContent).toBe('2 / 2');
          await vi.advanceTimersByTimeAsync(1);
          first = 'page.00';
        } else if (action === 'category') {
          change('category', 'battleMessage');
          first = 'battle.01';
        } else if (action === 'review-filter') {
          change('review-filter', 'pending');
          first = 'battle.01';
        } else if (action === 'clear-filters') {
          click('clear-filters');
          expect(node<HTMLInputElement>('search').value).toBe('');
          expect(node<HTMLSelectElement>('category').value).toBe('');
          expect(node<HTMLSelectElement>('review-filter').value).toBe('all');
        } else {
          await importJson(canonical);
          expect(node('notification').textContent).toContain('匯入成功');
        }
        expect(node('page-label').textContent).toBe('1 / 2');
        expect(node('entry-list').children).toHaveLength(40);
        expect(node('entry-id').textContent).toBe(first);
        expect(node('entry-list').querySelector<HTMLElement>('[aria-current="true"]')?.dataset.entryId).toBe(first);
        expect(node<HTMLButtonElement>('previous-page').disabled).toBe(true);
        expect(node<HTMLButtonElement>('next-page').disabled).toBe(false);
      },
    );

    it('handles no matches and recovers selection after clearing search', async () => {
      await boot();
      click('next-page');
      input('search', 'no-such-entry');
      await vi.advanceTimersByTimeAsync(150);
      expect(node('page-label').textContent).toBe('0 / 0');
      expect(node('entry-list').children).toHaveLength(0);
      expect(node('empty-results').hidden).toBe(false);
      expect(node('editor-content').hidden).toBe(true);
      expect(node<HTMLButtonElement>('previous-page').disabled).toBe(true);
      expect(node<HTMLButtonElement>('next-page').disabled).toBe(true);
      click('clear-filters');
      expect(node('page-label').textContent).toBe('1 / 2');
      expect(node('entry-id').textContent).toBe('opening.01');
      expect(node('editor-content').hidden).toBe(false);
    });
  });
});