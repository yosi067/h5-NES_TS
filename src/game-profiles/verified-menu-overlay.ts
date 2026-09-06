import type { EmuWasm } from '../wasm/nes_wasm.js';
import { locateVerifiedCellMenus, validateCellMenus, type CellMenuCatalog } from './verified-cell-menus';

/** Display only; deliberately independent of CT2's script observer/editor. */
export class VerifiedMenuOverlay {
  private layer = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private toggle = document.createElement('button');
  private enabled = true;
  private lastCore: EmuWasm | null = null;
  private top = 8;
  constructor(private screen: HTMLCanvasElement, private catalog: CellMenuCatalog) {
    validateCellMenus(catalog);
    this.layer.className = 'nes-localization-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    // Match the NES canvas sampling: smooth CSS resampling blends transparent
    // mask edges with native glyphs underneath at fractional display scales.
    this.layer.style.cssText = 'position:absolute;pointer-events:none;z-index:3;image-rendering:pixelated;max-width:none;border:0;border-radius:0';
    if (getComputedStyle(screen.parentElement!).position === 'static') screen.parentElement!.style.position = 'relative';
    screen.parentElement!.append(this.layer);
    this.context = this.layer.getContext('2d')!;
    this.toggle.type = 'button';
    this.toggle.textContent = '繁中選單：開（部分中文化）';
    this.toggle.setAttribute('aria-pressed', 'true');
    this.toggle.addEventListener('click', () => {
      this.enabled = !this.enabled;
      this.toggle.textContent = `繁中選單：${this.enabled ? '開' : '關'}（部分中文化）`;
      this.toggle.setAttribute('aria-pressed', String(this.enabled));
      if (this.lastCore) this.render(this.lastCore, this.top);
    });
    (screen.closest('.screen-bezel') ?? screen).after(this.toggle);
    this.observer = new ResizeObserver(() => {
      this.resize();
      if (this.lastCore) this.render(this.lastCore, this.top);
    });
    this.observer.observe(screen);
    this.resize();
  }
  private resize(): void {
    const rect = this.screen.getBoundingClientRect(), parent = this.screen.parentElement!;
    const pr = parent.getBoundingClientRect(), style = getComputedStyle(this.screen);
    const left = parseFloat(style.borderLeftWidth) || 0, top = parseFloat(style.borderTopWidth) || 0;
    let width = rect.width - left - (parseFloat(style.borderRightWidth) || 0);
    let height = rect.height - top - (parseFloat(style.borderBottomWidth) || 0);
    let ix = 0, iy = 0;
    if (style.objectFit === 'contain') {
      const fit = Math.min(width / this.screen.width, height / this.screen.height);
      ix = (width - this.screen.width * fit) / 2; iy = (height - this.screen.height * fit) / 2;
      width = this.screen.width * fit; height = this.screen.height * fit;
    }
    Object.assign(this.layer.style, { left: `${rect.left + left - pr.left - parent.clientLeft + ix}px`,
      top: `${rect.top + top - pr.top - parent.clientTop + iy}px`, width: `${width}px`, height: `${height}px` });
    // Integer backing scale keeps every verified source-cell boundary opaque,
    // including scrolled rows. Do not pad masks into unverified neighbours.
    // Text still receives Canvas font antialiasing inside these opaque masks.
    const scale = Math.min(4, Math.max(2, Math.ceil((devicePixelRatio || 1) * width / 256)));
    this.layer.width = 256 * scale; this.layer.height = this.screen.height * scale;
  }
  render(core: EmuWasm, overscanTop: number): void {
    this.lastCore = core; this.top = overscanTop;
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.layer.width, this.layer.height);
    this.layer.dataset.text = '';
    if (!this.enabled) return;
    const metadata = core.getTextFrameMetadata();
    // WASM getters allocate. Take the live memory view only after both copies
    // so a memory growth cannot detach the provenance view mid-render.
    const source = core.getZombieMenuSource();
    const ptr = core.getTextProvenancePtr();
    if (!ptr) return;
    const provenance = new Uint16Array((core.getWasmMemory() as WebAssembly.Memory).buffer, ptr, 256 * 240);
    const replacements = locateVerifiedCellMenus(this.catalog, metadata, provenance, source);
    const sx = this.layer.width / 256, sy = this.layer.height / this.screen.height;
    ctx.setTransform(sx, 0, 0, sy, 0, -overscanTop * sy);
    const color = (v: number) => `#${v.toString(16).padStart(6, '0')}`;
    const rendered: string[] = [];
    for (const { entry, x, y, background, foreground, clips } of replacements) {
      const width = entry.width * 8, height = entry.height * 8;
      if (y < overscanTop || y + height > overscanTop + this.screen.height) continue;
      ctx.font = `${height === 16 ? 12 : 8}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
      if (ctx.measureText(entry.translation).width > width) continue; // never squash or spill into values
      ctx.save(); ctx.beginPath();
      if (clips) for (const box of clips) ctx.rect(box.x, box.y, box.width, box.height);
      else ctx.rect(x, y, width, height);
      ctx.clip();
      ctx.fillStyle = color(background); ctx.fillRect(x, y, width, height);
      ctx.fillStyle = color(foreground); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(entry.translation, x, y + height / 2); ctx.restore();
      rendered.push(entry.translation);
    }
    this.layer.dataset.text = rendered.join('\n');
  }
  dispose(): void {
    this.observer.disconnect(); this.layer.remove(); this.toggle.remove(); this.lastCore = null;
  }
}