/**
 * NES 卡帶模組
 * 
 * iNES 格式說明：
 * - Header (16 bytes)
 *   - Bytes 0-3: "NES" + 0x1A
 *   - Byte 4: PRG ROM 大小 (16KB 為單位)
 *   - Byte 5: CHR ROM 大小 (8KB 為單位)
 *   - Byte 6: Flags 6 (mapper 低 4 位元, 鏡像模式等)
 *   - Byte 7: Flags 7 (mapper 高 4 位元, NES 2.0 標識)
 *   - Bytes 8-15: 其他標誌
 * - Trainer (512 bytes, 可選)
 * - PRG ROM
 * - CHR ROM
 */

import { Mapper, createMapper } from '../mappers';

/**
 * 鏡像模式
 */
export enum MirrorMode {
  /** 水平鏡像 (垂直排列) */
  Horizontal = 0,
  /** 垂直鏡像 (水平排列) */
  Vertical = 1,
  /** 單螢幕 (低) */
  SingleScreenLow = 2,
  /** 單螢幕 (高) */
  SingleScreenHigh = 3,
  /** 四螢幕 */
  FourScreen = 4,
}

/**
 * 卡帶標頭資訊
 */
export interface CartridgeHeader {
  /** PRG ROM 大小 (位元組) */
  prgRomSize: number;
  /** CHR ROM 大小 (位元組) */
  chrRomSize: number;
  /** Mapper 編號 */
  mapperNumber: number;
  /** 鏡像模式 */
  mirrorMode: MirrorMode;
  /** 是否有電池備份 */
  hasBattery: boolean;
  /** 是否有 Trainer */
  hasTrainer: boolean;
  /** 是否為 NES 2.0 格式 */
  isNes2: boolean;
}

/**
 * 卡帶類別
 */
export class Cartridge {
  /** PRG ROM 資料 */
  private prgRom: Uint8Array = new Uint8Array(0);
  
  /** CHR ROM 資料 (如果為 0 則使用 CHR RAM) */
  private chrRom: Uint8Array = new Uint8Array(0);
  
  /** PRG RAM (8KB) */
  private prgRam: Uint8Array = new Uint8Array(8192);
  
  /** CHR RAM (如果卡帶無 CHR ROM) */
  private chrRam: Uint8Array = new Uint8Array(8192);
  
  /** 是否使用 CHR RAM */
  private usesChrRam: boolean = false;
  
  /** 卡帶標頭資訊 */
  private header: CartridgeHeader | null = null;
  
  /** Mapper */
  private mapper: Mapper | null = null;
  
  /** 鏡像模式 */
  private mirrorMode: MirrorMode = MirrorMode.Horizontal;

  constructor() {
    this.prgRam.fill(0);
    this.chrRam.fill(0);
  }

  /**
   * 從 ArrayBuffer 載入 ROM
   */
  public loadRom(data: ArrayBuffer): boolean {
    const bytes = new Uint8Array(data);
    
    // 驗證 iNES 標頭
    if (bytes[0] !== 0x4E || bytes[1] !== 0x45 ||
        bytes[2] !== 0x53 || bytes[3] !== 0x1A) {
      console.error('無效的 iNES 標頭');
      return false;
    }

    // 解析標頭
    const prgRomBanks = bytes[4];
    const chrRomBanks = bytes[5];
    const flags6 = bytes[6];
    const flags7 = bytes[7];

    this.header = {
      prgRomSize: prgRomBanks * 16384,
      chrRomSize: chrRomBanks * 8192,
      mapperNumber: ((flags6 >> 4) & 0x0F) | (flags7 & 0xF0),
      mirrorMode: (flags6 & 0x01) ? MirrorMode.Vertical : MirrorMode.Horizontal,
      hasBattery: (flags6 & 0x02) !== 0,
      hasTrainer: (flags6 & 0x04) !== 0,
      isNes2: (flags7 & 0x0C) === 0x08,
    };

    // 四螢幕模式覆蓋
    if (flags6 & 0x08) {
      this.header.mirrorMode = MirrorMode.FourScreen;
    }

    this.mirrorMode = this.header.mirrorMode;

    // 計算 ROM 資料偏移
    let offset = 16;
    if (this.header.hasTrainer) {
      offset += 512;
    }

    // 載入 PRG ROM
    this.prgRom = new Uint8Array(this.header.prgRomSize);
    this.prgRom.set(bytes.slice(offset, offset + this.header.prgRomSize));
    offset += this.header.prgRomSize;

    // 載入 CHR ROM 或使用 CHR RAM
    if (this.header.chrRomSize > 0) {
      this.chrRom = new Uint8Array(this.header.chrRomSize);
      this.chrRom.set(bytes.slice(offset, offset + this.header.chrRomSize));
      this.usesChrRam = false;
    } else {
      // 使用 CHR RAM
      this.chrRam = new Uint8Array(8192);
      this.chrRam.fill(0);
      this.usesChrRam = true;
    }

    // 建立 Mapper
    this.mapper = createMapper(
      this.header.mapperNumber,
      prgRomBanks,
      chrRomBanks
    );

    if (!this.mapper) {
      console.error(`不支援的 Mapper: ${this.header.mapperNumber}`);
      return false;
    }

    console.log(`ROM 載入成功:`);
    console.log(`  PRG ROM: ${this.header.prgRomSize / 1024}KB`);
    console.log(`  CHR ROM: ${this.header.chrRomSize / 1024}KB`);
    console.log(`  Mapper: ${this.header.mapperNumber}`);
    console.log(`  鏡像: ${MirrorMode[this.header.mirrorMode]}`);

    return true;
  }

  /**
   * CPU 讀取
   */
  public cpuRead(address: number): number {
    // PRG RAM ($6000-$7FFF)
    if (address >= 0x6000 && address < 0x8000) {
      return this.prgRam[address & 0x1FFF];
    }

    // PRG ROM ($8000-$FFFF)
    if (address >= 0x8000 && this.mapper) {
      const mappedAddr = this.mapper.cpuMapRead(address);
      if (mappedAddr !== null) {
        return this.prgRom[mappedAddr % this.prgRom.length];
      }
    }

    return 0;
  }

  /**
   * CPU 寫入
   */
  public cpuWrite(address: number, data: number): void {
    // PRG RAM ($6000-$7FFF)
    if (address >= 0x6000 && address < 0x8000) {
      this.prgRam[address & 0x1FFF] = data;
      return;
    }

    // Mapper 暫存器寫入
    if (address >= 0x8000 && this.mapper) {
      const result = this.mapper.cpuMapWrite(address, data);
      
      // 檢查鏡像模式是否改變
      if (result?.mirrorMode !== undefined) {
        this.mirrorMode = result.mirrorMode;
      }
    }
  }

  /**
   * PPU 讀取
   */
  public ppuRead(address: number): number {
    if (address < 0x2000) {
      if (this.mapper) {
        const mappedAddr = this.mapper.ppuMapRead(address);
        if (mappedAddr !== null) {
          if (this.usesChrRam) {
            return this.chrRam[mappedAddr % this.chrRam.length];
          } else {
            return this.chrRom[mappedAddr % this.chrRom.length];
          }
        }
      }
      
      // 直接存取
      if (this.usesChrRam) {
        return this.chrRam[address];
      } else {
        return this.chrRom[address % this.chrRom.length];
      }
    }
    return 0;
  }

  /**
   * PPU 寫入
   */
  public ppuWrite(address: number, data: number): void {
    if (address < 0x2000) {
      if (this.mapper) {
        const mappedAddr = this.mapper.ppuMapWrite(address);
        if (mappedAddr !== null && this.usesChrRam) {
          this.chrRam[mappedAddr % this.chrRam.length] = data;
          return;
        }
      }
      
      // 直接寫入 CHR RAM
      if (this.usesChrRam) {
        this.chrRam[address] = data;
      }
    }
  }

  /**
   * 取得鏡像模式
   */
  public getMirrorMode(): MirrorMode {
    return this.mirrorMode;
  }

  /**
   * 取得卡帶標頭資訊
   */
  public getHeader(): CartridgeHeader | null {
    return this.header;
  }

  /**
   * 重置卡帶
   */
  public reset(): void {
    this.mapper?.reset?.();
  }

  /**
   * 掃描線計數 (用於 MMC3 等 Mapper)
   */
  public scanline(): void {
    this.mapper?.scanline?.();
  }

  /**
   * CPU 週期計數 (用於 Bandai FCG 等 Mapper)
   */
  public cpuClock(): void {
    this.mapper?.cpuClock?.();
  }

  /**
   * 檢查 Mapper IRQ
   */
  public checkIrq(): boolean {
    if (this.mapper && 'getIrqPending' in this.mapper) {
      return (this.mapper as any).getIrqPending();
    }
    return false;
  }

  // ===== 序列化 (存檔) =====

  /** 儲存狀態 */
  public saveState(): object {
    return {
      prgRam: Array.from(this.prgRam),
      chrRam: this.usesChrRam ? Array.from(this.chrRam) : [],
      mirrorMode: this.mirrorMode,
    };
  }

  /** 載入狀態 */
  public loadState(state: any): void {
    this.prgRam.set(state.prgRam);
    if (this.usesChrRam && state.chrRam.length > 0) {
      this.chrRam.set(state.chrRam);
    }
    this.mirrorMode = state.mirrorMode;
  }
}
