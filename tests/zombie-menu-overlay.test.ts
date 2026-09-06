// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL as NodeURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import { VerifiedMenuOverlay } from '../src/game-profiles/verified-menu-overlay';
import { locateVerifiedCellMenus, ZOMBIE_HUNTER_HASH, type CellMenuCatalog } from '../src/game-profiles/verified-cell-menus';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { seedFirstInventoryItem } from '../tools/zombie-name-source.mjs';

// Actual WASM/controller/frame data and actual renderer, deterministic Canvas
// metrics only. This proves draw calls, NOT installed fonts or visual quality.
it('renders all original-ROM menu labels; toggle, restore, reset and clipping fail safely', () => {
  const read = (p: string) => readFileSync(new NodeURL(p, import.meta.url));
  const rom = read('../roms/Zombie Hunter (Japan).nes');
  expect(createHash('sha256').update(rom).digest('hex')).toBe(ZOMBIE_HUNTER_HASH);
  const catalog: CellMenuCatalog = JSON.parse(read('../public/game-profiles/zombie-hunter-jp/menus.json').toString());
  initSync({ module: read('../src/wasm/nes_wasm_bg.wasm') });
  const core = new EmuWasm();
  const ctx = {
    font: '', fillStyle: '', textBaseline: '', textAlign: '',
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    measureText: vi.fn(function (this: { font: string }, text: string) {
      return { width: [...text].length * Number(/([\d.]+)px/.exec(this.font)![1]) };
    }),
  };
  const disconnect = vi.fn();
  let resize!: () => void;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect = disconnect;
  });
  vi.stubGlobal('devicePixelRatio', 1.25);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as unknown as HTMLCanvasElement['getContext']);
  const parent = document.createElement('div'), screen = document.createElement('canvas');
  parent.className = 'screen-bezel'; parent.style.position = 'relative';
  screen.width = 256; screen.height = 224; parent.append(screen); document.body.append(parent);
  const rect = { left: 0, top: 0, width: 512, height: 448, right: 512, bottom: 448, x: 0, y: 0, toJSON() {} };
  vi.spyOn(screen, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(rect);
  let overlay: VerifiedMenuOverlay | undefined;
  try {
    expect(core.loadRom(rom)).toBe(true);
    expect(core.getActiveGameProfileId()).toBe('');
    expect(core.enableTextObserver(true)).toBe(true);
    overlay = new VerifiedMenuOverlay(screen, catalog);
    const layer = parent.querySelector<HTMLCanvasElement>('.nes-localization-layer')!;
    const toggle = parent.nextElementSibling as HTMLButtonElement;
    const draw = (top = 8) => { ctx.fillText.mockClear(); overlay!.render(core, top); return ctx.fillText.mock.calls.map(c => c[0]); };
    const seen = new Set<string>();
    let temporary = '', persistent = '';
    for (let frame = 0; frame <= 900; frame++) {
      for (const [at, button] of [[120,3],[240,3],[420,3],[520,5],[620,0],[720,1],[820,3]]) {
        if (frame === at) core.setButton(0, button, true);
        if (frame === at + 2) core.setButton(0, button, false);
      }
      core.frame(); core.consumeAudioSamples();
      for (const text of draw()) seen.add(text);
      expect(core.takeTextEvents().length).toBe(0); // no CT2 writer
      if (frame === 200) expect(draw()).toEqual(['按 START 開始']);
      if (frame === 450) {
        expect(draw()).toEqual(['道具', '武器', '裝備', '能力', '體力', '經驗', '金錢']);
        const metadata = core.getTextFrameMetadata();
        const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 256 * 240).slice();
        const regions = locateVerifiedCellMenus(catalog, metadata, provenance);
        // These source rows are scrolled (155, not tile-aligned 152). A 2.5x
        // backing scale previously left half-covered clip/mask boundary pixels.
        expect(regions.find(r => r.entry.id === 'menu.items')?.y).toBe(155);
        for (const [width, dpr] of [[512, 1.25], [393, 3], [683, 1.5], [375, 1]]) {
          rect.width = width; rect.height = width * 224 / 256;
          vi.stubGlobal('devicePixelRatio', dpr); resize();
          ctx.fillRect.mockClear(); ctx.rect.mockClear(); ctx.setTransform.mockClear();
          expect(draw()).toHaveLength(7);
          const scale = layer.width / 256;
          expect(Number.isInteger(scale)).toBe(true);
          expect(layer.height / 224).toBe(scale);
          expect(layer.style.imageRendering).toBe('pixelated');
          expect(ctx.setTransform).toHaveBeenLastCalledWith(scale, 0, 0, scale, 0, -8 * scale);
          const bounds = regions.map(({ entry, x, y }) => [x, y, entry.width * 8, entry.height * 8]);
          expect(ctx.fillRect.mock.calls).toEqual(bounds); // no outward padding
          expect(ctx.rect.mock.calls).toEqual(bounds);
          for (const box of bounds) expect(box.every(v => Number.isInteger(v * scale))).toBe(true);
        }
        // Adjacent pixels are not owned by the translation. A cursor there must
        // neither enlarge the mask nor suppress it; inside, exclude that pixel.
        const items = regions.find(r => r.entry.id === 'menu.items')!;
        const edge = (items.y + 8) * 256 + items.x + items.entry.width * 8;
        provenance[edge] = 0;
        expect(locateVerifiedCellMenus(catalog, metadata, provenance)).toEqual(regions);
        provenance[edge - 1] = 0;
        const clipped = locateVerifiedCellMenus(catalog, metadata, provenance);
        expect(clipped.filter(r => r.entry.group === 'pause')).toHaveLength(4);
        expect(clipped.find(r => r.entry.id === 'menu.items')?.clips).toBeDefined();
        // Exercise the renderer clip itself, not only the matcher's output.
        // Modify diagnostic provenance only, then restore it before emulation.
        const live = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 256 * 240);
        const coveredPixel = items.y * 256 + items.x;
        const savedPixel = live[coveredPixel];
        live[coveredPixel] = 0;
        ctx.rect.mockClear();
        expect(draw()).toContain('道具');
        const safe = locateVerifiedCellMenus(catalog, metadata, live).find(r => r.entry.id === 'menu.items')!;
        expect(safe.x).toBe(items.x); // occlusion must not shift the origin
        expect(safe.y).toBe(items.y);
        expect(safe.clips).toBeDefined();
        for (const box of safe.clips!) {
          expect(ctx.rect.mock.calls).toContainEqual([box.x, box.y, box.width, box.height]);
          expect(items.x >= box.x && items.x < box.x + box.width && items.y >= box.y && items.y < box.y + box.height).toBe(false);
        }
        live[coveredPixel] = savedPixel;
        temporary = core.exportSaveState(); persistent = core.exportPersistentSaveState();
        toggle.click(); expect(draw()).toEqual([]); expect(layer.dataset.text).toBe('');
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        toggle.click(); expect(draw()).toContain('道具');
        ctx.measureText.mockReturnValueOnce({ width: 999 });
        expect(draw()).not.toContain('道具'); // never squash overflowing labels
        expect(draw(220)).toEqual([]); // crop must not cover outside visible frame
      }
      if ([300,650,850,900].includes(frame)) expect(draw()).not.toContain('道具');
    }
    for (const restore of [() => core.importSaveState(temporary), () => core.importPersistentSaveState(persistent)]) {
      expect(restore()).toBe(true);
      expect(draw()).toEqual([]); // old timeline observations cleared
      core.frame(); core.consumeAudioSamples();
      expect(draw()).toContain('道具'); // provenance stays enabled, unlike CT2 writer flag
    }
    for (const [menu, group] of ['items', 'weapons', 'equipment', 'status'].entries()) {
      core.reset();
      const events = [[120,3],[240,3],[420,3],
        ...Array.from({length: menu}, (_,i) => [470+i*30,5]), [600,0]];
      for (let frame = 0; frame <= 650; frame++) {
        for (const [at,button] of events) {
          if (frame === at) core.setButton(0,button,true);
          if (frame === at+2) core.setButton(0,button,false);
        }
        core.frame(); core.consumeAudioSamples();
      }
      const texts = draw();
      for (const entry of catalog.entries.filter(e => e.group === group)) expect(texts).toContain(entry.translation);
      for (const text of texts) seen.add(text);
      toggle.click(); expect(draw()).toEqual([]);
      toggle.click(); expect(draw()).toEqual(texts);
    }
    // Exercise every added action/scroll evidence frame using its native inputs.
    const artifacts = [...new Set(catalog.entries.filter(e => e.group.includes('-')).map(e =>
      (e as typeof e & { evidence: { artifact: string } }).evidence.artifact))];
    for (const artifact of artifacts) {
      const route = JSON.parse(read(`../${artifact}`).toString());
      core.reset();
      for (let frame = 0; frame <= route.frame; frame++) {
        for (const [at, button] of route.events) {
          if (frame === at) core.setButton(0, button, true);
          if (frame === at + 2) core.setButton(0, button, false);
        }
        core.frame(); core.consumeAudioSamples();
      }
      const texts = draw();
      for (const entry of catalog.entries.filter(e =>
        (e as typeof e & { evidence: { artifact: string } }).evidence.artifact === artifact)) {
        expect(texts, entry.id).toContain(entry.translation);
      }
      for (const text of texts) seen.add(text);
    }
    expect([...seen].sort()).toEqual([...new Set(catalog.entries.map(e => e.translation))].sort());
    // All source selectors must reach the real Canvas renderer, not just the
    // matcher. Seed inventory only; native discard writes the name and level.
    core.reset();
    for (let frame = 0; frame <= 710; frame++) {
      core.setButton(0, 3, [120,121,240,241,420,421].includes(frame));
      core.setButton(0, 5, [630,631].includes(frame));
      core.setButton(0, 0, [600,601,670,671].includes(frame));
      core.frame(); core.consumeAudioSamples();
    }
    const inventoryBase = core.exportSaveState();
    expect(catalog.names).toHaveLength(32);
    for (const name of catalog.names!) {
      expect(core.importSaveState(inventoryBase)).toBe(true);
      seedFirstInventoryItem(core, name.selector);
      for (let frame = 711; frame <= 780; frame++) {
        core.setButton(0, 0, [750,751].includes(frame));
        core.frame(); core.consumeAudioSamples();
      }
      expect(draw(), `${name.selector}: ${name.source}`).toContain(name.translation);
      expect(draw()).toContain('等級');
      if (name.selector === 13) {
        for (let frame = 781; frame <= 793; frame++) { core.frame(); core.consumeAudioSamples(); }
        const metadata = core.getTextFrameMetadata();
        const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 61440);
        const partials = locateVerifiedCellMenus(catalog, metadata, provenance, core.getZombieMenuSource()).filter(m => m.partial);
        expect(partials.length).toBeGreaterThan(0);
        ctx.rect.mockClear();
        const texts = draw();
        for (const partial of partials) {
          expect(texts).toContain(partial.entry.translation);
          expect(partial.clips).toBeDefined();
          for (const box of partial.clips!) expect(ctx.rect.mock.calls).toContainEqual([box.x, box.y, box.width, box.height]);
        }
        toggle.click(); expect(draw()).toEqual([]);
        toggle.click(); expect(draw()).toEqual(texts);
      }
    }
    core.reset(); expect(draw()).toEqual([]);
    overlay.dispose(); overlay = undefined;
    expect(disconnect).toHaveBeenCalled();
    expect(parent.querySelector('.nes-localization-layer')).toBeNull();
    expect(toggle.isConnected).toBe(false);
  } finally {
    overlay?.dispose(); core.free(); parent.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
}, 120000);