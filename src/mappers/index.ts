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
  
  /** 掃描線計數 (用於 MMC3 等 scanline-based IRQ) */
  scanline?(): void;
  
  /** CPU 週期計數 (用於 Bandai FCG 等 cycle-based IRQ) */
  cpuClock?(): void;
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
      // 以 4KB 為單位的總 bank 數
      const totalChrBanks = Math.max(1, this.chrBanks * 2);

      if (chrMode === 0) {
        // 8KB 模式 - 忽略最低位
        const bank = (this.chrBank0 & 0x1E) % totalChrBanks;
        return bank * 4096 + address;
      } else {
        // 4KB 模式
        if (address < 0x1000) {
          const bank = this.chrBank0 % totalChrBanks;
          return bank * 4096 + address;
        } else {
          const bank = this.chrBank1 % totalChrBanks;
          return bank * 4096 + (address & 0x0FFF);
        }
      }
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
 * Mapper 7 (AxROM)
 * 
 * PRG ROM: 32KB 切換
 * CHR: RAM
 * 鏡像: 單屏
 */
export class Mapper7 implements Mapper {
  private prgBanks: number;
  private selectedBank: number = 0;
  private singleScreen: number = 0; // 0 = 低頁, 1 = 高頁
  private mirrorModeValue: MirrorMode = MirrorMode.SingleScreenLow;

  constructor(prgBanks: number, _chrBanks: number) {
    this.prgBanks = prgBanks;
  }

  reset(): void {
    this.selectedBank = 0;
    this.singleScreen = 0;
    this.mirrorModeValue = MirrorMode.SingleScreenLow;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      return this.selectedBank * 32768 + (address & 0x7FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.selectedBank = data & 0x07;
      this.singleScreen = (data >> 4) & 0x01;
      this.mirrorModeValue = this.singleScreen ? MirrorMode.SingleScreenHigh : MirrorMode.SingleScreenLow;
      return { mirrorMode: this.mirrorModeValue };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address; // CHR RAM
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
 * Mapper 11 (Color Dreams)
 * 
 * 簡單的 PRG/CHR ROM 切換
 */
export class Mapper11 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private chrBank: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.chrBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      return (this.prgBank % this.prgBanks) * 32768 + (address & 0x7FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.prgBank = data & 0x03;
      this.chrBank = (data >> 4) & 0x0F;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return (this.chrBank % Math.max(1, this.chrBanks)) * 8192 + address;
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }
}

/**
 * Mapper 16 (Bandai FCG)
 * 
 * 用於龍珠系列遊戲
 * 支援 PRG/CHR bank 切換和 IRQ
 */
export class Mapper16 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  
  // Bank 暫存器
  private chrBankRegs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgBank: number = 0;
  
  // IRQ 相關
  private irqCounter: number = 0;
  private irqLatch: number = 0;
  private irqEnabled: boolean = false;
  private irqPending: boolean = false;
  
  // 鏡像
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.chrBankRegs.fill(0);
    this.prgBank = 0;
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqEnabled = false;
    this.irqPending = false;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000 && address < 0xC000) {
      return (this.prgBank % this.prgBanks) * 16384 + (address & 0x3FFF);
    } else if (address >= 0xC000) {
      // 最後一個 bank 固定
      return (this.prgBanks - 1) * 16384 + (address & 0x3FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    // Bandai FCG 有多種變體
    // FCG-1/FCG-2: 使用 $6000-$7FFF
    // LZ93D50: 使用 $8000-$FFFF
    
    let reg: number;
    
    if (address >= 0x6000 && address < 0x8000) {
      // FCG-1/FCG-2 變體
      reg = address & 0x000F;
    } else if (address >= 0x8000) {
      // LZ93D50 變體 (龍珠系列使用這個)
      reg = address & 0x000F;
    } else {
      return null;
    }
    
    if (reg < 8) {
      // CHR bank 暫存器 (0-7)
      this.chrBankRegs[reg] = data;
    } else if (reg === 8) {
      // PRG bank
      this.prgBank = data & 0x0F;
    } else if (reg === 9) {
      // 鏡像控制
      const mirror = data & 0x03;
      switch (mirror) {
        case 0: this.mirrorModeValue = MirrorMode.Vertical; break;
        case 1: this.mirrorModeValue = MirrorMode.Horizontal; break;
        case 2: this.mirrorModeValue = MirrorMode.SingleScreenLow; break;
        case 3: this.mirrorModeValue = MirrorMode.SingleScreenHigh; break;
      }
      return { mirrorMode: this.mirrorModeValue };
    } else if (reg === 0x0A) {
      // IRQ 控制
      this.irqEnabled = (data & 0x01) !== 0;
      this.irqCounter = this.irqLatch;
      this.irqPending = false;
    } else if (reg === 0x0B) {
      // IRQ latch 低位元
      this.irqLatch = (this.irqLatch & 0xFF00) | data;
    } else if (reg === 0x0C) {
      // IRQ latch 高位元
      this.irqLatch = (this.irqLatch & 0x00FF) | (data << 8);
    } else if (reg === 0x0D) {
      // EEPROM 控制 (某些變體)
      // 忽略此暫存器
    }
    
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      const region = address >> 10; // 1KB region (0-7)
      const totalChrBanks = Math.max(1, this.chrBanks * 8);
      const bank = this.chrBankRegs[region] % totalChrBanks;
      return bank * 1024 + (address & 0x3FF);
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }

  /**
   * Bandai FCG 使用 CPU 週期計時器，而非 scanline 計時器
   * IRQ 在每個 CPU 週期遞減計數器
   */
  cpuClock(): void {
    if (this.irqEnabled) {
      if (this.irqCounter === 0) {
        this.irqPending = true;
      } else {
        this.irqCounter--;
      }
    }
  }

  getIrqPending(): boolean {
    const pending = this.irqPending;
    this.irqPending = false;
    return pending;
  }
}

/**
 * Mapper 23 (VRC2b/VRC4)
 * 
 * Konami VRC 系列，用於魂斗羅等遊戲
 */
export class Mapper23 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  
  // Bank 暫存器
  private prgBank0: number = 0;
  private prgBank1: number = 0;
  private chrBankRegs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  
  // 控制
  private prgSwapMode: number = 0;
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;
  
  // IRQ (VRC4)
  private irqLatch: number = 0;
  private irqControl: number = 0;
  private irqCounter: number = 0;
  private irqPrescaler: number = 0;
  private irqEnabled: boolean = false;
  private irqPending: boolean = false;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank0 = 0;
    this.prgBank1 = 0;
    this.chrBankRegs.fill(0);
    this.prgSwapMode = 0;
    this.irqLatch = 0;
    this.irqControl = 0;
    this.irqCounter = 0;
    this.irqPrescaler = 0;
    this.irqEnabled = false;
    this.irqPending = false;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000 && address < 0xA000) {
      const bank = this.prgSwapMode ? (this.prgBanks * 2 - 2) : this.prgBank0;
      return (bank % (this.prgBanks * 2)) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xA000 && address < 0xC000) {
      return (this.prgBank1 % (this.prgBanks * 2)) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xC000 && address < 0xE000) {
      const bank = this.prgSwapMode ? this.prgBank0 : (this.prgBanks * 2 - 2);
      return (bank % (this.prgBanks * 2)) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xE000) {
      return (this.prgBanks * 2 - 1) * 8192 + (address & 0x1FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    // VRC2/VRC4 地址解碼
    const a0 = address & 0x0001;
    const a1 = (address & 0x0002) >> 1;
    const reg = (address & 0xF000) | (a1 << 1) | a0;

    switch (reg) {
      case 0x8000:
      case 0x8001:
      case 0x8002:
      case 0x8003:
        this.prgBank0 = data & 0x1F;
        break;

      case 0x9000:
      case 0x9001:
        const mirror = data & 0x03;
        switch (mirror) {
          case 0: this.mirrorModeValue = MirrorMode.Vertical; break;
          case 1: this.mirrorModeValue = MirrorMode.Horizontal; break;
          case 2: this.mirrorModeValue = MirrorMode.SingleScreenLow; break;
          case 3: this.mirrorModeValue = MirrorMode.SingleScreenHigh; break;
        }
        return { mirrorMode: this.mirrorModeValue };

      case 0x9002:
      case 0x9003:
        this.prgSwapMode = (data >> 1) & 0x01;
        break;

      case 0xA000:
      case 0xA001:
      case 0xA002:
      case 0xA003:
        this.prgBank1 = data & 0x1F;
        break;

      // CHR banks (1KB 切換)
      case 0xB000: this.chrBankRegs[0] = (this.chrBankRegs[0] & 0xF0) | (data & 0x0F); break;
      case 0xB001: this.chrBankRegs[0] = (this.chrBankRegs[0] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xB002: this.chrBankRegs[1] = (this.chrBankRegs[1] & 0xF0) | (data & 0x0F); break;
      case 0xB003: this.chrBankRegs[1] = (this.chrBankRegs[1] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xC000: this.chrBankRegs[2] = (this.chrBankRegs[2] & 0xF0) | (data & 0x0F); break;
      case 0xC001: this.chrBankRegs[2] = (this.chrBankRegs[2] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xC002: this.chrBankRegs[3] = (this.chrBankRegs[3] & 0xF0) | (data & 0x0F); break;
      case 0xC003: this.chrBankRegs[3] = (this.chrBankRegs[3] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xD000: this.chrBankRegs[4] = (this.chrBankRegs[4] & 0xF0) | (data & 0x0F); break;
      case 0xD001: this.chrBankRegs[4] = (this.chrBankRegs[4] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xD002: this.chrBankRegs[5] = (this.chrBankRegs[5] & 0xF0) | (data & 0x0F); break;
      case 0xD003: this.chrBankRegs[5] = (this.chrBankRegs[5] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xE000: this.chrBankRegs[6] = (this.chrBankRegs[6] & 0xF0) | (data & 0x0F); break;
      case 0xE001: this.chrBankRegs[6] = (this.chrBankRegs[6] & 0x0F) | ((data & 0x0F) << 4); break;
      case 0xE002: this.chrBankRegs[7] = (this.chrBankRegs[7] & 0xF0) | (data & 0x0F); break;
      case 0xE003: this.chrBankRegs[7] = (this.chrBankRegs[7] & 0x0F) | ((data & 0x0F) << 4); break;

      // IRQ (VRC4)
      case 0xF000:
        this.irqLatch = (this.irqLatch & 0xF0) | (data & 0x0F);
        break;
      case 0xF001:
        this.irqLatch = (this.irqLatch & 0x0F) | ((data & 0x0F) << 4);
        break;
      case 0xF002:
        this.irqControl = data;
        this.irqEnabled = (data & 0x02) !== 0;
        if (data & 0x02) {
          this.irqCounter = this.irqLatch;
          this.irqPrescaler = 341;
        }
        this.irqPending = false;
        break;
      case 0xF003:
        this.irqEnabled = (this.irqControl & 0x01) !== 0;
        this.irqPending = false;
        break;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      const region = address >> 10; // 1KB region
      const bank = this.chrBankRegs[region];
      const totalChrBanks = this.chrBanks * 8; // 以 1KB 為單位
      return (bank % totalChrBanks) * 1024 + (address & 0x3FF);
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }

  scanline(): void {
    if (this.irqEnabled) {
      this.irqPrescaler -= 3;
      if (this.irqPrescaler <= 0) {
        this.irqPrescaler += 341;
        if (this.irqCounter === 0xFF) {
          this.irqCounter = this.irqLatch;
          this.irqPending = true;
        } else {
          this.irqCounter++;
        }
      }
    }
  }

  getIrqPending(): boolean {
    const pending = this.irqPending;
    this.irqPending = false;
    return pending;
  }
}

/**
 * Mapper 66 (GxROM)
 * 
 * 簡單的 PRG/CHR 切換
 */
export class Mapper66 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private chrBank: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.chrBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      return (this.prgBank % this.prgBanks) * 32768 + (address & 0x7FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.chrBank = data & 0x03;
      this.prgBank = (data >> 4) & 0x03;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return (this.chrBank % Math.max(1, this.chrBanks)) * 8192 + address;
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }
}

/**
 * Mapper 71 (Camerica/Codemasters)
 * 
 * 用於 Camerica 和 Codemasters 遊戲
 */
export class Mapper71 implements Mapper {
  private prgBanks: number;
  private selectedBank: number = 0;
  private mirrorModeValue: MirrorMode = MirrorMode.Horizontal;

  constructor(prgBanks: number, _chrBanks: number) {
    this.prgBanks = prgBanks;
  }

  reset(): void {
    this.selectedBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000 && address < 0xC000) {
      return this.selectedBank * 16384 + (address & 0x3FFF);
    } else if (address >= 0xC000) {
      return (this.prgBanks - 1) * 16384 + (address & 0x3FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x9000 && address < 0xA000) {
      // 鏡像控制 (部分變體)
      this.mirrorModeValue = (data & 0x10) ? MirrorMode.SingleScreenHigh : MirrorMode.SingleScreenLow;
      return { mirrorMode: this.mirrorModeValue };
    } else if (address >= 0xC000) {
      this.selectedBank = data & 0x0F;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address; // CHR RAM
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
 * Mapper 15 (100-in-1 Contra Function 16)
 * 
 * 用於 100 合 1 多遊戲卡帶
 */
export class Mapper15 implements Mapper {
  private prgBanks: number;
  private prgBank: number = 0;
  private prgMode: number = 0;
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, _chrBanks: number) {
    this.prgBanks = prgBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.prgMode = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const bank8k = this.prgBank * 2;
      const totalBanks = this.prgBanks * 2; // 8KB banks

      switch (this.prgMode) {
        case 0: // 32KB mode
          return ((bank8k & ~3) % totalBanks) * 8192 + (address & 0x7FFF);
        case 1: // 128KB mode (mirror $8000-$BFFF)
          if (address < 0xC000) {
            return (bank8k % totalBanks) * 8192 + (address & 0x3FFF);
          } else {
            return ((bank8k | 1) % totalBanks) * 8192 + (address & 0x3FFF);
          }
        case 2: // 8KB mode
          return (bank8k % totalBanks) * 8192 + (address & 0x1FFF);
        case 3: // 16KB mode
        default:
          if (address < 0xC000) {
            return (bank8k % totalBanks) * 8192 + (address & 0x3FFF);
          } else {
            return ((bank8k | 1) % totalBanks) * 8192 + (address & 0x3FFF);
          }
      }
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      this.prgMode = address & 0x03;
      this.prgBank = ((data & 0x3F) | ((data & 0x80) >> 1));
      this.mirrorModeValue = (data & 0x40) ? MirrorMode.Horizontal : MirrorMode.Vertical;
      return { mirrorMode: this.mirrorModeValue };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address; // CHR RAM
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
 * Mapper 113 (NINA-03/06 / Sachen / Hacker / HES)
 * 
 * 用於台灣麻將等遊戲
 */
export class Mapper113 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private chrBank: number = 0;
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.chrBank = 0;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      return (this.prgBank % this.prgBanks) * 32768 + (address & 0x7FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x4100 && address < 0x6000) {
      // $4100-$5FFF
      this.prgBank = (data >> 3) & 0x07;
      this.chrBank = ((data & 0x07) | ((data >> 3) & 0x08));
      this.mirrorModeValue = (data & 0x80) ? MirrorMode.Vertical : MirrorMode.Horizontal;
      return { mirrorMode: this.mirrorModeValue };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      const totalChrBanks = Math.max(1, this.chrBanks);
      return (this.chrBank % totalChrBanks) * 8192 + address;
    }
    return null;
  }

  ppuMapWrite(_address: number): number | null {
    return null;
  }
}

/**
 * Mapper 202
 * 
 * 用於 150合1 等合集卡帶
 * 簡單的 PRG/CHR bank 切換
 */
export class Mapper202 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private chrBank: number = 0;
  private prgMode: number = 0; // 0 = 32KB, 1 = 16KB
  private mirrorMode: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.chrBank = 0;
    this.prgMode = 0;
    this.mirrorMode = MirrorMode.Vertical;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const totalPrgSize = this.prgBanks * 16384;
      
      if (this.prgMode === 0) {
        // 16KB 模式 (鏡像)
        const offset = address & 0x3FFF;
        return ((this.prgBank * 16384) + offset) % totalPrgSize;
      } else {
        // 32KB 模式
        const bank32k = this.prgBank >> 1;
        const offset = address & 0x7FFF;
        return ((bank32k * 32768) + offset) % totalPrgSize;
      }
    }
    return null;
  }

  cpuMapWrite(address: number, _data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      // $8000-$FFFF: Bank 選擇
      // 地址的低位決定 bank
      const bank = (address >> 1) & 0x07;
      this.prgBank = bank;
      this.chrBank = bank;
      this.prgMode = (address & 0x01) ^ ((address >> 3) & 0x01);
      this.mirrorMode = (address & 0x01) ? MirrorMode.Horizontal : MirrorMode.Vertical;
      
      return { mirrorMode: this.mirrorMode };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      if (this.chrBanks === 0) {
        return address; // CHR RAM
      }
      const totalChrSize = this.chrBanks * 8192;
      return ((this.chrBank * 8192) + (address & 0x1FFF)) % totalChrSize;
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      return address; // CHR RAM
    }
    return null;
  }
}

/**
 * Mapper 245 (Waixing MMC3 variant)
 * 
 * 類似 MMC3 但有額外的 CHR RAM 控制
 * 用於一些中文版遊戲
 */
export class Mapper245 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  
  // Bank 暫存器
  private bankRegs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private bankSelect: number = 0;
  
  // 鏡像
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;
  
  // IRQ (與 MMC3 類似)
  private irqCounter: number = 0;
  private irqLatch: number = 0;
  private irqEnabled: boolean = false;
  private irqReload: boolean = false;
  private irqPending: boolean = false;

  // 額外的 PRG 控制
  private prgHighBit: number = 0;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.bankRegs.fill(0);
    this.bankSelect = 0;
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqEnabled = false;
    this.irqReload = false;
    this.irqPending = false;
    this.prgHighBit = 0;
  }

  cpuMapRead(address: number): number | null {
    const prgBankCount = this.prgBanks * 2; // 8KB banks
    
    if (address >= 0x8000 && address < 0xA000) {
      const bank = (this.bankSelect & 0x40) 
        ? (prgBankCount - 2) 
        : ((this.bankRegs[6] | this.prgHighBit) % prgBankCount);
      return bank * 8192 + (address & 0x1FFF);
    } else if (address >= 0xA000 && address < 0xC000) {
      const bank = (this.bankRegs[7] | this.prgHighBit) % prgBankCount;
      return bank * 8192 + (address & 0x1FFF);
    } else if (address >= 0xC000 && address < 0xE000) {
      const bank = (this.bankSelect & 0x40)
        ? ((this.bankRegs[6] | this.prgHighBit) % prgBankCount)
        : (prgBankCount - 2);
      return bank * 8192 + (address & 0x1FFF);
    } else if (address >= 0xE000) {
      return (prgBankCount - 1) * 8192 + (address & 0x1FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    if (address >= 0x8000 && address < 0xA000) {
      if (address & 1) {
        // Bank data
        const reg = this.bankSelect & 0x07;
        this.bankRegs[reg] = data;
        // R0 控制 PRG 高位
        if (reg === 0) {
          this.prgHighBit = (data & 0x02) ? 0x40 : 0;
        }
      } else {
        // Bank select
        this.bankSelect = data;
      }
    } else if (address >= 0xA000 && address < 0xC000) {
      if (!(address & 1)) {
        // 鏡像
        this.mirrorModeValue = (data & 0x01) ? MirrorMode.Horizontal : MirrorMode.Vertical;
        return { mirrorMode: this.mirrorModeValue };
      }
    } else if (address >= 0xC000 && address < 0xE000) {
      if (address & 1) {
        this.irqReload = true;
      } else {
        this.irqLatch = data;
      }
    } else if (address >= 0xE000) {
      if (address & 1) {
        this.irqEnabled = true;
      } else {
        this.irqEnabled = false;
        this.irqPending = false;
      }
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      // CHR RAM
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

  scanline(): void {
    if (this.irqReload || this.irqCounter === 0) {
      this.irqCounter = this.irqLatch;
      this.irqReload = false;
    } else {
      this.irqCounter--;
    }
    
    if (this.irqCounter === 0 && this.irqEnabled) {
      this.irqPending = true;
    }
  }

  getIrqPending(): boolean {
    const pending = this.irqPending;
    this.irqPending = false;
    return pending;
  }
}

/**
 * Mapper 253 (Waixing VRC4 variant)
 * 
 * 類似 VRC4 的中國變體
 * 用於龍珠等遊戲
 */
export class Mapper253 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  
  // Bank 暫存器
  private prgBank0: number = 0;
  private prgBank1: number = 0;
  private chrBankRegs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private chrBankHigh: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  
  // 鏡像
  private mirrorModeValue: MirrorMode = MirrorMode.Vertical;
  
  // IRQ
  private irqLatch: number = 0;
  private irqControl: number = 0;
  private irqCounter: number = 0;
  private irqEnabled: boolean = false;
  private irqPending: boolean = false;
  private irqPrescaler: number = 0;

  // VRAM 控制
  private vramEnable: boolean = false;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank0 = 0;
    this.prgBank1 = 0;
    this.chrBankRegs.fill(0);
    this.chrBankHigh.fill(0);
    this.irqLatch = 0;
    this.irqControl = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.irqPrescaler = 0;
    this.vramEnable = false;
  }

  cpuMapRead(address: number): number | null {
    const prgBankCount = this.prgBanks * 2;
    
    if (address >= 0x8000 && address < 0xA000) {
      return (this.prgBank0 % prgBankCount) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xA000 && address < 0xC000) {
      return (this.prgBank1 % prgBankCount) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xC000 && address < 0xE000) {
      return (prgBankCount - 2) * 8192 + (address & 0x1FFF);
    } else if (address >= 0xE000) {
      return (prgBankCount - 1) * 8192 + (address & 0x1FFF);
    }
    return null;
  }

  cpuMapWrite(address: number, data: number): MapperWriteResult | null {
    const addr = address & 0xF00C;
    
    switch (addr) {
      case 0x8000:
      case 0x8004:
      case 0x8008:
      case 0x800C:
        this.prgBank0 = data;
        break;
        
      case 0x9000:
        this.mirrorModeValue = (data & 0x01) ? MirrorMode.Horizontal : MirrorMode.Vertical;
        return { mirrorMode: this.mirrorModeValue };
        
      case 0xA000:
      case 0xA004:
      case 0xA008:
      case 0xA00C:
        this.prgBank1 = data;
        break;
        
      case 0xB000:
        this.chrBankRegs[0] = (this.chrBankRegs[0] & 0xF0) | (data & 0x0F);
        break;
      case 0xB004:
        this.chrBankRegs[0] = (this.chrBankRegs[0] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[0] = data & 0x10;
        break;
      case 0xB008:
        this.chrBankRegs[1] = (this.chrBankRegs[1] & 0xF0) | (data & 0x0F);
        break;
      case 0xB00C:
        this.chrBankRegs[1] = (this.chrBankRegs[1] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[1] = data & 0x10;
        break;
        
      case 0xC000:
        this.chrBankRegs[2] = (this.chrBankRegs[2] & 0xF0) | (data & 0x0F);
        break;
      case 0xC004:
        this.chrBankRegs[2] = (this.chrBankRegs[2] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[2] = data & 0x10;
        break;
      case 0xC008:
        this.chrBankRegs[3] = (this.chrBankRegs[3] & 0xF0) | (data & 0x0F);
        break;
      case 0xC00C:
        this.chrBankRegs[3] = (this.chrBankRegs[3] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[3] = data & 0x10;
        break;
        
      case 0xD000:
        this.chrBankRegs[4] = (this.chrBankRegs[4] & 0xF0) | (data & 0x0F);
        break;
      case 0xD004:
        this.chrBankRegs[4] = (this.chrBankRegs[4] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[4] = data & 0x10;
        break;
      case 0xD008:
        this.chrBankRegs[5] = (this.chrBankRegs[5] & 0xF0) | (data & 0x0F);
        break;
      case 0xD00C:
        this.chrBankRegs[5] = (this.chrBankRegs[5] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[5] = data & 0x10;
        break;
        
      case 0xE000:
        this.chrBankRegs[6] = (this.chrBankRegs[6] & 0xF0) | (data & 0x0F);
        break;
      case 0xE004:
        this.chrBankRegs[6] = (this.chrBankRegs[6] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[6] = data & 0x10;
        break;
      case 0xE008:
        this.chrBankRegs[7] = (this.chrBankRegs[7] & 0xF0) | (data & 0x0F);
        break;
      case 0xE00C:
        this.chrBankRegs[7] = (this.chrBankRegs[7] & 0x0F) | ((data & 0x0F) << 4);
        this.chrBankHigh[7] = data & 0x10;
        break;
        
      case 0xF000:
        this.irqLatch = (this.irqLatch & 0xF0) | (data & 0x0F);
        break;
      case 0xF004:
        this.irqLatch = (this.irqLatch & 0x0F) | ((data & 0x0F) << 4);
        break;
      case 0xF008:
        this.irqControl = data;
        this.irqEnabled = (data & 0x02) !== 0;
        if (data & 0x02) {
          this.irqCounter = this.irqLatch;
          this.irqPrescaler = 341;
        }
        this.irqPending = false;
        break;
      case 0xF00C:
        this.irqEnabled = (this.irqControl & 0x01) !== 0;
        this.irqPending = false;
        break;
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      const region = address >> 10;
      const bank = this.chrBankRegs[region] | (this.chrBankHigh[region] ? 0x100 : 0);
      
      // 如果沒有 CHR ROM，使用 CHR RAM
      if (this.chrBanks === 0) {
        return address;
      }
      
      const totalChrBanks = this.chrBanks * 8;
      return (bank % totalChrBanks) * 1024 + (address & 0x3FF);
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      return address; // CHR RAM
    }
    return null;
  }

  scanline(): void {
    if (this.irqEnabled) {
      this.irqPrescaler -= 3;
      if (this.irqPrescaler <= 0) {
        this.irqPrescaler += 341;
        if (this.irqCounter === 0xFF) {
          this.irqCounter = this.irqLatch;
          this.irqPending = true;
        } else {
          this.irqCounter++;
        }
      }
    }
  }

  getIrqPending(): boolean {
    const pending = this.irqPending;
    this.irqPending = false;
    return pending;
  }
}

/**
 * Mapper 225
 * 
 * 用於 52合1、64合1、72合1 等合集卡帶
 * 支援高達 2MB PRG ROM 和 1MB CHR ROM
 */
export class Mapper225 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private chrBank: number = 0;
  private prgMode: number = 0; // 0 = 32KB, 1 = 16KB
  private mirrorMode: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.chrBank = 0;
    this.prgMode = 0;
    this.mirrorMode = MirrorMode.Vertical;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const totalPrgSize = this.prgBanks * 16384; // PRG ROM 總大小
      
      if (this.prgMode === 0) {
        // 32KB 模式
        const bank32k = this.prgBank >> 1;
        const offset = address & 0x7FFF;
        return ((bank32k * 32768) + offset) % totalPrgSize;
      } else {
        // 16KB 模式
        const offset = address & 0x3FFF;
        return ((this.prgBank * 16384) + offset) % totalPrgSize;
      }
    }
    return null;
  }

  cpuMapWrite(address: number, _data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      // $8000-$FFFF: Bank 選擇
      // A0-A5: PRG bank
      // A6: PRG mode (0=32KB, 1=16KB)
      // A7: Mirroring (0=vertical, 1=horizontal)
      // A8-A13: CHR bank
      // A14: High PRG bit (512KB boundary)
      
      this.prgBank = (address & 0x3F) | ((address >> 8) & 0x40);
      this.prgMode = (address >> 6) & 1;
      this.chrBank = ((address >> 8) & 0x3F);
      this.mirrorMode = (address & 0x80) ? MirrorMode.Horizontal : MirrorMode.Vertical;
      
      return { mirrorMode: this.mirrorMode };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      if (this.chrBanks === 0) {
        return address; // CHR RAM
      }
      const totalChrSize = this.chrBanks * 8192;
      return ((this.chrBank * 8192) + (address & 0x1FFF)) % totalChrSize;
    }
    return null;
  }

  ppuMapWrite(address: number): number | null {
    if (address < 0x2000 && this.chrBanks === 0) {
      return address; // CHR RAM
    }
    return null;
  }
}

/**
 * Mapper 227
 * 
 * 用於 1200合1 等合集卡帶
 * 支援高達 1MB PRG ROM (無 CHR ROM，使用 CHR RAM)
 */
export class Mapper227 implements Mapper {
  private prgBanks: number;
  private chrBanks: number;
  private prgBank: number = 0;
  private prgMode: number = 0; // 0 = 32KB, 1 = 16KB
  private lastBank: boolean = false;
  private mirrorMode: MirrorMode = MirrorMode.Vertical;

  constructor(prgBanks: number, chrBanks: number) {
    this.prgBanks = prgBanks;
    this.chrBanks = chrBanks;
  }

  reset(): void {
    this.prgBank = 0;
    this.prgMode = 0;
    this.lastBank = false;
    this.mirrorMode = MirrorMode.Vertical;
  }

  cpuMapRead(address: number): number | null {
    if (address >= 0x8000) {
      const totalPrgSize = this.prgBanks * 16384;
      
      if (this.prgMode === 0) {
        // 32KB 模式
        const offset = address & 0x7FFF;
        const bank32k = this.prgBank >> 1;
        return ((bank32k * 32768) + offset) % totalPrgSize;
      } else {
        // 16KB 模式
        const offset = address & 0x3FFF;
        if (address >= 0xC000) {
          if (this.lastBank) {
            // $C000-$FFFF 映射到最後一個 bank
            const lastBankStart = totalPrgSize - 16384;
            return lastBankStart + offset;
          } else {
            // $C000-$FFFF 鏡像 $8000-$BFFF
            return ((this.prgBank * 16384) + offset) % totalPrgSize;
          }
        }
        return ((this.prgBank * 16384) + offset) % totalPrgSize;
      }
    }
    return null;
  }

  cpuMapWrite(address: number, _data: number): MapperWriteResult | null {
    if (address >= 0x8000) {
      // $8000-$FFFF: Bank 選擇
      // A0: PRG mode (0=32KB, 1=16KB)
      // A1: Mirroring (0=vertical, 1=horizontal)
      // A2-A6: PRG bank low bits
      // A7: Last bank select (16KB mode only)
      // A8-A9: PRG bank high bits
      
      this.prgMode = address & 0x01;
      this.mirrorMode = (address & 0x02) ? MirrorMode.Horizontal : MirrorMode.Vertical;
      this.prgBank = ((address >> 2) & 0x1F) | ((address >> 3) & 0x60);
      this.lastBank = (address & 0x80) !== 0;
      
      return { mirrorMode: this.mirrorMode };
    }
    return null;
  }

  ppuMapRead(address: number): number | null {
    if (address < 0x2000) {
      return address; // CHR RAM
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
    case 7:
      return new Mapper7(prgBanks, chrBanks);
    case 11:
      return new Mapper11(prgBanks, chrBanks);
    case 15:
      return new Mapper15(prgBanks, chrBanks);
    case 16:
      return new Mapper16(prgBanks, chrBanks);
    case 23:
      return new Mapper23(prgBanks, chrBanks);
    case 66:
      return new Mapper66(prgBanks, chrBanks);
    case 71:
      return new Mapper71(prgBanks, chrBanks);
    case 113:
      return new Mapper113(prgBanks, chrBanks);
    case 202:
      return new Mapper202(prgBanks, chrBanks);
    case 225:
      return new Mapper225(prgBanks, chrBanks);
    case 227:
      return new Mapper227(prgBanks, chrBanks);
    case 245:
      return new Mapper245(prgBanks, chrBanks);
    case 253:
      return new Mapper253(prgBanks, chrBanks);
    default:
      console.warn(`未實作的 Mapper: ${mapperNumber}`);
      return null;
  }
}
