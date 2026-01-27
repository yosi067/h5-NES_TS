/**
 * NES 除錯工具集
 * 
 * 提供視覺化的 CPU/PPU 除錯功能
 */

import type { Nes } from '../core/nes';

/**
 * CPU 除錯資訊
 */
export interface CpuDebugInfo {
  /** 暫存器 */
  registers: {
    a: number;
    x: number;
    y: number;
    sp: number;
    pc: number;
  };
  /** 狀態旗標 */
  flags: {
    N: boolean;
    V: boolean;
    U: boolean;
    B: boolean;
    D: boolean;
    I: boolean;
    Z: boolean;
    C: boolean;
  };
  /** 總週期數 */
  totalCycles: number;
}

/**
 * PPU 除錯資訊
 */
export interface PpuDebugInfo {
  /** 當前掃描線 */
  scanline: number;
  /** 當前週期 */
  cycle: number;
  /** 控制暫存器 */
  ctrl: number;
  /** 遮罩暫存器 */
  mask: number;
  /** 狀態暫存器 */
  status: number;
  /** VRAM 位址 */
  vramAddr: number;
  /** 精細 X 捲動 */
  fineX: number;
}

/**
 * 反組譯結果
 */
export interface DisassemblyLine {
  /** 記憶體位址 */
  address: number;
  /** 原始位元組 */
  bytes: number[];
  /** 組合語言指令 */
  instruction: string;
  /** 是否為當前執行位置 */
  isCurrent: boolean;
}

/**
 * 除錯器類別
 */
export class Debugger {
  private nes: Nes;

  /** 斷點列表 */
  private breakpoints: Set<number> = new Set();

  /** 是否暫停 */
  private paused: boolean = false;

  /** 步進回調 */
  private onStep: (() => void) | null = null;

  /** 斷點命中回調 */
  private onBreakpoint: ((address: number) => void) | null = null;

  constructor(nes: Nes) {
    this.nes = nes;
  }

  // ===== CPU 除錯 =====

  /**
   * 取得 CPU 除錯資訊
   */
  public getCpuInfo(): CpuDebugInfo {
    const cpu = this.nes.cpu;
    return {
      registers: {
        a: cpu.a,
        x: cpu.x,
        y: cpu.y,
        sp: cpu.sp,
        pc: cpu.pc,
      },
      flags: {
        N: (cpu.status & 0x80) !== 0,
        V: (cpu.status & 0x40) !== 0,
        U: (cpu.status & 0x20) !== 0,
        B: (cpu.status & 0x10) !== 0,
        D: (cpu.status & 0x08) !== 0,
        I: (cpu.status & 0x04) !== 0,
        Z: (cpu.status & 0x02) !== 0,
        C: (cpu.status & 0x01) !== 0,
      },
      totalCycles: cpu.totalCycles,
    };
  }

  /**
   * 反組譯記憶體區塊
   */
  public disassemble(startAddress: number, count: number): DisassemblyLine[] {
    const lines: DisassemblyLine[] = [];
    let address = startAddress;
    const currentPc = this.nes.cpu.pc;

    for (let i = 0; i < count && address <= 0xFFFF; i++) {
      const result = this.nes.cpu.disassemble(address);
      const bytes: number[] = [];
      
      for (let j = 0; j < result.bytes; j++) {
        bytes.push(this.nes.bus.cpuRead((address + j) & 0xFFFF));
      }

      lines.push({
        address,
        bytes,
        instruction: result.instruction,
        isCurrent: address === currentPc,
      });

      address = (address + result.bytes) & 0xFFFF;
    }

    return lines;
  }

  /**
   * 格式化反組譯結果為字串
   */
  public formatDisassembly(lines: DisassemblyLine[]): string {
    return lines.map(line => {
      const addrStr = line.address.toString(16).toUpperCase().padStart(4, '0');
      const bytesStr = line.bytes.map(b => 
        b.toString(16).toUpperCase().padStart(2, '0')
      ).join(' ').padEnd(8, ' ');
      const marker = line.isCurrent ? '>' : ' ';
      return `${marker} $${addrStr}: ${bytesStr}  ${line.instruction}`;
    }).join('\n');
  }

  // ===== PPU 除錯 =====

  /**
   * 取得 PPU 除錯資訊
   */
  public getPpuInfo(): PpuDebugInfo {
    const ppu = this.nes.ppu as any; // 存取私有屬性
    return {
      scanline: ppu.scanline,
      cycle: ppu.cycle,
      ctrl: ppu.ctrl,
      mask: ppu.mask,
      status: ppu.status,
      vramAddr: ppu.vramAddr,
      fineX: ppu.fineX,
    };
  }

  /**
   * 取得圖案表圖像資料
   */
  public getPatternTable(index: 0 | 1, palette: number): Uint32Array {
    return this.nes.ppu.getPatternTable(index, palette);
  }

  /**
   * 取得命名表圖像資料
   */
  public getNametable(index: number): Uint32Array {
    const ppu = this.nes.ppu as any;
    const table = new Uint32Array(256 * 240);
    
    const baseAddr = 0x2000 + (index * 0x400);
    
    for (let row = 0; row < 30; row++) {
      for (let col = 0; col < 32; col++) {
        // 讀取圖塊 ID
        const tileId = ppu.ppuRead(baseAddr + row * 32 + col);
        
        // 讀取屬性
        const attrAddr = baseAddr + 0x3C0 + ((row >> 2) * 8) + (col >> 2);
        const attrByte = ppu.ppuRead(attrAddr);
        const attrShift = ((row & 2) << 1) | (col & 2);
        const palette = (attrByte >> attrShift) & 0x03;

        // 渲染 8x8 圖塊
        const patternBase = ((ppu.ctrl & 0x10) ? 0x1000 : 0) + tileId * 16;
        
        for (let tileRow = 0; tileRow < 8; tileRow++) {
          let tileLo = ppu.ppuRead(patternBase + tileRow);
          let tileHi = ppu.ppuRead(patternBase + tileRow + 8);

          for (let tileCol = 0; tileCol < 8; tileCol++) {
            const pixel = ((tileLo & 0x80) >> 7) | ((tileHi & 0x80) >> 6);
            tileLo <<= 1;
            tileHi <<= 1;

            const x = col * 8 + tileCol;
            const y = row * 8 + tileRow;
            
            if (y < 240) {
              const color = ppu.getPaletteColor(palette, pixel);
              table[y * 256 + x] = 0xFF000000 | color;
            }
          }
        }
      }
    }
    
    return table;
  }

  /**
   * 取得調色盤資料
   */
  public getPalette(): Uint32Array {
    const ppu = this.nes.ppu as any;
    const palette = new Uint32Array(32);
    
    for (let i = 0; i < 32; i++) {
      const color = ppu.getPaletteColor(Math.floor(i / 4), i % 4);
      palette[i] = 0xFF000000 | color;
    }
    
    return palette;
  }

  /**
   * 取得 OAM (精靈) 資料
   */
  public getOamData(): { 
    y: number; 
    tile: number; 
    attr: number; 
    x: number; 
  }[] {
    const ppu = this.nes.ppu as any;
    const sprites: { y: number; tile: number; attr: number; x: number; }[] = [];
    
    for (let i = 0; i < 64; i++) {
      sprites.push({
        y: ppu.oam[i * 4],
        tile: ppu.oam[i * 4 + 1],
        attr: ppu.oam[i * 4 + 2],
        x: ppu.oam[i * 4 + 3],
      });
    }
    
    return sprites;
  }

  // ===== 記憶體檢視 =====

  /**
   * 讀取 CPU 記憶體區塊
   */
  public readMemory(address: number, length: number): Uint8Array {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = this.nes.bus.cpuRead((address + i) & 0xFFFF);
    }
    return data;
  }

  /**
   * 格式化記憶體為十六進位顯示
   */
  public formatMemory(address: number, length: number, bytesPerLine: number = 16): string {
    const data = this.readMemory(address, length);
    const lines: string[] = [];

    for (let i = 0; i < length; i += bytesPerLine) {
      const addr = ((address + i) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
      const hex = Array.from(data.slice(i, i + bytesPerLine))
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      const ascii = Array.from(data.slice(i, i + bytesPerLine))
        .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.')
        .join('');
      
      lines.push(`$${addr}: ${hex.padEnd(bytesPerLine * 3 - 1)}  ${ascii}`);
    }

    return lines.join('\n');
  }

  /**
   * 寫入 CPU 記憶體
   */
  public writeMemory(address: number, data: number[]): void {
    for (let i = 0; i < data.length; i++) {
      this.nes.bus.cpuWrite((address + i) & 0xFFFF, data[i]);
    }
  }

  // ===== 斷點控制 =====

  /**
   * 新增斷點
   */
  public addBreakpoint(address: number): void {
    this.breakpoints.add(address & 0xFFFF);
  }

  /**
   * 移除斷點
   */
  public removeBreakpoint(address: number): void {
    this.breakpoints.delete(address & 0xFFFF);
  }

  /**
   * 清除所有斷點
   */
  public clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  /**
   * 取得所有斷點
   */
  public getBreakpoints(): number[] {
    return Array.from(this.breakpoints);
  }

  /**
   * 檢查是否命中斷點
   */
  public checkBreakpoint(): boolean {
    return this.breakpoints.has(this.nes.cpu.pc);
  }

  // ===== 執行控制 =====

  /**
   * 暫停執行
   */
  public pause(): void {
    this.paused = true;
  }

  /**
   * 繼續執行
   */
  public resume(): void {
    this.paused = false;
  }

  /**
   * 是否暫停中
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * 單步執行 (一條指令)
   */
  public stepInstruction(): void {
    this.nes.step();
    if (this.onStep) {
      this.onStep();
    }
  }

  /**
   * 單步執行 (一個週期)
   */
  public stepCycle(): void {
    this.nes.clock();
    if (this.onStep) {
      this.onStep();
    }
  }

  /**
   * 執行到下一個斷點或幀結束
   */
  public runToBreakpoint(): boolean {
    this.paused = false;
    const maxCycles = 1000000; // 防止無限迴圈
    let cycles = 0;

    while (!this.paused && cycles < maxCycles) {
      this.nes.step();
      cycles++;

      if (this.checkBreakpoint()) {
        this.paused = true;
        if (this.onBreakpoint) {
          this.onBreakpoint(this.nes.cpu.pc);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * 設定步進回調
   */
  public setOnStep(callback: () => void): void {
    this.onStep = callback;
  }

  /**
   * 設定斷點命中回調
   */
  public setOnBreakpoint(callback: (address: number) => void): void {
    this.onBreakpoint = callback;
  }
}
