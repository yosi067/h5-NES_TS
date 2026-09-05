// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locateMenuTranslations } from '../src/game-profiles/menu-localization';
import { NesTextOverlay } from '../src/game-profiles/text-overlay';
import {
  CT2_SOURCE_HASHES, LOCALIZATION_STORAGE_KEY, TextObservationState, cellRectangleVisible, locateTextCells, validateLocalizationAssets,
  type LocalizationAssets,
} from '../src/game-profiles/localization';
import type { EmuWasm } from '../src/wasm/nes_wasm.js';

const CELL = 0x249;
const X = 72;
const Y = 40;
const PROVENANCE_PTR = 16; // Non-null and Uint16-aligned, as returned by WASM.
const dom = (globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }).jsdom;

function makeAssets(fragments = [{ bytes: [0x11, 0xa0, 0xc8, 0x14], translation: '中文' }]): LocalizationAssets {
  let offset = 0x6040;
  const runs = fragments.map((fragment, index) => {
    const run = { id: `fragment-${index}`, scene: 'intro', line: 'intro-line', offset, bytes: [...fragment.bytes] };
    offset += fragment.bytes.length;
    return run;
  });
  const lowerTiles = Array<number>(256).fill(0);
  lowerTiles[0xa0] = 0x31;
  lowerTiles[0xc8] = 0x32;
  return {
    catalog: {
      format: 'nes-localization', version: 1, gameId: 'captain-tsubasa-2-jp',
      sourceSha256: CT2_SOURCE_HASHES[0], locale: 'zh-Hant', values: [],
      entries: runs.map((run, index) => ({
        id: run.id, category: 'dialogue', source: 'あ'.repeat(run.bytes.length),
        translation: fragments[index].translation,
      })),
    },
    runtime: {
      version: 1, sourceSha256: CT2_SOURCE_HASHES[0], sourceHashes: [...CT2_SOURCE_HASHES],
      scenes: [{ id: 'intro', start: 0x6040, length: offset - 0x6040 }], runs, lowerTiles,
    },
  };
}

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) { ResizeObserverMock.instances.push(this); }
  trigger(): void { this.callback([], this as unknown as ResizeObserver); }
}

function makeContext() {
  return {
    font: '', fillStyle: '', textBaseline: '', textAlign: '',
    setTransform: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(function (this: { fillStyle: string }, _x: number, _y: number, _w: number, _h: number) {
      return this.fillStyle;
    }),
    fillText: vi.fn(function (this: { font: string; fillStyle: string }, _text: string, _x: number, _y: number) {
      return { font: this.font, color: this.fillStyle };
    }),
    drawImage: vi.fn(), imageSmoothingEnabled: true,
    // Deterministic full-width glyph metrics, not zero/constant widths that
    // would accidentally bypass the renderer's fixed-size layout check.
    measureText: vi.fn(function (this: { font: string }, text: string): TextMetrics {
      const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 14);
      return { width: [...text].length * size } as TextMetrics;
    }),
  };
}

type Box = { left: number; top: number; width: number; height: number };
function rect(box: Box): DOMRect {
  return { ...box, x: box.left, y: box.top, right: box.left + box.width,
    bottom: box.top + box.height, toJSON: () => ({ ...box }) };
}

let context: ReturnType<typeof makeContext>;
const overlays: NesTextOverlay[] = [];

beforeEach(() => {
  vi.stubEnv('DEV', true);
  dom.reconfigure({ url: 'http://localhost/' });
  localStorage.clear();
  document.body.innerHTML = '';
  ResizeObserverMock.instances = [];
  context = makeContext();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
});

afterEach(() => {
  overlays.splice(0).forEach(overlay => overlay.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  dom.reconfigure({ url: 'http://localhost/' });
  localStorage.clear();
  document.body.innerHTML = '';
});

// The legacy tests deliberately retain the optional-metadata fallback. New
// contract regressions opt into the actual four-word completed-frame metadata.
function harness(assets = makeAssets(), withMetadata = false) {
  validateLocalizationAssets(assets);
  const bezel = document.createElement('div');
  bezel.className = 'screen-bezel';
  bezel.style.position = 'relative';
  const screen = document.createElement('canvas');
  screen.width = 256;
  screen.height = 224; // The screen crops eight source scanlines at each end.
  const screenBox: Box = { left: 10, top: 20, width: 256, height: 224 };
  const parentBox: Box = { left: 10, top: 20, width: 256, height: 224 };
  Object.defineProperties(screen, {
    clientWidth: { get: () => screenBox.width }, clientHeight: { get: () => screenBox.height },
  });
  vi.spyOn(screen, 'getBoundingClientRect').mockImplementation(() => rect(screenBox));
  vi.spyOn(bezel, 'getBoundingClientRect').mockImplementation(() => rect(parentBox));
  bezel.append(screen);
  document.body.append(bezel);

  const memory = new WebAssembly.Memory({ initial: 8 });
  const provenance = new Uint16Array(memory.buffer, PROVENANCE_PTR, 256 * 240);
  const fetchedCells = new Uint32Array(2048);
  const metadata = new Uint32Array(2048 * 4);
  const glyphs = assets.runtime.runs.flatMap(run => run.bytes.map((glyph, index) => ({ run, glyph, index })));
  let events: number[] = [];
  const coreMock = {
    takeTextEvents: vi.fn(() => { const batch = Uint32Array.from(events); events = []; return batch; }),
    getWasmMemory: vi.fn(() => memory),
    getTextProvenancePtr: vi.fn(() => PROVENANCE_PTR),
    getTextFetchedCells: vi.fn(() => fetchedCells),
    getTextBackdrop: vi.fn(() => 0x123456),
    ...(withMetadata ? { getTextFrameMetadata: vi.fn(() => metadata) } : {}),
  } satisfies Pick<EmuWasm, 'takeTextEvents' | 'getWasmMemory' | 'getTextProvenancePtr' | 'getTextFetchedCells' | 'getTextBackdrop'>
    & Partial<Pick<EmuWasm, 'getTextFrameMetadata'>>;
  const core = coreMock as unknown as EmuWasm;
  const overlay = new NesTextOverlay(screen, assets);
  overlays.push(overlay);
  const layer = bezel.querySelector<HTMLCanvasElement>('.nes-localization-layer')!;
  const toggle = document.querySelector<HTMLButtonElement>('button')!;
  function expectNoPanel(): void {
    expect([...document.body.children]).toEqual(toggle ? [bezel, toggle.parentElement] : [bezel]);
    expect(bezel.children).toHaveLength(2); // Screen and overlay only.
    expect(document.querySelector('.nes-localization-panel')).toBeNull();
  }

  function observe(start = 0, end = glyphs.length): void {
    for (let column = start; column < end; column++) {
      const { run, glyph, index } = glyphs[column];
      events.push(1, run.offset + index, CELL + column, glyph);
      events.push(4, fetchedCells[CELL + column] >>> 8, CELL + column, fetchedCells[CELL + column + 32] >>> 8);
    }
  }

  function tiles(column: number, upper: number, lower: number, generation = 7): void {
    fetchedCells[CELL + column] = (generation << 8) | upper;
    fetchedCells[CELL + column + 32] = (generation << 8) | lower;
    for (const [cell, tile] of [[CELL + column, upper], [CELL + column + 32, lower]]) {
      // packed generation/tile, physical CHR byte offset + 1, background RGB
      // + 1, and ink RGB + 1 (zero means no ink was fetched for a blank tile).
      metadata.set([fetchedCells[cell], tile * 16 + 1, 0x123456 + 1, tile ? 0xffffff + 1 : 0], cell * 4);
    }
  }

  function sourceTiles(column: number, generation = 7): void {
    // Explicit fixture tile pairs exercise short glyphs and both tall-font
    // upper tiles, independently of the implementation's lookup logic.
    const glyph = glyphs[column].glyph;
    if (glyph === 0xa0) tiles(column, 0x94, 0x31, generation);
    else if (glyph === 0xc8) tiles(column, 0x95, 0x32, generation);
    else tiles(column, 0, glyph, generation);
  }

  function frame(revealed = glyphs.length): void {
    provenance.fill(0);
    fetchedCells.fill(0);
    metadata.fill(0);
    for (let column = 0; column < glyphs.length; column++) {
      const cell = CELL + column;
      // PPU contract: low 12 bits = physical nametable cell + 1;
      // bits 12..14 = fine Y. The lower half is the cell one tile row below.
      for (let dy = 0; dy < 16; dy++) {
        const tag = (cell + (dy >= 8 ? 32 : 0) + 1) | ((dy % 8) << 12);
        provenance.fill(tag, (Y + dy) * 256 + X + column * 8, (Y + dy) * 256 + X + (column + 1) * 8);
      }
      if (column < revealed) sourceTiles(column);
      else tiles(column, 0, 0); // Proven fetched blanks, not unknown zero words.
    }
  }

  function render(): void {
    vi.clearAllMocks(); // Inspect this repaint, not accumulated earlier draws.
    overlay.render(core, 8);
  }

  function expectMaskColumns(columns: readonly number[]): void {
    // Mask order follows source-event arrival, not screen order. Compare every
    // rectangle (including duplicates), never merely their count or inclusion.
    const byPosition = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
    expect([...context.fillRect.mock.calls].sort(byPosition)).toEqual(
      columns.flatMap(column => [
        [X + column * 8, Y, 8, 8], [X + column * 8, Y + 8, 8, 8],
      ]).sort(byPosition),
    );
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, layer.width, layer.height);
  }

  function expectMasks(covered: number): void {
    expectMaskColumns(Array.from({ length: covered }, (_, index) => index));
  }

  function expectText(text: string, covered: number): void {
    expect(layer.dataset.text).toBe(text);
    expect(context.fillText.mock.calls).toEqual([[text, X, Y + 8]]);
    expect(context.fillText.mock.results[0].value.font).toBe('600 12px "Microsoft JhengHei", "Noto Sans TC", sans-serif');
    expectNoPanel();
    expectMasks(covered);
  }

  function expectNoChinese(): void {
    expect(layer.dataset.text).toBe('');
    expectNoPanel();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, layer.width, layer.height);
  }

  return { assets, screen, bezel, screenBox, parentBox, layer, toggle, coreMock, provenance,
    fetchedCells, metadata, memory, observe, tiles, sourceTiles, frame, render,
    expectMasks, expectMaskColumns, expectText, expectNoPanel, expectNoChinese };
}

describe('NesTextOverlay real render with PPU provenance', () => {
  it('translates a complete source prefix, covers only its tiles, and applies overscan', () => {
    const h = harness();
    h.frame(); h.observe();
    // Validate the synthetic wire data through the real localization helpers.
    expect(locateTextCells(h.provenance, new Set([CELL, CELL + 3])))
      .toEqual(new Map([[CELL, { x: X, y: Y }], [CELL + 3, { x: X + 24, y: Y }]]));
    expect(cellRectangleVisible(h.provenance, CELL + 2, X + 16, Y)).toBe(true);
    h.render();
    h.expectText('中文', 4);
    expect(context.setTransform.mock.calls).toEqual([[1, 0, 0, 1, 0, 0], [2, 0, 0, 2, 0, -16]]);
    // Events are consumed once; an unchanged completed frame stays translated.
    h.render();
    expect(h.coreMock.takeTextEvents.mock.results[0].value).toHaveLength(0);
    h.expectText('中文', 4);
  });

  it.each([0, 1])('does not shift translation when glyph %i has its provenance origin hidden by a sprite', column => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    const start = Y * 256 + X + column * 8;
    // Hide the entire fine-Y-zero scanline, so locateTextCells cannot locate
    // this glyph. Other scanlines still fetch both halves: nonzero fetchedCells
    // remains faithful to the PPU (unlike retaining it under full-cell occlusion).
    h.provenance.fill(0, start, start + 8);
    expect(locateTextCells(h.provenance, new Set([CELL + column])).has(CELL + column)).toBe(false);
    h.render(); h.expectNoChinese();
    h.expectMaskColumns([0, 1, 2, 3].filter(index => index !== column));
    // Occlusion is not a nametable overwrite: removing the sprite can repaint.
    h.frame(); h.render(); h.expectText('中文', 4);
  });

  it('rejects a one-pixel sprite hole even when the cell origin can still be located', () => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.provenance[(Y + 11) * 256 + X + 8 + 3] = 0;
    expect(locateTextCells(h.provenance, new Set([CELL + 1])).has(CELL + 1)).toBe(true);
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
  });

  it.each([0, 1])('requires source index zero and every middle index (missing event %i)', missing => {
    const h = harness();
    h.frame();
    for (let column = 0; column < 4; column++) if (column !== missing) h.observe(column, column + 1);
    h.render(); h.expectNoChinese();
    h.expectMaskColumns([0, 1, 2, 3].filter(index => index !== missing));
    // A late event fills the gap; event insertion order must not determine text position.
    h.observe(missing, missing + 1); h.render(); h.expectText('中文', 4);
  });

  it.each([[0, 0], [0, 32], [1, 0], [1, 32]])('does not resurrect stale text after overwriting glyph %i half %i', (column, half) => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    const surviving = [0, 1, 2, 3].filter(index => index !== column);
    const address = CELL + column + half;
    const original = h.fetchedCells[address];
    h.fetchedCells[address] = (8 << 8) | 0x55;
    h.render(); h.expectNoChinese(); h.expectMaskColumns(surviving);
    h.fetchedCells[address] = (9 << 8) | (original & 255);
    for (let frame = 0; frame < 8; frame++) {
      h.render(); h.expectNoChinese(); h.expectMaskColumns(surviving);
    }
    // Only a fresh source event may establish ownership of the rewritten tile.
    h.observe(column, column + 1); h.render(); h.expectText('中文', 4);
  });

  it('detects same-tile rewrites by generation even without seeing the intermediate overwrite', () => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.sourceTiles(0, 8);
    h.render(); h.expectNoChinese(); h.expectMaskColumns([1, 2, 3]);
    h.sourceTiles(0, 9);
    h.render(); h.expectNoChinese(); h.expectMaskColumns([1, 2, 3]);
    h.observe(0, 1); h.render(); h.expectText('中文', 4);
  });

  it.each([0, 0xffffffff])('does not paint an unfetched/ambiguous middle cell (%i)', word => {
    const h = harness();
    h.frame(); h.observe();
    h.fetchedCells[CELL + 1] = word;
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
    h.sourceTiles(1); h.render();
    if (word === 0xffffffff) {
      // Ambiguous generation/CHR evidence retires ownership, unlike a tile
      // which simply has not reached the display yet.
      h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]); h.observe(1, 2); h.render();
    }
    h.expectText('中文', 4);
  });

  it('completes each fragment independently rather than revealing a fraction of the combined translation', () => {
    const h = harness(makeAssets([
      { bytes: [0x11, 0x12], translation: '甲乙' },
      { bytes: [0x13, 0x14, 0x15, 0x16, 0x17, 0x18], translation: '丙丁' },
    ]));
    let previous = 0;
    const frame = vi.fn(), setButton = vi.fn();
    Object.assign(h.coreMock, { frame, setButton });
    for (const [count, text] of [[1, '甲乙'], [2, '甲乙'], [3, '甲乙丙'], [4, '甲乙丙丁'], [8, '甲乙丙丁']] as const) {
      h.frame(count); h.observe(previous, count); h.render(); h.expectText(text, count);
      expect(frame).not.toHaveBeenCalled();
      expect(setButton).not.toHaveBeenCalled();
      previous = count;
    }
  });

  it('clears and repaints on toggle while paused, without new source events or an external render call', () => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    vi.clearAllMocks(); h.toggle.click();
    expect(h.toggle.getAttribute('aria-pressed')).toBe('false');
    h.expectNoChinese(); h.expectMasks(0);
    vi.clearAllMocks(); h.toggle.click();
    expect(h.toggle.getAttribute('aria-pressed')).toBe('true');
    expect(h.coreMock.takeTextEvents).not.toHaveBeenCalled();
    h.expectText('中文', 4);
  });

  it('does not use identical old tile pixels before the observed write reaches the frame', () => {
    const h = harness();
    h.frame(); h.observe(); // Writer expects generation seven.
    for (let column = 0; column < 4; column++) h.sourceTiles(column, 6);
    h.render(); h.expectNoChinese(); h.expectMasks(0);
    h.frame(); h.render(); h.expectText('中文', 4);
  });

  it('retains Chinese while EB waits for input, until actual clear', () => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from([2, 0x6060, 0, 0xeb]));
    h.render(); h.expectText('中文', 4);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from([0, 0, 0, 0]));
    h.render(); h.expectNoChinese(); h.expectMasks(0);
  });

  it('aligns object-fit contain content after horizontal and vertical letterboxing resizes', () => {
    const h = harness();
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.screen.style.objectFit = 'contain';
    Object.assign(h.parentBox, { left: 10, top: 20 });
    Object.assign(h.screenBox, { left: 40, top: 60, width: 600, height: 224 });
    Object.defineProperties(h.bezel, { clientLeft: { value: 3 }, clientTop: { value: 5 } });
    const observer = ResizeObserverMock.instances[0];
    expect(observer).toBeDefined();
    vi.clearAllMocks(); observer.trigger();
    expect([h.layer.style.left, h.layer.style.top, h.layer.style.width, h.layer.style.height])
      .toEqual(['199px', '35px', '256px', '224px']);
    expect([h.layer.width, h.layer.height]).toEqual([512, 448]);
    h.expectText('中文', 4);

    Object.assign(h.screenBox, { width: 512, height: 600 });
    vi.stubGlobal('devicePixelRatio', 1.5);
    vi.clearAllMocks(); observer.trigger();
    expect([h.layer.style.left, h.layer.style.top, h.layer.style.width, h.layer.style.height])
      .toEqual(['27px', '111px', '512px', '448px']);
    expect([h.layer.width, h.layer.height]).toEqual([768, 672]);
    expect(context.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, -24);
    h.expectText('中文', 4);
    // Map the source tile to page coordinates through CSS and backing pixels.
    const pageY = h.parentBox.top + h.bezel.clientTop + parseFloat(h.layer.style.top)
      + (Y - 8) * parseFloat(h.layer.style.height) / h.screen.height;
    expect(pageY).toBe(200); // screen top 60 + contain inset 76 + cropped source Y 32 * 2.
  });

  it('leaves overflowing unreviewed drafts in their original position without blank masks or an external panel', () => {
    const translation = '這段翻譯太長無法放入';
    const assets = makeAssets();
    localStorage.setItem(LOCALIZATION_STORAGE_KEY, JSON.stringify({ ...assets.catalog,
      entries: assets.catalog.entries.map(entry => ({ ...entry, translation })) }));
    const h = harness(assets, true);
    h.frame(1); h.observe(0, 1); h.render(); h.expectNoChinese(); h.expectMasks(0);
    expect(context.measureText).toHaveBeenCalledWith(translation);
    h.frame(); h.observe(1); h.render(); h.expectNoChinese(); h.expectMasks(0);
    vi.clearAllMocks(); h.toggle.click(); h.expectNoChinese(); h.expectMasks(0);
    vi.clearAllMocks(); h.toggle.click(); h.expectNoChinese(); h.expectMasks(0);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from([0, 0, 0, 0]));
    h.render(); h.expectNoChinese(); h.expectMasks(0);
  });
});

describe('completed-frame metadata and fixed-size rendering contract', () => {
  it.each([true, false].flatMap(dev =>
    ['localhost', '127.0.0.1', '[::1]', 'example.com', '192.168.1.2', 'localhost.example.com']
      .map(host => ({ dev, host }))))('gates controls and local drafts with DEV=$dev at $host, not Chinese rendering', ({ dev, host }) => {
    vi.stubEnv('DEV', dev);
    dom.reconfigure({ url: `http://${host}/` });
    expect(location.hostname).toBe(host);
    const allowed = dev && ['localhost', '127.0.0.1', '[::1]'].includes(host);
    const assets = makeAssets();
    const draft = (translation: string) => JSON.stringify({ ...assets.catalog,
      entries: assets.catalog.entries.map(entry => ({ ...entry, translation })) });
    localStorage.setItem(LOCALIZATION_STORAGE_KEY, draft('草稿'));
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    const h = harness(assets, true);
    expect(document.querySelector('button') !== null).toBe(allowed);
    expect(document.querySelector('a[href*="translation-studio.html"]') !== null).toBe(allowed);
    expect(document.body.textContent?.includes('中文化開發模式')).toBe(allowed);
    if (allowed) expect(reads).toHaveBeenCalledWith(LOCALIZATION_STORAGE_KEY);
    else expect(reads).not.toHaveBeenCalled();
    h.frame(); h.observe(); h.render(); h.expectText(allowed ? '草稿' : '中文', 4);
    localStorage.setItem(LOCALIZATION_STORAGE_KEY, draft('更新'));
    vi.clearAllMocks();
    window.dispatchEvent(new StorageEvent('storage', { key: LOCALIZATION_STORAGE_KEY }));
    if (allowed) {
      expect(reads).toHaveBeenCalledWith(LOCALIZATION_STORAGE_KEY);
      h.expectText('更新', 4);
    } else {
      expect(reads).not.toHaveBeenCalled();
      h.render(); h.expectText('中文', 4);
    }
  });

  it('skips a verified title menu in the renderer even when the pure matcher returns it', () => {
    const assets = makeAssets();
    assets.menus = {
      entries: [{ id: 'menu.title.fixture', source: 'あいうえ', translation: '開始',
        markTiles: [0, 0, 0, 0], bodyTiles: [0x11, 0x12, 0x13, 0x14] }],
      layouts: [], font: { chrPhysicalBase: 0 },
    };
    const h = harness(assets, true);
    h.frame();
    for (let column = 0; column < 4; column++) h.tiles(column, 0, 0x11 + column);
    expect(locateMenuTranslations(assets.menus, h.provenance, h.metadata))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'menu.title.fixture', translation: '開始' })]));
    h.render(); h.expectNoChinese(); h.expectMasks(0);
  });

  it('never masks fetched source-looking tiles without source events and generation evidence', () => {
    const h = harness(makeAssets(), true);
    h.frame(); h.render(); h.expectNoChinese(); h.expectMasks(0);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from(
      h.assets.runtime.runs[0].bytes.flatMap((glyph, index) => [
        1, h.assets.runtime.runs[0].offset + index, CELL + index, glyph,
      ]),
    ));
    h.render(); h.expectNoChinese(); h.expectMasks(0);
    h.observe(); h.render(); h.expectText('中文', 4);
  });

  it.each(['unfetched', 'previous blank'] as const)('retains a pending source event while metadata still describes %s pixels', pending => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe(); // The queued source write expects generation seven.
    if (pending === 'previous blank') h.tiles(0, 0, 0, 6);
    else {
      for (const cell of [CELL, CELL + 32]) {
        h.fetchedCells[cell] = 0;
        h.metadata.fill(0, cell * 4, cell * 4 + 4);
      }
    }
    h.render(); h.expectNoChinese(); h.expectMaskColumns([1, 2, 3]);
    // No replayed event: once the write actually reaches the completed frame,
    // its original ownership must still exist. CHR=0/old blank before the
    // expected generation is fetched is not evidence of a changed font bank.
    h.frame(); h.render();
    expect(h.coreMock.takeTextEvents.mock.results[0].value).toHaveLength(0);
    h.expectText('中文', 4);
  });

  it.each([0, 32])('keeps source masks across script soft clear until half %i changes generation', half => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from([5, 0x6060, 0, 0]));
    h.render(); h.expectText('中文', 4);
    for (let frame = 0; frame < 8; frame++) { h.render(); h.expectText('中文', 4); }
    // The same tile pixels with a new fetched generation are a real overwrite.
    const cell = CELL + 1 + half;
    h.fetchedCells[cell] += 1 << 8;
    h.metadata[cell * 4] = h.fetchedCells[cell];
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
    for (let frame = 0; frame < 8; frame++) {
      h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
    }
    h.observe(1, 2); h.render(); h.expectText('中文', 4);
  });

  it('keeps the remaining Japanese masked after a partial clear overwrites the first glyph, until each generation changes', () => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.coreMock.takeTextEvents.mockReturnValueOnce(Uint32Array.from([5, 0x6060, 0, 0]));
    h.render(); h.expectText('中文', 4);

    for (let cleared = 0; cleared < 4; cleared++) {
      h.tiles(cleared, 0, 0, 8); // Progressive PPU clear, starting at source index zero.
      const surviving = [0, 1, 2, 3].filter(column => column > cleared);
      for (let frame = 0; frame < 8; frame++) {
        h.render(); h.expectNoChinese(); h.expectMaskColumns(surviving);
        expect(h.coreMock.takeTextEvents.mock.results[0].value).toHaveLength(0);
      }
      // Even identical Japanese pixels from a later generation are no longer
      // source-owned. Neither those tiles nor a shifted Chinese prefix may return.
      h.sourceTiles(cleared, 9);
      h.render(); h.expectNoChinese(); h.expectMaskColumns(surviving);
    }
    h.observe(); h.render(); h.expectText('中文', 4);
  });

  it('treats kind 5 as a soft clear and kind 0 as a reducer hard reset', () => {
    const assets = makeAssets();
    const state = new TextObservationState(assets.runtime);
    const source = assets.runtime.runs[0].offset;
    state.consume([1, source, CELL, 0x11, 4, 7, CELL, 9]);
    const observed = state.glyphs.get(CELL);
    expect(observed?.expectedGenerations).toEqual([7, 9]);
    state.consume([5, source, 0, 0]);
    expect(state.glyphs.size).toBe(1);
    expect(state.glyphs.get(CELL)).toBe(observed);
    state.consume([0, 0, 0, 0]);
    expect(state.glyphs.size).toBe(0);
    state.consume([4, 7, CELL, 9]);
    expect(state.glyphs.size).toBe(0); // Generation evidence alone cannot resurrect a glyph.
  });

  it('does not drop text when the palette changes elsewhere in the completed frame', () => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    const sourceMetadata = h.metadata.slice(CELL * 4, (CELL + 36) * 4);
    h.coreMock.getTextBackdrop.mockReturnValue(0xffffffff); // Global scanline palette split.
    h.metadata.set([(3 << 8) | 0x22, 0x221, 0xabcdef + 1, 0x102030 + 1], 0x100 * 4);
    h.render(); h.expectText('中文', 4);
    expect(h.coreMock.getTextFrameMetadata).toHaveBeenCalledOnce();
    expect(h.metadata.slice(CELL * 4, (CELL + 36) * 4)).toEqual(sourceMetadata);
    expect(context.fillRect.mock.results.map(result => result.value)).toEqual(Array(8).fill('#123456'));
  });

  it('decodes independent 8×8 background and ink RGB+1 values, including encoded black', () => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe();
    for (let column = 0; column < 4; column++) {
      h.metadata[(CELL + column) * 4 + 2] = 1; // RGB black is not missing metadata.
      h.metadata[(CELL + column + 32) * 4 + 2] = 0x203040 + 1;
      h.metadata[(CELL + column) * 4 + 3] = 0;
      h.metadata[(CELL + column + 32) * 4 + 3] = 0xabcdef + 1;
    }
    h.render(); h.expectText('中文', 4);
    expect(context.fillRect.mock.results.map(result => result.value))
      .toEqual(Array.from({ length: 4 }, () => ['#000000', '#203040']).flat());
    expect(context.fillText.mock.results[0].value.color).toBe('#abcdef');
  });

  it.each([0, 32])('rejects a different physical CHR font despite identical tile/generation in half %i', half => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe(); h.render(); h.expectText('中文', 4);
    h.metadata[(CELL + 1 + half) * 4 + 1] += 0x1000;
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
  });

  it.each([0, 32])('accepts only a ROM-byte-verified CHR alias in half %i', half => {
    const assets = makeAssets();
    assets.runtime.fontAliases = Array.from({ length: 256 }, (_, tile) => [tile * 16, tile * 16 + 0x1000]);
    const h = harness(assets, true);
    h.frame(); h.observe();
    h.metadata[(CELL + 1 + half) * 4 + 1] += 0x1000;
    h.render(); h.expectText('中文', 4);
    // The same tile number in an unverified bank still cannot authorize masking.
    h.metadata[(CELL + 1 + half) * 4 + 1] += 0x1000;
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
  });

  it.each([0, 0xffffffff])('does not mask a cell with absent/ambiguous background metadata %i', background => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe();
    h.metadata[(CELL + 33) * 4 + 2] = background;
    h.render(); h.expectNoChinese(); h.expectMaskColumns([0, 2, 3]);
  });

  it.each(['中', '中文', '中文字'])('uses the same 12px font for %s rather than shrinking the line to fit', translation => {
    const h = harness(makeAssets([{ bytes: [0x11, 0x12, 0x13, 0x14], translation }]), true);
    h.frame(); h.observe(); h.render();
    // Three glyphs need 36px, more than the 32px source footprint. A 10px
    // per-line shrink would incorrectly paint it instead of preserving Japanese.
    if (translation.length === 3) { h.expectNoChinese(); h.expectMasks(0); }
    else h.expectText(translation, 4);
    expect(context.font).toBe('600 12px "Microsoft JhengHei", "Noto Sans TC", sans-serif');
    expect(context.measureText.mock.results[0].value.width).toBe(translation.length * 12);
  });

  it('composites native background, Chinese, then only winning sprite ImageData pixels over a verified menu', () => {
    const assets = makeAssets([{ bytes: [0x11, 0x12, 0x13, 0x14], translation: '中文' }]);
    assets.menus = {
      entries: [{ id: 'menu.command.fixture', source: 'あいうえ', translation: '確認',
        markTiles: [0, 0, 0, 0], bodyTiles: [0x11, 0x12, 0x13, 0x14] }],
      layouts: [], font: { chrPhysicalBase: 0 },
    };
    const h = harness(assets, true);
    h.frame(); // No dialogue events: the menu needs independent background evidence.
    const backgroundPtr = 393216, framebufferPtr = 131072;
    const background = new Uint16Array(h.memory.buffer, backgroundPtr, 256 * 240);
    background.set(h.provenance);
    const framebuffer = new Uint8ClampedArray(h.memory.buffer, framebufferPtr, 256 * 240 * 4);
    framebuffer.fill(255);
    const winners = [
      { index: (Y + 9) * 256 + X + 3, rgba: [0x12, 0xab, 0xef, 255] },
      { index: Y * 256 + X + 8, rgba: [0xed, 0x34, 0x56, 255] },
      { index: (Y + 20) * 256 + X + 48, rgba: [0x78, 0x9a, 0xbc, 255] },
    ];
    for (const { index, rgba } of winners) {
      background[index] ||= 0x101; // Also recover a winner outside the text mask.
      h.provenance[index] = 0;
      framebuffer.set(rgba, index * 4);
    }
    // A colored pixel with neither provenance, and one with surviving background
    // provenance, are not winning sprites and must stay transparent in that layer.
    framebuffer.set([1, 2, 3, 255], 0);
    framebuffer.set([4, 5, 6, 255], ((Y + 1) * 256 + X + 1) * 4);
    const original = framebuffer.slice(), originalBackground = background.slice();
    const originalProvenance = h.provenance.slice(), originalMetadata = h.metadata.slice();
    Object.assign(h.coreMock, {
      getFrameBufferPtr: vi.fn(() => framebufferPtr),
      getTextBackgroundProvenancePtr: vi.fn(() => backgroundPtr),
    });
    // jsdom has no native ImageData; keep the real RGBA buffer for pixel-exact
    // assertions on both native canvases instead of using the fillRect fallback.
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    });
    const native = { putImageData: vi.fn((_image: ImageData, _x: number, _y: number) => {}) };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function (this: HTMLCanvasElement) {
      return (this === h.layer ? context : native) as unknown as CanvasRenderingContext2D;
    } as HTMLCanvasElement['getContext']);
    h.render();

    expect(h.layer.dataset.text).toBe('確認');
    h.expectNoPanel();
    expect(context.fillText.mock.calls).toEqual([['確認', X, Y + 8]]);
    expect(context.fillText.mock.results[0].value).toEqual({
      font: '600 12px "Microsoft JhengHei", "Noto Sans TC", sans-serif', color: '#ffffff',
    });
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(native.putImageData).toHaveBeenCalledTimes(2);
    const [baseImage, spriteImage] = native.putImageData.mock.calls.map(([image, x, y]) => {
      expect(image).toBeInstanceOf(ImageData);
      expect([image.width, image.height, x, y]).toEqual([256, 240, 0, 0]);
      return image;
    });
    const expectedBase = original.slice();
    for (let y = Y; y < Y + 16; y++) for (let x = X; x < X + 32; x++) {
      expectedBase.set([0x12, 0x34, 0x56, 255], (y * 256 + x) * 4);
    }
    const expectedSprites = new Uint8ClampedArray(original.length);
    for (const { index, rgba } of winners) expectedSprites.set(rgba, index * 4);
    expect(baseImage.data).toEqual(expectedBase);
    expect(spriteImage.data).toEqual(expectedSprites); // All non-winners have zero alpha.
    expect(framebuffer).toEqual(original);
    expect(background).toEqual(originalBackground);
    expect(h.provenance).toEqual(originalProvenance);
    expect(h.metadata).toEqual(originalMetadata);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    const canvases = context.drawImage.mock.calls.map(([canvas, ...geometry]) => {
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas).not.toBe(h.screen);
      expect(canvas).not.toBe(h.layer);
      expect([canvas.width, canvas.height]).toEqual([256, 240]);
      expect(geometry).toEqual([0, 8, 256, 224, 0, 0, h.layer.width, h.layer.height]);
      return canvas;
    });
    expect(canvases[0]).not.toBe(canvases[1]);
    expect(context.imageSmoothingEnabled).toBe(false);
    const [baseDraw, spriteDraw] = context.drawImage.mock.invocationCallOrder;
    const textDraw = context.fillText.mock.invocationCallOrder[0];
    expect(native.putImageData.mock.invocationCallOrder[0]).toBeLessThan(baseDraw);
    expect(baseDraw).toBeLessThan(textDraw);
    expect(textDraw).toBeLessThan(native.putImageData.mock.invocationCallOrder[1]);
    expect(native.putImageData.mock.invocationCallOrder[1]).toBeLessThan(spriteDraw);

    // Background provenance cannot authorize masking a menu with a wrong CHR
    // identity, even when its visible tile numbers and sprite pixels still match.
    h.metadata[(CELL + 1) * 4 + 1] += 0x1000;
    h.render(); h.expectNoChinese(); h.expectMasks(0);
    expect(native.putImageData).toHaveBeenCalledTimes(2);
    expect(native.putImageData.mock.calls[0][0].data).toEqual(original);
    expect(native.putImageData.mock.calls[1][0].data).toEqual(expectedSprites);
    expect(framebuffer).toEqual(original);
  });

  it.each([333.3, 401.25])('eliminates white source pixels before scaling at noninteger output width %s', width => {
    const h = harness(makeAssets(), true);
    h.frame(); h.observe();
    for (let column = 0; column < 4; column++) {
      h.metadata[(CELL + column) * 4 + 2] = 1;
      h.metadata[(CELL + column + 32) * 4 + 2] = 1;
    }
    const framebufferPtr = 131072;
    const framebuffer = new Uint8ClampedArray(h.memory.buffer, framebufferPtr, 256 * 240 * 4);
    framebuffer.fill(255); // White glyph pixels, including every tile boundary.
    const original = framebuffer.slice();
    Object.assign(h.coreMock, { getFrameBufferPtr: vi.fn(() => framebufferPtr) });
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    });
    const native = { putImageData: vi.fn((_image: ImageData, _x: number, _y: number) => {}) };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function (this: HTMLCanvasElement) {
      return (this === h.layer ? context : native) as unknown as CanvasRenderingContext2D;
    } as HTMLCanvasElement['getContext']);
    vi.stubGlobal('devicePixelRatio', 2);
    Object.assign(h.screenBox, { width, height: width * 224 / 256 });
    ResizeObserverMock.instances[0].trigger();
    h.render();

    expect(h.layer.width / 256 % 1).not.toBe(0);
    expect(native.putImageData).toHaveBeenCalledOnce();
    const [image, px, py] = native.putImageData.mock.calls[0];
    expect([image.width, image.height, px, py]).toEqual([256, 240, 0, 0]);
    const expectedPixels = original.slice();
    for (let y = Y; y < Y + 16; y++) for (let x = X; x < X + 32; x++) {
      const p = (y * 256 + x) * 4;
      expectedPixels[p] = expectedPixels[p + 1] = expectedPixels[p + 2] = 0;
    }
    // Inspect the captured native pixels, not just rectangle counts: all 512
    // source pixels (including adjoining 8×8 edges) must be black and opaque;
    // everything outside the exact source footprint must remain untouched.
    expect(image.data).toEqual(expectedPixels);
    expect(framebuffer).toEqual(original); // Display-only; never patch the core.
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledOnce();
    const [canvas, ...geometry] = context.drawImage.mock.calls[0];
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas).not.toBe(h.screen);
    expect(canvas).not.toBe(h.layer);
    expect([canvas.width, canvas.height]).toEqual([256, 240]);
    expect(geometry).toEqual([0, 8, 256, 224, 0, 0, h.layer.width, h.layer.height]);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(native.putImageData.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    expect(context.drawImage.mock.invocationCallOrder[0]).toBeLessThan(context.fillText.mock.invocationCallOrder[0]);
    expect(context.fillText.mock.calls).toEqual([['中文', X, Y + 8]]);
    expect(context.fillText.mock.results[0].value.font).toContain('12px');
  });
});

describe('canonical localization asset validation', () => {
  it('accepts the canonical-shaped fixture used by render tests', () => {
    expect(() => validateLocalizationAssets(makeAssets())).not.toThrow();
  });

  const malformed: [string, (assets: LocalizationAssets) => void][] = [
    ['wrong canonical ROM hash', a => { a.catalog.sourceSha256 = a.runtime.sourceSha256 = '0'.repeat(64); }],
    ['runtime/catalog hash mismatch', a => { a.runtime.sourceSha256 = CT2_SOURCE_HASHES[1]; }],
    ['duplicate catalog ID', a => { a.catalog.entries.push({ ...a.catalog.entries[0] }); }],
    ['non-string translation', a => { (a.catalog.entries[0] as unknown as { translation: unknown }).translation = null; }],
    ['unknown runtime entry', a => { a.runtime.runs[0].id = 'absent'; }],
    ['overlapping source offsets', a => {
      a.catalog.entries.push({ ...a.catalog.entries[0], id: 'other' });
      a.runtime.runs.push({ ...a.runtime.runs[0], id: 'other', bytes: [...a.runtime.runs[0].bytes] });
    }],
    ['source outside the dialogue bank', a => { a.runtime.runs[0].offset = 0x5fff; }],
    ['source crossing the bank boundary', a => { a.runtime.runs[0].offset = 0xbfff; }],
    ['invalid source glyph', a => { a.runtime.runs[0].bytes[0] = 0xd9; }],
    ['truncated lower-tile table', a => { a.runtime.lowerTiles.pop(); }],
    ['non-byte lower tile', a => { a.runtime.lowerTiles[0] = 256; }],
    ['empty scene span', a => { a.runtime.scenes[0].length = 0; }],
  ];
  it.each(malformed)('rejects %s without modifying its input', (_name, mutate) => {
    const assets = makeAssets();
    mutate(assets);
    const before = structuredClone(assets);
    expect(() => validateLocalizationAssets(assets)).toThrow();
    expect(assets).toEqual(before);
  });
});