/**
 * NES 主控台 - 整合所有硬體元件
 */

import { Cpu } from './cpu';
import { Ppu } from './ppu';
import { Apu } from './apu';
import { Bus } from './bus';
import { Cartridge } from './cartridge';
import { Controller } from './controller';

/**
 * 存檔資料結構
 */
export interface SaveState {
  version: number;
  timestamp: number;
  cpu: object;
  ppu: object;
  apu: object;
  bus: object;
  cartridge: object;
}

/**
 * NES 主控台類別
 */
export class Nes {
  /** CPU */
  public readonly cpu: Cpu;
  
  /** PPU */
  public readonly ppu: Ppu;
  
  /** APU */
  public readonly apu: Apu;
  
  /** 記憶體匯流排 */
  public readonly bus: Bus;
  
  /** 卡帶 */
  public readonly cartridge: Cartridge;
  
  /** 控制器 1 */
  public readonly controller1: Controller;
  
  /** 控制器 2 */
  public readonly controller2: Controller;

  /** 系統時鐘計數器 */
  private systemClockCounter: number = 0;
  
  /** 存檔版本 */
  private static readonly SAVE_STATE_VERSION = 1;

  constructor() {
    this.bus = new Bus();
    this.cpu = new Cpu(this.bus);
    this.ppu = new Ppu();
    this.apu = new Apu();
    this.cartridge = new Cartridge();
    this.controller1 = new Controller();
    this.controller2 = new Controller();

    // 連接元件
    this.bus.connectPpu(this.ppu);
    this.bus.connectApu(this.apu);
    this.bus.connectCartridge(this.cartridge);
    this.bus.connectController(1, this.controller1);
    this.bus.connectController(2, this.controller2);
    this.ppu.connectCartridge(this.cartridge);
    
    // 設定 APU 的記憶體讀取器 (用於 DMC)
    this.apu.setMemoryReader((addr) => this.bus.cpuRead(addr));
    
    // 設定 APU IRQ 回調
    this.apu.setIrqCallback(() => this.cpu.irq());
  }

  /**
   * 載入 ROM
   */
  public loadRom(data: ArrayBuffer): boolean {
    const success = this.cartridge.loadRom(data);
    if (success) {
      this.reset();
    }
    return success;
  }

  /**
   * 重置系統
   */
  public reset(): void {
    this.cartridge.reset();
    this.cpu.reset();
    this.ppu.reset();
    this.apu.reset();
    this.systemClockCounter = 0;
  }

  /**
   * 執行一個主時鐘週期
   * 
   * NES 的時序關係：
   * - PPU 時鐘 = 主時鐘
   * - CPU 時鐘 = 主時鐘 / 3
   */
  public clock(): void {
    // PPU 每個主時鐘都執行
    this.ppu.clock();

    // CPU 每 3 個主時鐘執行一次
    if (this.systemClockCounter % 3 === 0) {
      // 檢查是否正在 DMA 傳輸
      if (this.bus.isDmaTransferring()) {
        this.bus.doCycle(this.systemClockCounter % 2 === 1);
      } else {
        this.cpu.clock();
      }
      
      // APU 每個 CPU 週期執行
      this.apu.clock();
      
      // Mapper CPU 週期計時 (用於 Bandai FCG 等 cycle-based IRQ)
      this.cartridge.cpuClock();
    }

    // 檢查 NMI
    if (this.ppu.checkNmi()) {
      this.cpu.nmi();
    }
    
    // 檢查 Mapper scanline IRQ (用於 MMC3 等 scanline-based IRQ)
    if (this.ppu.checkScanlineIrq()) {
      this.cartridge.scanline();
    }
    
    // 檢查 Mapper IRQ (統一處理 cycle-based 和 scanline-based)
    if (this.cartridge.checkIrq()) {
      this.cpu.irq();
    }

    this.systemClockCounter++;
  }

  /**
   * 執行一幀
   */
  public frame(): void {
    // 執行直到幀完成
    this.ppu.frameComplete = false;
    while (!this.ppu.frameComplete) {
      this.clock();
    }
  }

  /**
   * 執行一條 CPU 指令
   */
  public step(): void {
    // 執行直到 CPU 完成一條指令
    do {
      this.clock();
    } while (this.cpu['cycles'] > 0);
  }

  /**
   * 取得幀緩衝區
   */
  public getFrameBuffer(): Uint32Array {
    return this.ppu.frameBuffer;
  }

  /**
   * 取得系統狀態 (用於除錯)
   */
  public getState(): object {
    return {
      cpu: {
        pc: this.cpu.pc,
        a: this.cpu.a,
        x: this.cpu.x,
        y: this.cpu.y,
        sp: this.cpu.sp,
        status: this.cpu.status,
        totalCycles: this.cpu.totalCycles,
      },
      systemClockCounter: this.systemClockCounter,
    };
  }

  // ===== 存檔功能 =====

  /**
   * 建立存檔
   */
  public saveState(): SaveState {
    return {
      version: Nes.SAVE_STATE_VERSION,
      timestamp: Date.now(),
      cpu: this.cpu.saveState(),
      ppu: this.ppu.saveState(),
      apu: this.apu.saveState(),
      bus: this.bus.saveState(),
      cartridge: this.cartridge.saveState(),
    };
  }

  /**
   * 載入存檔
   */
  public loadState(state: SaveState): boolean {
    if (state.version !== Nes.SAVE_STATE_VERSION) {
      console.error(`存檔版本不符: ${state.version} !== ${Nes.SAVE_STATE_VERSION}`);
      return false;
    }

    try {
      this.cpu.loadState(state.cpu);
      this.ppu.loadState(state.ppu);
      this.apu.loadState(state.apu);
      this.bus.loadState(state.bus);
      this.cartridge.loadState(state.cartridge);
      return true;
    } catch (e) {
      console.error('載入存檔失敗:', e);
      return false;
    }
  }

  /**
   * 匯出存檔為 JSON 字串
   */
  public exportSaveState(): string {
    const state = this.saveState();
    return JSON.stringify(state);
  }

  /**
   * 從 JSON 字串匯入存檔
   */
  public importSaveState(json: string): boolean {
    try {
      const state = JSON.parse(json) as SaveState;
      return this.loadState(state);
    } catch (e) {
      console.error('解析存檔失敗:', e);
      return false;
    }
  }

  /**
   * 從 APU 讀取音頻取樣到輸出緩衝區
   */
  public readAudioSamples(outputBuffer: Float32Array): number {
    return this.apu.readSamples(outputBuffer);
  }

  /**
   * 取得可用的音頻取樣數
   */
  public getAvailableAudioSamples(): number {
    return this.apu.getAvailableSamples();
  }

  /**
   * 設定音頻取樣率
   */
  public setAudioSampleRate(rate: number): void {
    this.apu.setSampleRate(rate);
  }
}
