import type { EmuWasm } from '../wasm/nes_wasm.js';
import { locateMenuTranslations } from './menu-localization';
import {
  LOCALIZATION_STORAGE_KEY, TextObservationState, mergeLocalizationDraft,
  locateTextCells, cellRectangleVisible, type LocalizationAssets, type LocalizationCatalog, type ObservedGlyph,
} from './localization';

/** High-resolution display-only translation. The emulated framebuffer is untouched. */
export class NesTextOverlay {
  private layer = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private controls = document.createElement('div');
  private readonly development = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  private composite = document.createElement('canvas');
  private sprites = document.createElement('canvas');
  private masks: { x: number; y: number; width: number; height: number; color: number }[] = [];
  private paints: { text: string; x: number; y: number; font: string; color: string }[] = [];
  private state: TextObservationState;
  private catalog: LocalizationCatalog;
  private entries: Map<string, LocalizationCatalog['entries'][number]>;
  private observer: ResizeObserver;
  private enabled = true;
  private byLine = new Map<string, LocalizationAssets['runtime']['runs']>();
  private lastRendered = '';
  private lastCore: EmuWasm | null = null;
  private overscanTop = 8;
  private onStorage = (event: StorageEvent) => {
    if (event.key === LOCALIZATION_STORAGE_KEY) this.loadDraft();
  };

  constructor(private screen: HTMLCanvasElement, private assets: LocalizationAssets) {
    this.catalog = assets.catalog;
    this.entries = new Map(this.catalog.entries.map(e => [e.id, e]));
    this.state = new TextObservationState(assets.runtime);
    for (const run of assets.runtime.runs) {
      const list = this.byLine.get(run.line) ?? [];
      list.push(run); this.byLine.set(run.line, list);
    }
    this.layer.className = 'nes-localization-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.style.cssText = 'position:absolute;pointer-events:none;z-index:3;image-rendering:auto;max-width:none;border:0;border-radius:0;';
    const parent = screen.parentElement!;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.append(this.layer);
    this.context = this.layer.getContext('2d')!;
    this.composite.width = 256; this.composite.height = 240;
    this.sprites.width = 256; this.sprites.height = 240;
    this.controls.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px;font:13px system-ui;color:#bde8e1;';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.textContent = '中文增強：開'; toggle.setAttribute('aria-pressed', 'true');
    toggle.addEventListener('click', () => {
      this.enabled = !this.enabled; toggle.textContent = this.enabled ? '中文增強：開' : '中文增強：關';
      toggle.setAttribute('aria-pressed', String(this.enabled));
      this.repaint();
    });
    const editor = document.createElement('a');
    editor.href = new URL('translation-studio.html', document.baseURI).href;
    editor.target = '_blank'; editor.rel = 'noopener'; editor.textContent = '編輯中文／匯入翻譯'; editor.style.color = '#7ae1cc';
    const scope = document.createElement('span'); scope.textContent = '中文化開發模式・固定字級／快速逐字';
    this.controls.append(toggle, editor, scope);
    if (this.development) screen.closest('.screen-bezel')?.after(this.controls);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(screen);
    if (this.development) { window.addEventListener('storage', this.onStorage); this.loadDraft(); }
    this.resize();
  }

  private loadDraft(): void {
    try {
      const text = localStorage.getItem(LOCALIZATION_STORAGE_KEY);
      if (text && text.length > 4 * 1024 * 1024) throw new Error('翻譯草稿太大');
      this.catalog = text ? mergeLocalizationDraft(this.assets.catalog, JSON.parse(text)) : this.assets.catalog;
      this.entries = new Map(this.catalog.entries.map(e => [e.id, e]));
      this.repaint();
    } catch (error) { console.warn('[中文化] 拒絕無效草稿，保留目前翻譯', error); }
  }

  private resize(): void {
    const screenRect = this.screen.getBoundingClientRect();
    const style = getComputedStyle(this.screen);
    const left = parseFloat(style.borderLeftWidth) || 0, top = parseFloat(style.borderTopWidth) || 0;
    let width = screenRect.width - left - (parseFloat(style.borderRightWidth) || 0);
    let height = screenRect.height - top - (parseFloat(style.borderBottomWidth) || 0);
    const parentRect = this.screen.parentElement!.getBoundingClientRect();
    let insetX = 0, insetY = 0;
    if (style.objectFit === 'contain') {
      const fit = Math.min(width / this.screen.width, height / this.screen.height);
      insetX = (width - this.screen.width * fit) / 2;
      insetY = (height - this.screen.height * fit) / 2;
      width = this.screen.width * fit; height = this.screen.height * fit;
    }
    this.layer.style.left = `${screenRect.left + left - parentRect.left - this.screen.parentElement!.clientLeft + insetX}px`;
    this.layer.style.top = `${screenRect.top + top - parentRect.top - this.screen.parentElement!.clientTop + insetY}px`;
    this.layer.style.width = `${width}px`; this.layer.style.height = `${height}px`;
    const scale = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * width / 256));
    this.layer.width = Math.ceil(256 * scale);
    this.layer.height = Math.ceil(this.screen.height * scale);
    this.repaint();
  }

  private repaint(): void {
    if (!this.lastCore) return;
    try { this.render(this.lastCore, this.overscanTop, true); }
    catch (error) { this.layer.width = this.layer.width; this.layer.dataset.text = ''; console.warn('[中文化] 重繪失敗', error); }
  }

  render(core: EmuWasm, overscanTop: number, repaint = false): void {
    this.lastCore = core; this.overscanTop = overscanTop;
    if (!repaint) this.state.consume(core.takeTextEvents());
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layer.width, this.layer.height);
    this.lastRendered = '';
    this.masks = []; this.paints = [];
    this.layer.dataset.text = '';
    delete this.layer.dataset.overflow;
    if (!this.enabled) { this.layer.dataset.text = ''; return; }
    const memory = core.getWasmMemory() as WebAssembly.Memory;
    const ptr = core.getTextProvenancePtr();
    if (!ptr) return;
    // WASM allocations above may grow memory: acquire this view LAST.
    const fetched = core.getTextFetchedCells();
    const metadata = core.getTextFrameMetadata?.();
    const backdrop = core.getTextBackdrop();
    if (!metadata && backdrop > 0xffffff) return;
    const provenance = new Uint16Array(memory.buffer, ptr, 256 * 240);
    const backgroundPtr = core.getTextBackgroundProvenancePtr?.();
    const background = backgroundPtr ? new Uint16Array(memory.buffer, backgroundPtr, 256 * 240) : provenance;
    const positions = locateTextCells(provenance, new Set(this.state.glyphs.keys()));
    const rows = new Map<string, { glyphs: ObservedGlyph[]; x: number; y: number; firstIndex: number }>();
    const rejected = new Set<string>();
    for (const glyph of this.state.glyphs.values()) {
      // Dynamic battle fragments have not yet passed whole-message layout tests.
      if (glyph.run.domain === 'battle' || !glyph.expectedGenerations) continue;
      const pos = positions.get(glyph.cell);
      const lower = glyph.glyph < 0xa0 ? glyph.glyph : this.assets.runtime.lowerTiles[glyph.glyph];
      const upper = glyph.glyph < 0xa0 ? 0 : glyph.glyph < 0xc8 ? 0x94 : 0x95;
      const generations: [number, number] = [fetched[glyph.cell], fetched[glyph.cell + 32]];
      const matches = generations[0] !== 0 && generations[1] !== 0
        && generations[0] !== 0xffffffff && generations[1] !== 0xffffffff
        && (generations[0] & 255) === upper && (generations[1] & 255) === lower;
      if (glyph.expectedGenerations && (generations[0] >>> 8 !== glyph.expectedGenerations[0]
          || generations[1] >>> 8 !== glyph.expectedGenerations[1])) {
        if (generations[0] >>> 8 > glyph.expectedGenerations[0] || generations[1] >>> 8 > glyph.expectedGenerations[1]) {
          this.state.glyphs.delete(glyph.cell); rejected.add(glyph.run.line);
        }
        continue;
      }
      if (glyph.generations && (generations[0] !== glyph.generations[0] || generations[1] !== glyph.generations[1])) {
        this.state.glyphs.delete(glyph.cell); rejected.add(glyph.run.line); continue;
      }
      const matchesFont = (tile: number, physical: number) =>
        (this.assets.runtime.fontAliases?.[tile] ?? [tile * 16]).includes(physical - 1);
      if (metadata && (!matchesFont(upper, metadata[glyph.cell * 4 + 1])
          || !matchesFont(lower, metadata[(glyph.cell + 32) * 4 + 1]))) {
        if (metadata[glyph.cell * 4 + 1] && metadata[(glyph.cell + 32) * 4 + 1]) this.state.glyphs.delete(glyph.cell);
        continue;
      }
      if (!matches) {
        if (!repaint) glyph.pendingFrames = (glyph.pendingFrames ?? 0) + 1;
        if ((glyph.pendingFrames ?? 0) > 6) this.state.glyphs.delete(glyph.cell);
        // A pending trailing DMA cell is normal; prefix validation below stops
        // it from being mistaken for already-visible text.
        continue;
      }
      glyph.generations = generations;
      if (!pos || !cellRectangleVisible(provenance, glyph.cell, pos.x, pos.y)) {
        rejected.add(glyph.run.line); continue;
      }
      // During a progressive clear the line may no longer be a complete prefix,
      // but its surviving source cells must stay hidden until THEY are erased.
      const translated = this.byLine.get(glyph.run.line)?.every(run => !!this.entries.get(run.id)?.translation.trim());
      if (translated && (!metadata || [glyph.cell, glyph.cell + 32].every(cell => metadata[cell * 4 + 2] > 0 && metadata[cell * 4 + 2] <= 0x1000000))) {
        this.mask(pos.x, pos.y, 8, 8, metadata ? metadata[glyph.cell * 4 + 2] - 1 : backdrop);
        this.mask(pos.x, pos.y + 8, 8, 8, metadata ? metadata[(glyph.cell + 32) * 4 + 2] - 1 : backdrop);
      }
      const key = `${glyph.run.line}:${pos.y}`;
      const row = rows.get(key) ?? { glyphs: [], x: pos.x, y: pos.y, firstIndex: glyph.index };
      row.x = Math.min(row.x, pos.x); row.glyphs.push(glyph); rows.set(key, row);
    }
    const scaleX = this.layer.width / 256;
    const scaleY = this.layer.height / this.screen.height;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, -overscanTop * scaleY);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const row of rows.values()) {
      const runs = this.byLine.get(row.glyphs[0].run.line)!;
      if (rejected.has(row.glyphs[0].run.line)) continue;
      if (runs.some(run => !this.entries.get(run.id)?.translation.trim() && this.entries.get(run.id)?.source.trim())) continue;
      const translation = runs.map(run => this.entries.get(run.id)!.translation).join('').replace(/^ +/, '');
      if (!translation) continue;
      const sourceLength = runs.reduce((sum, run) => sum + run.bytes.length, 0);
      const expected = runs.flatMap(run => run.bytes.map((_, index) => ({ run, index })));
      const ordered = [...row.glyphs].sort((a, b) => positions.get(a.cell)!.x - positions.get(b.cell)!.x);
      if (ordered.some((glyph, index) => glyph.run.id !== expected[index]?.run.id || glyph.index !== expected[index]?.index)) continue;
      // Only contiguous, actually fetched cells can be replaced. Sprite overlap,
      // incomplete DMA or off-screen rows automatically retain the original.
      const sorted = row.glyphs.map(g => positions.get(g.cell)!).sort((a, b) => a.x - b.x);
      if (sorted.some((p, i) => i > 0 && p.x !== sorted[i - 1].x + 8)) continue;
      // Allow longer translation only into proven empty cells on this SAME row.
      // Never extend over portraits, window borders, sprites or other text.
      const first = row.glyphs.find(g => positions.get(g.cell)?.x === row.x)!;
      let width = Math.min(sourceLength * 8, 248 - row.x);
      // Every cell under the whole translation must be source-owned or blank,
      // and actually visible in this completed frame (not just the prefix).
      let safeWidth = 0;
      for (let column = 0; row.x + (column + 1) * 8 <= 248; column++) {
        const cell = first.cell + column;
        const owned = row.glyphs.some(g => g.cell === cell);
        const blank = fetched[cell] !== 0 && fetched[cell + 32] !== 0
          && (fetched[cell] & 255) === 0 && (fetched[cell + 32] & 255) === 0;
        if ((!owned && !blank) || !cellRectangleVisible(provenance, cell, row.x + column * 8, row.y)) break;
        safeWidth += 8;
      }
      width = Math.min(width, safeWidth);
      for (let column = Math.ceil(width / 8); row.x + (column + 1) * 8 <= 248; column++) {
        const cell = first.cell + column;
        if (!fetched[cell] || !fetched[cell + 32] || (fetched[cell] & 255) !== 0 || (fetched[cell + 32] & 255) !== 0
            || !cellRectangleVisible(provenance, cell, row.x + column * 8, row.y)) break;
        width = (column + 1) * 8;
      }
      ctx.font = '600 12px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
      const text = runs.map(run => {
        const count = ordered.filter(glyph => glyph.run.id === run.id).length;
        const target = this.entries.get(run.id)!.translation;
        // Twice the original proportional reveal, without speeding CPU/audio
        // or revealing a later script fragment before its first source event.
        return [...target].slice(0, Math.ceil([...target].length * count * 2 / run.bytes.length)).join('');
      }).join('').replace(/^ +/, '');
      // The source tiles contain only the original glyph and universal backdrop.
      // Cover those tiles only, never the portrait or a guessed dialogue rectangle.
      const sourceCells = ordered.flatMap(g => [g.cell, g.cell + 32]);
      if (metadata && sourceCells.some(cell => !metadata[cell * 4 + 2] || metadata[cell * 4 + 2] > 0x1000000)) continue;
      const ink = metadata ? Math.max(...sourceCells.map(cell => metadata[cell * 4 + 3])) - 1 : 0xffffff;
      if (ctx.measureText(translation).width <= width) this.paint(text, row.x, row.y + 8, ctx.font, Math.max(0, ink));
      else {
        // Never relocate or silently truncate prose. An unreviewed oversized
        // draft falls back at its original position; fixed wording is authored.
        this.masks = this.masks.filter(m => !(m.y >= row.y && m.y < row.y + 16 && m.x >= row.x && m.x < row.x + sorted.length * 8));
        if (this.development) this.layer.dataset.overflow = runs.map(r => r.id).join(',');
        continue;
      }
      this.lastRendered += `${text}\n`;
    }
    if (metadata && this.assets.menus) {
      for (const menu of locateMenuTranslations(this.assets.menus, background, metadata)) {
        if (menu.id.startsWith('menu.title.')) continue;
        // Password symbols are data, not Japanese prose; the matcher preserves them.
        const overlaps = this.masks.some(m => m.x < menu.x + menu.width && m.x + m.width > menu.x
          && m.y < menu.y + menu.height && m.y + m.height > menu.y);
        if (overlaps) continue;
        const fontSize = menu.id === 'menu.password.confirm' ? 8 : 12;
        const font = `600 ${fontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.font = font;
        let menuWidth = menu.width;
        const needed = ctx.measureText(menu.translation).width;
        // A short Japanese label may need one extra Chinese cell; use only
        // fetched blank background between the label and its numeric value.
        if (menu.id !== 'menu.password.confirm') {
          while (menuWidth < needed && menu.x + menuWidth + 8 <= 248) {
            const x = menu.x + menuWidth;
            let blank = true;
            for (let dy = 0; dy < menu.height && blank; dy += 8) {
              const tag = background[(menu.y + dy) * 256 + x];
              const cell = (tag & 0xfff) - 1;
              if (cell < 0 || tag & 0x7000 || (metadata[cell * 4] & 255) !== 0
                  || !metadata[cell * 4] || metadata[cell * 4] === 0xffffffff
                  || metadata[cell * 4 + 1] !== 1
                  || metadata[cell * 4 + 2] !== metadata[menu.cells[0] * 4 + 2]) { blank = false; break; }
              for (let yy = 0; yy < 8 && blank; yy++) for (let xx = 0; xx < 8; xx++) {
                if (background[(menu.y + dy + yy) * 256 + x + xx] !== ((cell + 1) | yy << 12)) { blank = false; break; }
              }
            }
            if (!blank || this.masks.some(m => m.x < x + 8 && m.x + m.width > x && m.y < menu.y + menu.height && m.y + m.height > menu.y)) break;
            menuWidth += 8;
          }
        }
        if (needed > menuWidth) continue;
        for (let index = 0; index < menu.cells.length; index++) {
          const columns = menu.width / 8;
          this.mask(menu.x + index % columns * 8, menu.y + Math.floor(index / columns) * 8,
            8, 8, metadata[menu.cells[index] * 4 + 2] - 1);
        }
        const ink = Math.max(...menu.cells.map(cell => metadata[cell * 4 + 3])) - 1;
        if (needed <= menuWidth) {
          this.paint(menu.translation, menu.x, menu.y + menu.height / 2, font, Math.max(0, ink));
        }
        this.lastRendered += `${menu.translation}\n`;
      }
    }
    this.drawComposite(core, overscanTop, provenance, background);
    this.layer.dataset.text = this.lastRendered.trim();
  }

  private mask(x: number, y: number, width: number, height: number, color: number): void {
    this.masks.push({ x, y, width, height, color });
  }

  private paint(text: string, x: number, y: number, font: string, color: number): void {
    this.paints.push({ text, x, y, font, color: `#${color.toString(16).padStart(6, '0')}` });
  }

  private drawComposite(core: EmuWasm, overscanTop: number, provenance: Uint16Array, background: Uint16Array): void {
    const ctx = this.context;
    let spritePixels: Uint8ClampedArray<ArrayBuffer> | undefined;
    // Mask at the SAME native pixel grid as the game before scaling. Separate
    // antialiased high-resolution rectangles left fractional white seams.
    if (typeof core.getFrameBufferPtr === 'function' && typeof ImageData !== 'undefined') {
      const pixels = new Uint8ClampedArray(new Uint8Array((core.getWasmMemory() as WebAssembly.Memory).buffer,
        core.getFrameBufferPtr(), 256 * 240 * 4));
      for (let i = 0; i < provenance.length; i++) {
        if (background[i] && !provenance[i]) {
          spritePixels ??= new Uint8ClampedArray(pixels.length);
          spritePixels.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
        }
      }
      for (const mask of this.masks) {
        for (let y = mask.y; y < mask.y + mask.height; y++) for (let x = mask.x; x < mask.x + mask.width; x++) {
          const p = (y * 256 + x) * 4;
          pixels[p] = mask.color >>> 16; pixels[p + 1] = mask.color >>> 8 & 255; pixels[p + 2] = mask.color & 255;
        }
      }
      this.composite.getContext('2d')!.putImageData(new ImageData(pixels, 256, 240), 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.composite, 0, overscanTop, 256, this.screen.height, 0, 0, this.layer.width, this.layer.height);
      const sx = this.layer.width / 256, sy = this.layer.height / this.screen.height;
      ctx.setTransform(sx, 0, 0, sy, 0, -overscanTop * sy);
    } else {
      // Deterministic non-pixel test contexts.
      for (const mask of this.masks) { ctx.fillStyle = `#${mask.color.toString(16).padStart(6, '0')}`; ctx.fillRect(mask.x, mask.y, mask.width, mask.height); }
    }
    for (const paint of this.paints) {
      ctx.font = paint.font; ctx.fillStyle = paint.color;
      ctx.fillText(paint.text, paint.x, paint.y);
    }
    if (spritePixels) {
      // Re-composite the actual winning sprite pixels above translated menus:
      // arrows, ball cursors and animation are never erased by a text mask.
      this.sprites.getContext('2d')!.putImageData(new ImageData(spritePixels, 256, 240), 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.sprites, 0, overscanTop, 256, this.screen.height, 0, 0, this.layer.width, this.layer.height);
    }
  }

  dispose(): void {
    this.lastCore = null;
    this.observer.disconnect(); window.removeEventListener('storage', this.onStorage);
    this.layer.remove(); this.controls.remove();
  }
}