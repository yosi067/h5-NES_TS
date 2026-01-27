/**
 * 除錯介面渲染器
 * 
 * 提供視覺化的除錯資訊顯示
 */

import { Debugger } from './debugger';

/**
 * 除錯面板配置
 */
export interface DebugPanelConfig {
  /** 是否顯示 CPU 資訊 */
  showCpu: boolean;
  /** 是否顯示 PPU 資訊 */
  showPpu: boolean;
  /** 是否顯示反組譯 */
  showDisassembly: boolean;
  /** 是否顯示記憶體 */
  showMemory: boolean;
  /** 是否顯示圖案表 */
  showPatternTables: boolean;
  /** 是否顯示命名表 */
  showNametables: boolean;
  /** 是否顯示調色盤 */
  showPalette: boolean;
  /** 是否顯示精靈 */
  showSprites: boolean;
}

/**
 * 預設配置
 */
export const DEFAULT_DEBUG_CONFIG: DebugPanelConfig = {
  showCpu: true,
  showPpu: true,
  showDisassembly: true,
  showMemory: true,
  showPatternTables: true,
  showNametables: false,
  showPalette: true,
  showSprites: false,
};

/**
 * 除錯介面渲染器類別
 */
export class DebugRenderer {
  private nesDebugger: Debugger;
  private container: HTMLElement | null = null;
  private config: DebugPanelConfig;

  // 各面板 canvas
  private patternCanvas0: HTMLCanvasElement | null = null;
  private patternCanvas1: HTMLCanvasElement | null = null;
  private paletteCanvas: HTMLCanvasElement | null = null;
  private _nametableCanvas: HTMLCanvasElement | null = null;

  constructor(nesDebugger: Debugger, config: Partial<DebugPanelConfig> = {}) {
    this.nesDebugger = nesDebugger;
    this.config = { ...DEFAULT_DEBUG_CONFIG, ...config };
  }

  /**
   * 初始化除錯介面
   */
  public init(containerId: string): void {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      document.body.appendChild(this.container);
    }

    this.container.innerHTML = '';
    this.container.className = 'nes-debugger';
    this.container.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 10px;
      padding: 10px;
      background: #1e1e1e;
      color: #d4d4d4;
    `;

    // 建立各面板
    if (this.config.showCpu) this.createCpuPanel();
    if (this.config.showPpu) this.createPpuPanel();
    if (this.config.showDisassembly) this.createDisassemblyPanel();
    if (this.config.showMemory) this.createMemoryPanel();
    if (this.config.showPatternTables) this.createPatternTablePanel();
    if (this.config.showPalette) this.createPalettePanel();
  }

  /**
   * 更新除錯介面
   */
  public update(): void {
    if (this.config.showCpu) this.updateCpuPanel();
    if (this.config.showPpu) this.updatePpuPanel();
    if (this.config.showDisassembly) this.updateDisassemblyPanel();
    if (this.config.showPatternTables) this.updatePatternTablePanel();
    if (this.config.showPalette) this.updatePalettePanel();
  }

  // ===== CPU 面板 =====

  private cpuPanel: HTMLElement | null = null;

  private createCpuPanel(): void {
    this.cpuPanel = this.createPanel('CPU 暫存器');
  }

  private updateCpuPanel(): void {
    if (!this.cpuPanel) return;

    const info = this.nesDebugger.getCpuInfo();
    const flagsStr = [
      info.flags.N ? 'N' : 'n',
      info.flags.V ? 'V' : 'v',
      info.flags.U ? 'U' : 'u',
      info.flags.B ? 'B' : 'b',
      info.flags.D ? 'D' : 'd',
      info.flags.I ? 'I' : 'i',
      info.flags.Z ? 'Z' : 'z',
      info.flags.C ? 'C' : 'c',
    ].join('');

    const content = this.cpuPanel.querySelector('.panel-content') as HTMLElement;
    content.innerHTML = `
      <div class="register-grid">
        <span class="reg-label">A:</span>  <span class="reg-value">$${info.registers.a.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">X:</span>  <span class="reg-value">$${info.registers.x.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">Y:</span>  <span class="reg-value">$${info.registers.y.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">SP:</span> <span class="reg-value">$${info.registers.sp.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">PC:</span> <span class="reg-value">$${info.registers.pc.toString(16).toUpperCase().padStart(4, '0')}</span>
        <span class="reg-label">FLAGS:</span> <span class="reg-value">${flagsStr}</span>
      </div>
      <div class="cycles">Cycles: ${info.totalCycles}</div>
    `;
  }

  // ===== PPU 面板 =====

  private ppuPanel: HTMLElement | null = null;

  private createPpuPanel(): void {
    this.ppuPanel = this.createPanel('PPU 狀態');
  }

  private updatePpuPanel(): void {
    if (!this.ppuPanel) return;

    const info = this.nesDebugger.getPpuInfo();
    
    const content = this.ppuPanel.querySelector('.panel-content') as HTMLElement;
    content.innerHTML = `
      <div class="register-grid">
        <span class="reg-label">Scanline:</span> <span class="reg-value">${info.scanline}</span>
        <span class="reg-label">Cycle:</span> <span class="reg-value">${info.cycle}</span>
        <span class="reg-label">CTRL:</span> <span class="reg-value">$${info.ctrl.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">MASK:</span> <span class="reg-value">$${info.mask.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">STATUS:</span> <span class="reg-value">$${info.status.toString(16).toUpperCase().padStart(2, '0')}</span>
        <span class="reg-label">VRAM:</span> <span class="reg-value">$${info.vramAddr.toString(16).toUpperCase().padStart(4, '0')}</span>
        <span class="reg-label">Fine X:</span> <span class="reg-value">${info.fineX}</span>
      </div>
    `;
  }

  // ===== 反組譯面板 =====

  private disasmPanel: HTMLElement | null = null;

  private createDisassemblyPanel(): void {
    this.disasmPanel = this.createPanel('反組譯');
    const content = this.disasmPanel.querySelector('.panel-content') as HTMLElement;
    content.style.cssText = 'font-family: monospace; white-space: pre; overflow-x: auto;';
  }

  private updateDisassemblyPanel(): void {
    if (!this.disasmPanel) return;

    const cpuInfo = this.nesDebugger.getCpuInfo();
    const startAddr = Math.max(0, cpuInfo.registers.pc - 10);
    const lines = this.nesDebugger.disassemble(startAddr, 20);
    
    const content = this.disasmPanel.querySelector('.panel-content') as HTMLElement;
    content.innerHTML = lines.map(line => {
      const addrStr = `$${line.address.toString(16).toUpperCase().padStart(4, '0')}`;
      const bytesStr = line.bytes.map(b => 
        b.toString(16).toUpperCase().padStart(2, '0')
      ).join(' ').padEnd(8, ' ');
      const marker = line.isCurrent ? '→' : ' ';
      const style = line.isCurrent ? 'background: #404040; color: #fff;' : '';
      return `<div style="${style}">${marker} ${addrStr}: ${bytesStr}  ${line.instruction}</div>`;
    }).join('');
  }

  // ===== 記憶體面板 =====

  private memoryPanel: HTMLElement | null = null;
  private memoryAddress: number = 0;

  private createMemoryPanel(): void {
    this.memoryPanel = this.createPanel('記憶體');
    const content = this.memoryPanel.querySelector('.panel-content') as HTMLElement;
    
    // 添加位址輸入
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '位址 (例: 0000)';
    input.style.cssText = 'width: 100px; margin-bottom: 5px; background: #333; border: 1px solid #555; color: #fff; padding: 2px 5px;';
    input.addEventListener('change', () => {
      this.memoryAddress = parseInt(input.value, 16) || 0;
      this.updateMemoryPanel();
    });
    
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin: 0; overflow-x: auto;';
    
    content.appendChild(input);
    content.appendChild(pre);
  }

  private updateMemoryPanel(): void {
    if (!this.memoryPanel) return;
    
    const pre = this.memoryPanel.querySelector('pre');
    if (pre) {
      pre.textContent = this.nesDebugger.formatMemory(this.memoryAddress, 256);
    }
  }

  // ===== 圖案表面板 =====

  private patternPanel: HTMLElement | null = null;

  private createPatternTablePanel(): void {
    this.patternPanel = this.createPanel('圖案表');
    const content = this.patternPanel.querySelector('.panel-content') as HTMLElement;
    
    this.patternCanvas0 = document.createElement('canvas');
    this.patternCanvas0.width = 128;
    this.patternCanvas0.height = 128;
    this.patternCanvas0.style.cssText = 'image-rendering: pixelated; width: 128px; height: 128px; margin-right: 10px;';
    
    this.patternCanvas1 = document.createElement('canvas');
    this.patternCanvas1.width = 128;
    this.patternCanvas1.height = 128;
    this.patternCanvas1.style.cssText = 'image-rendering: pixelated; width: 128px; height: 128px;';
    
    content.appendChild(this.patternCanvas0);
    content.appendChild(this.patternCanvas1);
  }

  private updatePatternTablePanel(): void {
    if (!this.patternCanvas0 || !this.patternCanvas1) return;
    
    this.renderPatternTable(this.patternCanvas0, 0);
    this.renderPatternTable(this.patternCanvas1, 1);
  }

  private renderPatternTable(canvas: HTMLCanvasElement, index: 0 | 1): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const data = this.nesDebugger.getPatternTable(index, 0);
    const imageData = ctx.createImageData(128, 128);
    
    for (let i = 0; i < 128 * 128; i++) {
      const pixel = data[i];
      imageData.data[i * 4 + 0] = (pixel >> 16) & 0xFF;
      imageData.data[i * 4 + 1] = (pixel >> 8) & 0xFF;
      imageData.data[i * 4 + 2] = pixel & 0xFF;
      imageData.data[i * 4 + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  // ===== 調色盤面板 =====

  private createPalettePanel(): void {
    const panel = this.createPanel('調色盤');
    const content = panel.querySelector('.panel-content') as HTMLElement;
    
    this.paletteCanvas = document.createElement('canvas');
    this.paletteCanvas.width = 256;
    this.paletteCanvas.height = 32;
    this.paletteCanvas.style.cssText = 'image-rendering: pixelated;';
    
    content.appendChild(this.paletteCanvas);
  }

  private updatePalettePanel(): void {
    if (!this.paletteCanvas) return;
    
    const ctx = this.paletteCanvas.getContext('2d');
    if (!ctx) return;
    
    const palette = this.nesDebugger.getPalette();
    const size = 16;
    
    for (let i = 0; i < 32; i++) {
      const x = (i % 16) * size;
      const y = Math.floor(i / 16) * size;
      const color = palette[i];
      
      ctx.fillStyle = `rgb(${(color >> 16) & 0xFF}, ${(color >> 8) & 0xFF}, ${color & 0xFF})`;
      ctx.fillRect(x, y, size, size);
    }
  }

  // ===== 輔助方法 =====

  private createPanel(title: string): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'debug-panel';
    panel.style.cssText = `
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 10px;
    `;
    
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = title;
    header.style.cssText = `
      font-weight: bold;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #3c3c3c;
      color: #569cd6;
    `;
    
    const content = document.createElement('div');
    content.className = 'panel-content';
    
    panel.appendChild(header);
    panel.appendChild(content);
    
    if (this.container) {
      this.container.appendChild(panel);
    }
    
    return panel;
  }

  /**
   * 銷毀除錯介面
   */
  public destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
