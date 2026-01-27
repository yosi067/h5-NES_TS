/**
 * Mapper 基底類別與工廠函數
 * 
 * Mapper 負責處理卡帶的記憶體映射，不同的 Mapper 支援不同的遊戲
 * 常見的 Mapper:
 * - Mapper 0 (NROM): 無映射，最簡單的類型
 * - Mapper 1 (MMC1): 支援 bank 切換
 * - Mapper 2 (UxROM): PRG ROM 切換
 * - Mapper 3 (CNROM): CHR ROM 切換
 * - Mapper 4 (MMC3): 最常用的 mapper 之一
 */

import { MirrorMode } from '../core/cartridge';

/**
 * Mapper 寫入結果
 */
export interface MapperWriteResult {
  /** 是否觸發 IRQ */
  irq?: boolean;
  /** 新的鏡像模式 */
  mirrorMode?: MirrorMode;
}

/**
 * Mapper 基底介面
 */
export interface Mapper {
  /** CPU 讀取映射 */
  cpuMapRead(address: number): number | null;
  
  /** CPU 寫入映射 */
  cpuMapWrite(address: number, data: number): MapperWriteResult | null;
  
  /** PPU 讀取映射 */
  ppuMapRead(address: number): number | null;
  
  /** PPU 寫入映射 */
  ppuMapWrite(address: number): number | null;
  
  /** 重置 */
  reset?(): void;
  
  /** 掃描線計數 (用於 IRQ) */
  scanline?(): void;
}

/**
 * Mapper 0 (NROM)
 * 
 * 最簡單的 Mapper，無 bank 切換
 * PRG ROM: 16KB 或 32KB
 * CHR ROM: 8KB
 */
export class Mapper0 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      // 如果只有 16KB PRG ROM，則 $C000-$FFFF 鏡像 $8000-$BFFF
      const mask = this.prgBanks > 1 ? 0x7FFF : 0x3FFF;
      return address & mask;
    }
    return null;
  }

  cpuMapWrite(_address: number, _data: number): MapperWriteResult | null {
    // NROM 不支援寫入 PRG ROM
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address;
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      // CHR RAM
      return address;
    }
    return null;
  }
}

/**
 * Mapper 1 (MMC1)
 * 
 * 支援 PRG ROM bank 切換和 CHR ROM bank 切換
 * 使用串列寫入來設定暫存器
 */
export class Mapper1 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;

  // 內部暫存器
  private shiftRegister: number = 0x10;
  private controlRegister: number = 0x0C;
  private chrBank0: number = 0;
  private chrBank1: number = 0;
  private prgBank: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
    this.reset();
  }

  reset(): void {
    this.shiftRegister = 0x10;
    this.controlRegister = 0x0C;
    this.chrBank0 = 0;
    this.chrBank1 = 0;
    this.prgBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const prgMode = (this.controlRegister >> 2) & 0x03;

      if (prgMode <= 1) {
        // 32KB 模式
        const bank = (this.prgBank & 0x0E) * 16384;
        return bank + (address & 0x7FFF);
      } else if (prgMode === 2) {
        // 固定第一個 bank 在 $8000
        if (address < 0xC000) {
          return address & 0x3FFF;
        } else {
          return this.prgBank * 16384 + (address & 0x3FFF);
        }
      } else {
        // 固定最後一個 bank 在 $C000
        if (address < 0xC000) {
          return this.prgBank * 16384 + (address & 0x3FFF);
        } else {
          return (this.prgBanks - 1) * 16384 + (address & 0x3FFF);
        }
      }
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      if (data & 0x80) {
        // 重置移位暫存器
        this.shiftRegister = 0x10;
        this.controlRegister |= 0x0C;
        return null;
      }

      const complete = this.shiftRegister & 0x01;
      this.shiftRegister = (this.shiftRegister >> 1) | ((data & 0x01) << 4);

      if (complete) {
        const targetRegister = (address >> 13) & 0x03;
        const value = this.shiftRegister;

        switch (targetRegister) {
          case 0: // 控制暫存器
            this.controlRegister = value;
            break;
          case 1: // CHR bank 0
            this.chrBank0 = value;
            break;
          case 2: // CHR bank 1
            this.chrBank1 = value;
            break;
          case 3: // PRG bank
            this.prgBank = value & 0x0F;
            break;
        }

        this.shiftRegister = 0x10;

        // 回傳鏡像模式
        const mirrorBits = this.controlRegister & 0x03;
        let mirrorMode: MirrorMode;
        switch (mirrorBits) {
          case 0: mirrorMode = MirrorMode.SingleScreenLow; break;
          case 1: mirrorMode = MirrorMode.SingleScreenHigh; break;
          case 2: mirrorMode = MirrorMode.Vertical; break;
          default: mirrorMode = MirrorMode.Horizontal; break;
        }

        return { mirrorMode };
      }
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      const chrMode = (this.controlRegister >> 4) & 0x01;

      if (chrMode === 0) {
        // 8KB 模式
        const bank = (this.chrBank0 & 0x1E) * 4096;
        return bank + address;
      } else {
        // 4KB 模式
        if (address < 0x1000) {
          return this.chrBank0 * 4096 + address;
        } else {
          return this.chrBank1 * 4096 + (address & 0x0FFF);
        }
      }
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      return address;
    }
    return null;
  }
}

/**
 * Mapper 2 (UxROM)
 * 
 * PRG ROM bank 切換，最後一個 bank 固定在 $C000
 */
export class Mapper2 implements Mapper {
  private prgBanks: number;
  private _chrBanks: number;
  private selectedBank: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this._chrBanks = chrBanks;
  }

  reset(): void {
    this.selectedBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000 && address < 0xC000) {
      return this.selectedBank * 16384 + (address & 0x3FFF);
    }
    if (address >= 0xC000) {
      return (this.prgBanks - 1) * 16384 + (address & 0x3FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.selectedBank = data & 0x0F;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address;
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000) {
      return address; // CHR RAM
    }
    return null;
  }
}

/**
 * Mapper 3 (CNROM)
 * 
 * CHR ROM bank 切換
 */
export class Mapper3 implements Mapper {
  private prgBanks: number;
  private _chrBanks: number;
  private selectedChrBank: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this._chrBanks = chrBanks;
  }

  reset(): void {
    this.selectedChrBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const mask = this.prgBanks > 1 ? 0x7FFF : 0x3FFF;
      return address & mask;
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.selectedChrBank = data & 0x03;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return this.selectedChrBank * 8192 + address;
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }
}

/**
 * Mapper 4 (MMC3)
 * 
 * 最常見的 Mapper 之一，用於超級瑪利歐兄弟 3 等遊戲
 * 特點：
 * - 可切換的 PRG ROM banks (8KB 單位)
 * - 可切換的 CHR ROM banks (1KB/2KB 單位)
 * - 掃描線計數器 (用於 IRQ)
 * - 可控的鏡像模式
 */
export class Mapper4 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;

  // Bank 暫存器
  private registers: number[] = new Array(8).fill(0);
  
  // 控制
  private bankSelect: number = 0;
  private prgRomBankMode: boolean = false;
  private chrA12Inversion: boolean = false;

  // 鏡像
  private mirrorMode: MirrorMode = MirrorMode.Vertical;

  // IRQ
  private irqCounter: number = 0;
  private irqLatch: number = 0;
  private irqEnabled: boolean = false;
  private irqReload: boolean = false;
  private irqPending: boolean = false;

  // PRG RAM
  private _prgRamEnabled: boolean = true;
  private _prgRamWriteProtect: boolean = false;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
    this.reset();
  }

  reset(): void {
    this.registers = new Array(8).fill(0);
    this.bankSelect = 0;
    this.prgRomBankMode = false;
    this.chrA12Inversion = false;
    this.mirrorMode = MirrorMode.Vertical;
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqEnabled = false;
    this.irqReload = false;
    this.irqPending = false;
    this._prgRamEnabled = true;
    this._prgRamWriteProtect = false;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const bank = this.getPrgBank(address);
      return bank * 8192 + (address & 0x1FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      const even = (address & 1) === 0;
      const region = (address >> 13) & 0x03;

      switch (region) {
        case 0: // $8000-$9FFF
          if (even) {
            // Bank Select
            this.bankSelect = data & 0x07;
            this.prgRomBankMode = (data & 0x40) !== 0;
            this.chrA12Inversion = (data & 0x80) !== 0;
          } else {
            // Bank Data
            this.registers[this.bankSelect] = data;
          }
          break;

        case 1: // $A000-$BFFF
          if (even) {
            // Mirroring
            this.mirrorMode = (data & 1) ? MirrorMode.Horizontal : MirrorMode.Vertical;
            return { mirrorMode: this.mirrorMode };
          } else {
            // PRG RAM protect
            this._prgRamWriteProtect = (data & 0x40) !== 0;
            this._prgRamEnabled = (data & 0x80) !== 0;
          }
          break;

        case 2: // $C000-$DFFF
          if (even) {
            // IRQ Latch
            this.irqLatch = data;
          } else {
            // IRQ Reload
            this.irqReload = true;
          }
          break;

        case 3: // $E000-$FFFF
          if (even) {
            // IRQ Disable
            this.irqEnabled = false;
            this.irqPending = false;
          } else {
            // IRQ Enable
            this.irqEnabled = true;
          }
          break;
      }
    }
    return null;
  }

  /**
   * 取得 PRG bank
   */
  private getPrgBank(address: number): number {
    const lastBank = this.prgBanks * 2 - 1;
    const secondLastBank = this.prgBanks * 2 - 2;

    if (address < 0xA000) {
      // $8000-$9FFF
      if (this.prgRomBankMode) {
        return secondLastBank;
      } else {
        return this.registers[6] & 0x3F;
      }
    } else if (address < 0xC000) {
      // $A000-$BFFF
      return this.registers[7] & 0x3F;
    } else if (address < 0xE000) {
      // $C000-$DFFF
      if (this.prgRomBankMode) {
        return this.registers[6] & 0x3F;
      } else {
        return secondLastBank;
      }
    } else {
      // $E000-$FFFF
      return lastBank;
    }
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return this.getChrBank(address) * 1024 + (address & 0x03FF);
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      return address; // CHR RAM
    }
    return null;
  }

  /**
   * 取得 CHR bank
   */
  private getChrBank(address: number): number {
    const region = address >> 10; // 0-7 (每個區域 1KB)
    
    if (this.chrA12Inversion) {
      // A12 反轉: R0-R1 在 $1000, R2-R5 在 $0000
      switch (region) {
        case 0: return this.registers[2];
        case 1: return this.registers[3];
        case 2: return this.registers[4];
        case 3: return this.registers[5];
        case 4: return this.registers[0] & 0xFE;
        case 5: return (this.registers[0] & 0xFE) | 1;
        case 6: return this.registers[1] & 0xFE;
        case 7: return (this.registers[1] & 0xFE) | 1;
      }
    } else {
      // 正常: R0-R1 在 $0000, R2-R5 在 $1000
      switch (region) {
        case 0: return this.registers[0] & 0xFE;
        case 1: return (this.registers[0] & 0xFE) | 1;
        case 2: return this.registers[1] & 0xFE;
        case 3: return (this.registers[1] & 0xFE) | 1;
        case 4: return this.registers[2];
        case 5: return this.registers[3];
        case 6: return this.registers[4];
        case 7: return this.registers[5];
      }
    }
    return 0;
  }

  /**
   * 掃描線計數 (由 PPU 在 A12 上升沿呼叫)
   */
  scanline(): void {
    if (this.irqCounter === 0 || this.irqReload) {
      this.irqCounter = this.irqLatch;
      this.irqReload = false;
    } else {
      this.irqCounter--;
    }

    if (this.irqCounter === 0 && this.irqEnabled) {
      this.irqPending = true;
    }
  }

  /**
   * 檢查是否有待處理的 IRQ
   */
  getIrqPending(): boolean {
    const pending = this.irqPending;
    this.irqPending = false;
    return pending;
  }
}

/**
 * 建立 Mapper 實例
 */
export function createMapper(mapperNumber: number, prgBanks: number, chrBanks: number): Mapper | null {
  switch (mapperNumber) {
    case 0:
      return new Mapper0(prgBanks, chrBanks);
    case 1:
      return new Mapper1(prgBanks, chrBanks);
    case 2:
      return new Mapper2(prgBanks, chrBanks);
    case 3:
      return new Mapper3(prgBanks, chrBanks);
    case 4:
      return new Mapper4(prgBanks, chrBanks);
    default:
      console.warn(`未實作的 Mapper: ${mapperNumber}`);
      return null;
  }
}
